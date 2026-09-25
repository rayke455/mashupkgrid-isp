import { prisma, type GatewayTransaction, type Prisma } from "@mashupkgrid/database";
import { appendLedgerEntry } from "../ledger.service.js";
import { calculateFee } from "./fees.js";
import { getEffectiveFeeRule, getSettlementSettings } from "./settings.service.js";
import { nextTransactionNumber, type Db } from "./common.js";

/**
 * Step 2 of the money flow: a verified payment the PLATFORM received becomes a gateway
 * transaction (gross, fee, net) and ledger entries owed to the tenant.
 *
 * Always runs inside the caller's database transaction — the same one that records the Payment
 * and marks the invoice paid — so either all of it happens or none of it does. There is no window
 * where a customer's invoice is paid but the tenant is not credited, or the reverse.
 *
 * Idempotent on the Payment: a second call for the same payment (a replayed callback, a status
 * query racing the real callback) finds the existing transaction and writes nothing.
 */

export interface PlatformCollectionInput {
  tenantId: string;
  paymentId: string;
  grossMinor: number;
  currency: string;
  channel: GatewayTransaction["channel"];
  /** M-Pesa receipt (TransID / MpesaReceiptNumber), or a provisional PRV- receipt. */
  providerReference: string;
  providerRequestId?: string | null;
  payerPhone?: string | null;
  customerId?: string | null;
  invoiceId?: string | null;
  paymentReferenceId?: string | null;
  description: string;
}

export async function getPlatformEnvironment(db: Db = prisma): Promise<GatewayTransaction["environment"]> {
  const config = await db.platformMpesaConfig.findFirst({ select: { environment: true } });
  return config?.environment === "production" ? "PRODUCTION" : "SANDBOX";
}

export async function recordPlatformCollection(
  tx: Prisma.TransactionClient,
  input: PlatformCollectionInput
): Promise<{ transaction: GatewayTransaction; created: boolean }> {
  const existing = await tx.gatewayTransaction.findUnique({ where: { paymentId: input.paymentId } });
  if (existing) return { transaction: existing, created: false };

  const settings = await getSettlementSettings(tx);
  const rule = await getEffectiveFeeRule(tx, input.tenantId, settings);
  const fee = calculateFee(input.grossMinor, rule);

  const transaction = await tx.gatewayTransaction.create({
    data: {
      txnNumber: await nextTransactionNumber(tx),
      tenantId: input.tenantId,
      paymentId: input.paymentId,
      customerId: input.customerId ?? null,
      invoiceId: input.invoiceId ?? null,
      paymentReferenceId: input.paymentReferenceId ?? null,
      channel: input.channel,
      providerReference: input.providerReference,
      providerRequestId: input.providerRequestId ?? null,
      payerPhone: input.payerPhone ?? null,
      environment: await getPlatformEnvironment(tx),
      currency: input.currency,
      grossMinor: fee.grossMinor,
      feeMinor: fee.feeMinor,
      netMinor: fee.netMinor,
      feePercentBps: fee.percentBps,
      feeFixedMinor: fee.fixedMinor,
      description: input.description,
    },
  });

  await appendLedgerEntry(tx, {
    tenantId: input.tenantId,
    direction: "CREDIT",
    entryType: "CUSTOMER_PAYMENT",
    amountMinor: fee.grossMinor,
    currency: input.currency,
    description: `${input.description} · ${transaction.txnNumber}`,
    sourceType: "GatewayTransaction",
    sourceId: transaction.id,
    gatewayTransactionId: transaction.id,
  });

  if (fee.feeMinor > 0) {
    await appendLedgerEntry(tx, {
      tenantId: input.tenantId,
      direction: "DEBIT",
      entryType: "PLATFORM_FEE",
      amountMinor: fee.feeMinor,
      currency: input.currency,
      description: `Platform fee · ${transaction.txnNumber}`,
      sourceType: "GatewayTransactionFee",
      sourceId: transaction.id,
      gatewayTransactionId: transaction.id,
    });
  }

  return { transaction, created: true };
}

/** Safaricom's real receipt replacing the provisional PRV- one issued by a status query. The
 *  database trigger refuses to overwrite a receipt that is not provisional. */
export async function upgradeProvisionalReceipt(
  tx: Prisma.TransactionClient,
  paymentId: string,
  receipt: string
): Promise<void> {
  await tx.gatewayTransaction.updateMany({
    where: { paymentId, providerReference: { startsWith: "PRV-" } },
    data: { providerReference: receipt },
  });
}
