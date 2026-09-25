import { prisma, type Prisma, type TenantPayout } from "@mashupkgrid/database";
import { ConflictError, NotFoundError, ValidationError } from "@mashupkgrid/shared";
import { appendLedgerEntry, getTenantBalance, listTenantsWithBalance } from "../ledger.service.js";
import { getSettlementSettings } from "./settings.service.js";
import { getPlatformEnvironment } from "./collection.service.js";
import { destinationDetails, destinationSnapshot } from "./destination.service.js";
import { lockTenantForBalanceChange, nextSettlementNumber } from "./common.js";
import {
  providerByKind,
  providerForDestination,
  sandboxSettlementsEnabled,
  SettlementOutcomeUnknownError,
} from "./providers.js";
import { normalizeKenyanPhone } from "../mpesa/phone.js";

/**
 * Step 3 of the money flow: paying a tenant what the ledger says they are owed.
 *
 *   REQUESTED ──dispatch──▶ PROCESSING ──provider result──▶ SETTLED
 *       │                        │
 *       │                        └──provider refused / result failed──▶ FAILED (balance restored)
 *   AWAITING_APPROVAL (manual mode, or a bank transfer) ──approve──▶ REQUESTED / PROCESSING
 *   REQUESTED | AWAITING_APPROVAL ──cancel──▶ CANCELLED (balance restored)
 *
 * The amount is reserved the moment a settlement is created: a SETTLEMENT debit is written in the
 * same transaction, under the tenant's row lock, so no second settlement (or refund) can see the
 * same balance. A failure never deletes that debit — it writes a SETTLEMENT_REVERSAL credit.
 *
 * Nothing here marks money as sent on our own say-so. SETTLED is reached only from the provider's
 * result callback, or — for a MANUAL transfer or a settlement whose outcome was lost — from an
 * audited super-admin action that must carry the provider/bank reference.
 */

const QUEUED: TenantPayout["status"][] = ["REQUESTED", "AWAITING_APPROVAL"];
const IN_FLIGHT: TenantPayout["status"][] = ["REQUESTED", "AWAITING_APPROVAL", "PROCESSING"];

export interface RequestSettlementInput {
  tenantId: string;
  trigger: TenantPayout["trigger"];
  requestedByUserId?: string | null;
  /** When retrying a failed settlement (one retry per failure — unique index). */
  retryOfId?: string | null;
  /** Automatic runs and tenant requests respect the platform minimum; an admin retry does not. */
  enforceMinimum: boolean;
}

/**
 * Creates (and, when allowed, immediately dispatches) a settlement of the tenant's available
 * balance. Throws ConflictError when there is nothing to do — callers running in bulk treat that
 * as "skip", callers acting for a user show it.
 */
