import { prisma, type TenantPayout } from "@mashupkgrid/database";
import { env } from "@mashupkgrid/config";
import { decryptAtRest, ConflictError, NotFoundError, ValidationError } from "@mashupkgrid/shared";
import { initiateB2BPayment } from "./mpesa/daraja-client.js";
import { getPlatformMpesaCredentials } from "./mpesa/platform-config.service.js";
import { getTenantBalance, debitTenantForPayout, listTenantsWithBalance } from "./ledger.service.js";

const SINGLETON_ID = "platform";

/**
 * Sending tenants the money this platform collected on their behalf.
 *
 * The ordering here is deliberate and is the whole risk of the feature. A payout row is created
 * and the ledger DEBITED before Daraja is called, so two concurrent payout runs cannot both see
 * the same balance and pay it out twice. If the call then fails, the payout is marked FAILED and
 * the debit removed — briefly understating a balance is safe, paying twice is not.
 */

async function getInitiator(): Promise<{ initiatorName: string; securityCredential: string }> {
  const config = await prisma.platformMpesaConfig.findUnique({ where: { id: SINGLETON_ID } });
  if (!config?.initiatorName || !config.initiatorCredentialEncrypted) {
    throw new ValidationError(
      "B2B initiator is not configured — set the initiator name and security credential on the platform M-Pesa settings before running payouts."
    );
  }
  return {
    initiatorName: config.initiatorName,
    securityCredential: decryptAtRest(config.initiatorCredentialEncrypted, env.ENCRYPTION_KEY),
  };
}

/** Daraja posts the real outcome to these; see the payout routes in apps/api's mpesa router. */
function payoutCallbackUrls(): { resultUrl: string; queueTimeoutUrl: string } {
  const base = `${env.APP_API_PUBLIC_URL}/api/v1/payments/mpesa/payout`;
  const token = env.MPESA_CALLBACK_TOKEN
    ? `?token=${encodeURIComponent(env.MPESA_CALLBACK_TOKEN)}`
    : "";
  return { resultUrl: `${base}/result${token}`, queueTimeoutUrl: `${base}/timeout${token}` };
}

export async function payoutTenantBalance(tenantId: string): Promise<TenantPayout> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new NotFoundError("Tenant");
  if (tenant.collectionMode !== "PLATFORM") {
    throw new ConflictError(
      `"${tenant.name}" collects its own payments — this platform holds no money for them.`
    );
  }
  if (!tenant.payoutShortcode) {
    throw new ValidationError(`"${tenant.name}" has no payout paybill or till number set.`);
  }

  const balance = await getTenantBalance(tenantId);

  // M-Pesa moves whole shillings only. Rounding a balance to the nearest shilling would either
  // overpay (KES 1.50 becoming 2) or send nothing at all, so only the whole-shilling part is
  // sent and the remaining cents stay on the ledger for the next run. Nothing is lost — a
  // tenant's odd cents accumulate until they make up a shilling, and the balance they see always
  // equals what they are actually owed.
  const payableMinor = Math.floor(balance.balanceMinor / 100) * 100;
  if (payableMinor <= 0) {
    throw new ConflictError(
      `"${tenant.name}" is owed less than one shilling — it will be sent once it reaches KES 1.`
    );
  }

  const destinationType = tenant.payoutShortcodeType === "TILL" ? "TILL" : "PAYBILL";

  // Reserve the money first: the debit and the payout row are written together, so a second run
  // cannot see this balance as still available.
  const payout = await prisma.$transaction(async (tx) => {
    const created = await tx.tenantPayout.create({
      data: {
        tenantId,
        amountMinor: payableMinor,
        currency: balance.currency,
        destinationShortcode: tenant.payoutShortcode as string,
        destinationType,
        status: "PENDING",
      },
    });
    await debitTenantForPayout(tx, {
      tenantId,
      payoutId: created.id,
      amountMinor: created.amountMinor,
      currency: created.currency,
    });
    return created;
  });

  try {
    const [credentials, initiator] = await Promise.all([
      getPlatformMpesaCredentials(),
      getInitiator(),
    ]);
    const { resultUrl, queueTimeoutUrl } = payoutCallbackUrls();

    const response = await initiateB2BPayment({
      credentials,
      initiatorName: initiator.initiatorName,
      securityCredential: initiator.securityCredential,
      destinationShortcode: payout.destinationShortcode,
      destinationType,
      amountMinor: payout.amountMinor,
      accountReference: tenant.slug,
      remarks: `Settlement for ${tenant.name}`,
      resultUrl,
      queueTimeoutUrl,
    });

    // ResponseCode 0 means Safaricom ACCEPTED the instruction, not that the money arrived. Only
    // the result callback can say that, so this stays PROCESSING rather than COMPLETED.
    return prisma.tenantPayout.update({
      where: { id: payout.id },
      data: {
        status: "PROCESSING",
        conversationId: response.ConversationID,
        originatorConversationId: response.OriginatorConversationID,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Daraja never accepted it, so nothing left this platform: give the balance back.
    await prisma.$transaction(async (tx) => {
      await tx.tenantPayout.update({
        where: { id: payout.id },
        data: { status: "FAILED", failureReason: message.slice(0, 500) },
      });
      await tx.tenantLedgerEntry.deleteMany({
        where: { sourceType: "TenantPayout", sourceId: payout.id },
      });
    });
    throw err;
  }
}

export interface PayoutRunResult {
  attempted: number;
  accepted: number;
  failed: number;
}

/** Pays every tenant currently owed money. One failure never stops the rest. */
export async function runTenantPayouts(minimumMinor = 1): Promise<PayoutRunResult> {
  // Never below one shilling: M-Pesa cannot send a fraction of one, so attempting a smaller
  // balance would fail every hour and fill the log with noise for money that is not lost, only
  // waiting to accumulate.
  const owed = await listTenantsWithBalance(Math.max(minimumMinor, 100));
  let accepted = 0;
  let failed = 0;

  for (const balance of owed) {
    try {
      await payoutTenantBalance(balance.tenantId);
      accepted += 1;
    } catch (err) {
      failed += 1;
      console.error(`[payouts] tenant ${balance.tenantId} payout failed`, err);
    }
  }
  return { attempted: owed.length, accepted, failed };
}

/**
 * Applies Daraja's asynchronous result.
 *
 * A non-zero ResultCode means the money did NOT move, so the debit is removed and the tenant's
 * balance restored — otherwise a failed payout would quietly reduce what they are owed.
 */
export async function applyPayoutResult(input: {
  originatorConversationId: string;
  resultCode: number;
  resultDesc: string;
  transactionId?: string;
}): Promise<TenantPayout | null> {
  const payout = await prisma.tenantPayout.findUnique({
    where: { originatorConversationId: input.originatorConversationId },
  });
  if (!payout) return null;
  // Already terminal: a duplicate callback delivery must not re-open or re-settle it.
  if (payout.status === "COMPLETED" || payout.status === "FAILED") return payout;

  const succeeded = input.resultCode === 0;

  return prisma.$transaction(async (tx) => {
    if (!succeeded) {
      await tx.tenantLedgerEntry.deleteMany({
        where: { sourceType: "TenantPayout", sourceId: payout.id },
      });
    }
    return tx.tenantPayout.update({
      where: { id: payout.id },
      data: {
        status: succeeded ? "COMPLETED" : "FAILED",
        resultCode: input.resultCode,
        resultDesc: input.resultDesc.slice(0, 500),
        transactionId: input.transactionId ?? null,
        failureReason: succeeded ? null : input.resultDesc.slice(0, 500),
        completedAt: succeeded ? new Date() : null,
      },
    });
  });
}