export async function requestSettlement(input: RequestSettlementInput): Promise<TenantPayout> {
  const settings = await getSettlementSettings();

  const settlement = await prisma.$transaction(async (tx) => {
    await lockTenantForBalanceChange(tx, input.tenantId);

    const tenant = await tx.tenant.findFirst({ where: { id: input.tenantId, deletedAt: null } });
    if (!tenant) throw new NotFoundError("Tenant");

    let destination = await tx.settlementDestination.findFirst({
      where: { tenantId: input.tenantId, isActive: true },
    });
    if (!destination) {
      // Auto-fallback: check if tenant has a payoutShortcode or an owner User with a valid phone
      if (tenant.payoutShortcode) {
        const type = tenant.payoutShortcodeType === "TILL" ? "TILL" : "PAYBILL";
        destination = await tx.settlementDestination.create({
          data: {
            tenantId: input.tenantId,
            type,
            accountName: tenant.name,
            tillNumber: type === "TILL" ? tenant.payoutShortcode : null,
            paybillNumber: type === "PAYBILL" ? tenant.payoutShortcode : null,
            paybillAccountReference: type === "PAYBILL" ? tenant.slug.slice(0, 20) : null,
            isActive: true,
          },
        });
      } else {
        const owner = await tx.user.findFirst({
          where: { tenantId: input.tenantId, phone: { not: null } },
          orderBy: { createdAt: "asc" },
          select: { phone: true },
        });
        if (owner?.phone) {
          try {
            const cleanPhone = normalizeKenyanPhone(owner.phone);
            destination = await tx.settlementDestination.create({
              data: {
                tenantId: input.tenantId,
                type: "MPESA_PHONE",
                accountName: tenant.name,
                phone: cleanPhone,
                isActive: true,
              },
            });
          } catch {
            // ignore phone normalization error
          }
        }
      }
    }
    if (!destination) {
      throw new ValidationError(`"${tenant.name}" has no settlement destination — add one in Payment Settings.`);
    }

    const queued = await tx.tenantPayout.findFirst({
      where: { tenantId: input.tenantId, status: { in: QUEUED } },
      select: { settlementNumber: true },
    });
    if (queued) {
      throw new ConflictError(`Settlement ${queued.settlementNumber} is already waiting to be sent.`);
    }

    // After a failed payout, automatic runs stop for this tenant until a person acts (an admin retry
    // or a tenant request). Otherwise a rejected credential is re-sent every scheduler tick, and
    // Safaricom locks an initiator after repeated failures.
    if (input.trigger === "AUTOMATIC") {
      const latest = await tx.tenantPayout.findFirst({
        where: { tenantId: input.tenantId },
        orderBy: { createdAt: "desc" },
        select: { status: true, settlementNumber: true },
      });
      if (latest?.status === "FAILED") {
        throw new ConflictError(
          `Automatic settlements are paused because ${latest.settlementNumber} failed. Retry it or request a settlement to resume.`
        );
      }
    }

    const balance = await getTenantBalance(input.tenantId, tx);
    const amountMinor = balance.settleableMinor;
    if (amountMinor <= 0) throw new ConflictError("There is no available balance to settle.");
    if (input.enforceMinimum && amountMinor < settings.settlementMinimumMinor) {
      throw new ConflictError(
        `The available balance is below the minimum settlement of KES ${(settings.settlementMinimumMinor / 100).toLocaleString("en-KE")}.`
      );
    }

    const provider = providerForDestination(destination.type);
    const needsApproval = !provider.automatic || settings.settlementMode === "MANUAL";
    const environment = provider.kind === "SANDBOX" ? "SANDBOX" : await getPlatformEnvironment(tx);

    const created = await tx.tenantPayout.create({
      data: {
        settlementNumber: await nextSettlementNumber(tx),
        tenantId: input.tenantId,
        amountMinor,
        currency: balance.currency,
        destinationId: destination.id,
        destinationSnapshot: destinationSnapshot(destination) as Prisma.InputJsonValue,
        destinationShortcode: destination.tillNumber ?? destination.paybillNumber ?? null,
        destinationType: destination.type,
        provider: provider.kind,
        environment,
        trigger: input.trigger,
        status: needsApproval ? "AWAITING_APPROVAL" : "REQUESTED",
        requestedByUserId: input.requestedByUserId ?? null,
        retryOfId: input.retryOfId ?? null,
      },
    });

    await appendLedgerEntry(tx, {
      tenantId: input.tenantId,
      direction: "DEBIT",
      entryType: "SETTLEMENT",
      amountMinor,
      currency: created.currency,
      description: `Settlement ${created.settlementNumber}`,
      sourceType: "Settlement",
      sourceId: created.id,
      settlementId: created.id,
      createdByUserId: input.requestedByUserId ?? null,
    });

    // Informational link from collected payments to the settlement that paid them out. Balances
    // never depend on this — they come from the ledger.
    await tx.gatewayTransaction.updateMany({
      where: {
        tenantId: input.tenantId,
        settlementStatus: "UNSETTLED",
        status: { in: ["COMPLETED", "PARTIALLY_REFUNDED"] },
        createdAt: { lte: created.createdAt },
      },
      data: { settlementStatus: "SETTLEMENT_PENDING", settlementId: created.id },
    });

    return created;
  });

  if (settlement.status === "REQUESTED") return dispatchSettlement(settlement.id);
  return settlement;
}

/**
 * Hands a REQUESTED settlement to its provider. The REQUESTED → PROCESSING claim is a conditional
 * update, so if two workers race to dispatch the same settlement only one of them calls M-Pesa.
 */
export async function dispatchSettlement(settlementId: string): Promise<TenantPayout> {
  const claimed = await prisma.tenantPayout.updateMany({
    where: { id: settlementId, status: "REQUESTED" },
    data: { status: "PROCESSING", processingStartedAt: new Date() },
  });
  const settlement = await prisma.tenantPayout.findUniqueOrThrow({
    where: { id: settlementId },
    include: { destination: true, tenant: { select: { name: true, slug: true } } },
  });
  if (claimed.count === 0) return settlement;
  if (!settlement.destination) {
    return failSettlement(settlementId, "The settlement has no destination.");
  }

  const provider = providerByKind(settlement.provider);
  try {
    const result = await provider.initiateSettlement({
      settlementId: settlement.id,
      settlementNumber: settlement.settlementNumber,
      amountMinor: settlement.amountMinor,
      currency: settlement.currency,
      tenantName: settlement.tenant.name,
      tenantSlug: settlement.tenant.slug,
      destination: destinationDetails(settlement.destination),
    });
    if (result.kind === "MANUAL") return settlement;
    return prisma.tenantPayout.update({
      where: { id: settlementId },
      data: {
        conversationId: result.conversationId,
        originatorConversationId: result.originatorConversationId,
      },
    });
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    if (err instanceof SettlementOutcomeUnknownError || !(err instanceof Error)) {
      // Money may have moved. Keep the balance reserved and put it in front of a person.
      return prisma.tenantPayout.update({
        where: { id: settlementId },
        data: { failureReason: message, notes: "Outcome unknown — confirm with the provider, then resolve." },
      });
    }
    return failSettlement(settlementId, message);
  }
}

/** Marks a non-final settlement FAILED and gives the reserved balance back with a reversal entry. */
async function failSettlement(
  settlementId: string,
  reason: string,
  extra: { resultCode?: number; resultDesc?: string; userId?: string | null } = {}
): Promise<TenantPayout> {
  return prisma.$transaction(async (tx) => {
    const current = await lockSettlement(tx, settlementId);
    if (["SETTLED", "FAILED", "CANCELLED"].includes(current.status)) return current;
    return failSettlementTx(tx, current, reason, extra);
  });
}

async function failSettlementTx(
  tx: Prisma.TransactionClient,
  settlement: TenantPayout,
  reason: string,
  extra: { resultCode?: number; resultDesc?: string; userId?: string | null } = {}
): Promise<TenantPayout> {
  const failed = await tx.tenantPayout.update({
    where: { id: settlement.id },
    data: {
      status: "FAILED",
      failedAt: new Date(),
      failureReason: reason.slice(0, 500),
      ...(extra.resultCode !== undefined ? { resultCode: extra.resultCode } : {}),
      ...(extra.resultDesc !== undefined ? { resultDesc: extra.resultDesc.slice(0, 500) } : {}),
      ...(extra.userId ? { resolvedByUserId: extra.userId } : {}),
    },
  });
  await restoreReservedBalance(tx, failed, `Settlement ${failed.settlementNumber} failed — balance restored`, extra.userId);
  return failed;
}

async function restoreReservedBalance(
  tx: Prisma.TransactionClient,
  settlement: TenantPayout,
  description: string,
  userId?: string | null
): Promise<void> {
  // Only reverse what was actually reserved: a legacy settlement from before this system may have
  // no SETTLEMENT debit, and reversing it would credit money that was never taken.
  const reserved = await tx.tenantLedgerEntry.findUnique({
    where: { sourceType_sourceId: { sourceType: "Settlement", sourceId: settlement.id } },
    select: { id: true },
  });
  const legacyReserved = await tx.tenantLedgerEntry.findUnique({
    where: { sourceType_sourceId: { sourceType: "TenantPayout", sourceId: settlement.id } },
    select: { id: true },
  });
  if (reserved || legacyReserved) {
    await appendLedgerEntry(tx, {
      tenantId: settlement.tenantId,
      direction: "CREDIT",
      entryType: "SETTLEMENT_REVERSAL",
      amountMinor: settlement.amountMinor,
      currency: settlement.currency,
      description,
      sourceType: "SettlementReversal",
      sourceId: settlement.id,
      settlementId: settlement.id,
      createdByUserId: userId ?? null,
    });
  }
  await tx.gatewayTransaction.updateMany({
    where: { settlementId: settlement.id },
    data: { settlementStatus: "UNSETTLED", settlementId: null },
  });
}

async function markSettledTx(
  tx: Prisma.TransactionClient,
  settlement: TenantPayout,
  data: { transactionId: string | null; resultCode?: number; resultDesc?: string; userId?: string | null; notes?: string | null; providerConfirmed: boolean }
): Promise<TenantPayout> {
  const now = new Date();
  const settled = await tx.tenantPayout.update({
    where: { id: settlement.id },
    data: {
      status: "SETTLED",
      completedAt: now,
      providerConfirmedAt: data.providerConfirmed ? now : null,
      transactionId: data.transactionId,
      failureReason: null,
      ...(data.resultCode !== undefined ? { resultCode: data.resultCode } : {}),
      ...(data.resultDesc !== undefined ? { resultDesc: data.resultDesc.slice(0, 500) } : {}),
      ...(data.userId ? { resolvedByUserId: data.userId } : {}),
      ...(data.notes ? { notes: data.notes.slice(0, 1000) } : {}),
    },
  });
  await tx.gatewayTransaction.updateMany({
    where: { settlementId: settlement.id },
    data: { settlementStatus: "SETTLED" },
  });
  if (settlement.destinationId && data.providerConfirmed) {
    await tx.settlementDestination.updateMany({
      where: { id: settlement.destinationId, verificationStatus: { not: "VERIFIED" } },
      data: { verificationStatus: "VERIFIED", verifiedAt: now },
    });
  }
  return settled;
}

async function lockSettlement(tx: Prisma.TransactionClient, settlementId: string): Promise<TenantPayout> {
  await tx.$queryRaw`SELECT "id" FROM "tenant_payouts" WHERE "id" = ${settlementId} FOR UPDATE`;
  const settlement = await tx.tenantPayout.findUnique({ where: { id: settlementId } });
  if (!settlement) throw new NotFoundError("Settlement");
  return settlement;
}

export type ResultOutcome = "PROCESSED" | "DUPLICATE" | "IGNORED";

/**
 * Applies a provider's asynchronous result (Daraja B2B/B2C ResultURL). Row-locked and idempotent:
 * a settlement already SETTLED/FAILED/CANCELLED is left untouched, so a replayed callback can
 * neither settle twice nor turn a success into a failure.
 */
export async function applySettlementResult(input: {
  originatorConversationId: string;
  resultCode: number;
  resultDesc: string;
  transactionId?: string | null;
}): Promise<{ outcome: ResultOutcome; settlement: TenantPayout | null }> {
  const found = await prisma.tenantPayout.findUnique({
    where: { originatorConversationId: input.originatorConversationId },
    select: { id: true },
  });
  if (!found) return { outcome: "IGNORED", settlement: null };

  return prisma.$transaction(async (tx) => {
    const settlement = await lockSettlement(tx, found.id);
    if (settlement.status !== "PROCESSING") return { outcome: "DUPLICATE" as const, settlement };

    if (input.resultCode === 0) {
      const settled = await markSettledTx(tx, settlement, {
        transactionId: input.transactionId ?? null,
        resultCode: input.resultCode,
        resultDesc: input.resultDesc,
        providerConfirmed: true,
      });
      return { outcome: "PROCESSED" as const, settlement: settled };
    }
    const failed = await failSettlementTx(tx, settlement, input.resultDesc || `Provider result ${input.resultCode}`, {
      resultCode: input.resultCode,
      resultDesc: input.resultDesc,
    });
    return { outcome: "PROCESSED" as const, settlement: failed };
  });
}

/**
 * Daraja's queue-timeout callback. It means the request waited too long in Safaricom's queue — not
 * that the money definitely did not move — so the settlement is flagged for review and the balance
 * stays reserved. (The previous behaviour, restoring the balance, could pay a tenant twice if the
 * transfer had in fact gone through and the balance was then settled again.)
 */
export async function markSettlementTimedOut(originatorConversationId: string): Promise<{ outcome: ResultOutcome; settlement: TenantPayout | null }> {
  const settlement = await prisma.tenantPayout.findUnique({ where: { originatorConversationId } });
  if (!settlement) return { outcome: "IGNORED", settlement: null };
  if (settlement.status !== "PROCESSING" || settlement.timedOutAt) return { outcome: "DUPLICATE", settlement };
  const updated = await prisma.tenantPayout.update({
    where: { id: settlement.id },
    data: { timedOutAt: new Date(), notes: "M-Pesa reported a queue timeout — confirm the transfer status with Safaricom, then resolve." },
  });
  return { outcome: "PROCESSED", settlement: updated };
}

// ---------------------------------------------------------------------------------------------
// Super-admin actions. Each is permission-gated and audit-logged at the route.
// ---------------------------------------------------------------------------------------------

export async function approveSettlement(settlementId: string, userId: string): Promise<TenantPayout> {
  const approved = await prisma.$transaction(async (tx) => {
    const settlement = await lockSettlement(tx, settlementId);
    if (settlement.status !== "AWAITING_APPROVAL") {
      throw new ConflictError(`Settlement ${settlement.settlementNumber} is ${settlement.status}, not awaiting approval.`);
    }
    const provider = providerByKind(settlement.provider);
    return tx.tenantPayout.update({
      where: { id: settlementId },
      data: {
        approvedByUserId: userId,
        approvedAt: new Date(),
        // A bank transfer waits for the person making it; an automatic provider is dispatched.
        ...(provider.automatic
          ? { status: "REQUESTED" as const }
          : { status: "PROCESSING" as const, processingStartedAt: new Date() }),
      },
    });
  });
  return approved.status === "REQUESTED" ? dispatchSettlement(approved.id) : approved;
}

export async function cancelSettlement(settlementId: string, reason: string, userId: string): Promise<TenantPayout> {
  return prisma.$transaction(async (tx) => {
    const settlement = await lockSettlement(tx, settlementId);
    if (!QUEUED.includes(settlement.status)) {
      throw new ConflictError(
        `Settlement ${settlement.settlementNumber} is ${settlement.status}. Only a settlement that has not been sent can be cancelled.`
      );
    }
    const cancelled = await tx.tenantPayout.update({
      where: { id: settlementId },
      data: { status: "CANCELLED", cancelledAt: new Date(), resolvedByUserId: userId, notes: reason.slice(0, 1000) },
    });
    await restoreReservedBalance(tx, cancelled, `Settlement ${cancelled.settlementNumber} cancelled — balance restored`, userId);
    return cancelled;
  });
}

/**
 * Closes a PROCESSING settlement by hand: a MANUAL (bank) transfer once it has been made, or an
 * automatic one whose provider result never arrived, once the provider has been asked directly.
 * SETTLED requires the provider/bank reference; FAILED restores the balance.
 */
export async function resolveSettlement(
  settlementId: string,
  input: { outcome: "SETTLED" | "FAILED"; reference?: string; notes: string },
  userId: string
): Promise<TenantPayout> {
  if (input.outcome === "SETTLED" && !input.reference?.trim()) {
    throw new ValidationError("A settled transfer needs its M-Pesa or bank reference.");
  }
  return prisma.$transaction(async (tx) => {
    const settlement = await lockSettlement(tx, settlementId);
    if (settlement.status !== "PROCESSING") {
      throw new ConflictError(`Settlement ${settlement.settlementNumber} is ${settlement.status}; only a processing settlement can be resolved.`);
    }
    if (input.outcome === "SETTLED") {
      return markSettledTx(tx, settlement, {
        transactionId: input.reference!.trim().slice(0, 64),
        userId,
        notes: input.notes,
        // A person's confirmation, not the provider's — the destination is not auto-verified by it.
        providerConfirmed: false,
      });
    }
    return failSettlementTx(tx, settlement, input.notes || "Resolved as failed by an administrator", { userId });
  });
}

/** A failed settlement's money is already back in the balance; retrying settles that balance
 *  again. At most one retry per failed settlement (unique index on retryOfId). */
export async function retrySettlement(settlementId: string, userId: string): Promise<TenantPayout> {
  const failed = await prisma.tenantPayout.findUnique({
    where: { id: settlementId },
    include: { retry: { select: { settlementNumber: true } } },
  });
  if (!failed) throw new NotFoundError("Settlement");
  if (failed.status !== "FAILED") throw new ConflictError("Only a failed settlement can be retried.");
  if (failed.retry) throw new ConflictError(`Already retried as ${failed.retry.settlementNumber}.`);
  return requestSettlement({
    tenantId: failed.tenantId,
    trigger: "ADMIN",
    requestedByUserId: userId,
    retryOfId: failed.id,
    enforceMinimum: false,
  });
}

/** Sandbox only: stand in for the provider's result callback. */
export async function simulateSandboxResult(settlementId: string, success: boolean): Promise<TenantPayout> {
  if (!sandboxSettlementsEnabled()) throw new ConflictError("Sandbox settlements are not enabled.");
  const settlement = await prisma.tenantPayout.findUnique({ where: { id: settlementId } });
  if (!settlement) throw new NotFoundError("Settlement");
  if (settlement.provider !== "SANDBOX" || !settlement.originatorConversationId) {
    throw new ConflictError("Only a dispatched SANDBOX settlement can have its result simulated.");
  }
  const result = await applySettlementResult({
    originatorConversationId: settlement.originatorConversationId,
    resultCode: success ? 0 : 2001,
    resultDesc: success ? "Sandbox: the service request is processed successfully." : "Sandbox: simulated provider failure.",
    transactionId: success ? `SBX${Date.now().toString(36).toUpperCase()}` : null,
  });
  return result.settlement!;
}

// ---------------------------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------------------------

const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

/** The most recent scheduled run time at or before `now`, per the configured frequency — or null
 *  when the frequency never schedules automatically. Nairobi has no DST, so a fixed +3h is exact. */
export function latestScheduledRun(
  now: Date,
  frequency: "INSTANT" | "DAILY" | "WEEKLY" | "MANUAL",
  hourEat: number,
  weekday: number
): Date | null {
  if (frequency === "MANUAL") return null;
  if (frequency === "INSTANT") return now;
  const local = new Date(now.getTime() + EAT_OFFSET_MS);
  const slot = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hourEat));
  if (frequency === "DAILY") {
    if (slot.getTime() > local.getTime()) slot.setUTCDate(slot.getUTCDate() - 1);
  } else {
    const isoToday = ((local.getUTCDay() + 6) % 7) + 1; // 1 = Monday … 7 = Sunday
    slot.setUTCDate(slot.getUTCDate() - ((isoToday - weekday + 7) % 7));
    if (slot.getTime() > local.getTime()) slot.setUTCDate(slot.getUTCDate() - 7);
  }
  return new Date(slot.getTime() - EAT_OFFSET_MS);
}

export interface SettlementRunResult {
  ran: boolean;
  reason?: string;
  created: number;
  skipped: number;
  failed: number;
}

/** The worker's periodic entry point. Creates settlements only when a scheduled slot has passed
 *  since the last run, so a restart or an extra tick can't run a daily settlement twice. */
export async function runScheduledSettlements(now = new Date()): Promise<SettlementRunResult> {
  const settings = await getSettlementSettings();
  const due = latestScheduledRun(now, settings.settlementFrequency, settings.settlementHourEat, settings.settlementWeekday);
  if (!due) return { ran: false, reason: "Settlement frequency is MANUAL", created: 0, skipped: 0, failed: 0 };
  if (settings.settlementFrequency !== "INSTANT" && settings.lastScheduledRunAt && settings.lastScheduledRunAt >= due) {
    return { ran: false, reason: "Not due yet", created: 0, skipped: 0, failed: 0 };
  }

  // Claim the slot before doing any work, so two workers can't both run it.
  const claimed = await prisma.platformSettlementSettings.updateMany({
    where: {
      id: settings.id,
      ...(settings.lastScheduledRunAt ? { lastScheduledRunAt: settings.lastScheduledRunAt } : { lastScheduledRunAt: null }),
    },
    data: { lastScheduledRunAt: now },
  });
  if (claimed.count === 0) return { ran: false, reason: "Another worker is running this slot", created: 0, skipped: 0, failed: 0 };

  const owed = await listTenantsWithBalance(Math.max(settings.settlementMinimumMinor, 100));
  let created = 0;
  let skipped = 0;
  let failed = 0;
  for (const { tenantId } of owed) {
    try {
      await requestSettlement({ tenantId, trigger: "AUTOMATIC", enforceMinimum: true });
      created += 1;
    } catch (err) {
      if (err instanceof ConflictError || err instanceof ValidationError) {
        skipped += 1;
      } else {
        failed += 1;
        console.error(`[settlements] tenant ${tenantId} settlement failed`, err);
      }
    }
  }
  return { ran: true, created, skipped, failed };
}

/** After a collection: settle straight away when the platform is on INSTANT settlement. */
export async function settleTenantIfInstant(tenantId: string): Promise<TenantPayout | null> {
  const settings = await getSettlementSettings();
  if (settings.settlementFrequency !== "INSTANT") return null;
  try {
    return await requestSettlement({ tenantId, trigger: "AUTOMATIC", enforceMinimum: true });
  } catch (err) {
    if (err instanceof ConflictError || err instanceof ValidationError) return null;
    throw err;
  }
}

export { IN_FLIGHT as IN_FLIGHT_SETTLEMENT_STATUSES };
