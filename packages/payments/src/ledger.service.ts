import { prisma, type TenantLedgerEntry } from "@mashupkgrid/database";
import type { Db } from "./gateway/common.js";

/**
 * What this platform owes each tenant whose payments it collects.
 *
 * The ledger is append-only — a database trigger rejects UPDATE and DELETE — so every movement of
 * money is a new row, and a correction is a new row pointing the other way. A tenant's balance is
 * always the sum of their rows, never a cached column: one missed update to a stored balance and
 * it silently stops matching its own history.
 *
 * Only money the platform actually received on a tenant's behalf ever creates a credit (see
 * gateway/collection.service.ts). A tenant collecting through their own M-Pesa/Paystack account
 * was paid directly, and crediting them here would invent a debt that does not exist.
 */

export interface LedgerEntryInput {
  tenantId: string;
  direction: "CREDIT" | "DEBIT";
  entryType: TenantLedgerEntry["entryType"];
  amountMinor: number;
  currency?: string;
  description: string;
  /** (sourceType, sourceId) is unique: the idempotency key for this movement. */
  sourceType: string;
  sourceId: string;
  gatewayTransactionId?: string | null;
  settlementId?: string | null;
  createdByUserId?: string | null;
}

/**
 * Appends one entry. Returns false — and writes nothing — if an entry for the same
 * (sourceType, sourceId) already exists, which is how a replayed callback or a retried job is made
 * harmless: the second attempt cannot move the money twice.
 *
 * The duplicate check is an explicit lookup, not "insert and catch the unique violation": inside
 * a Postgres transaction a failed INSERT aborts the whole transaction, so catching the error and
 * carrying on would make every later statement fail. Callers already hold the lock that
 * serialises writes for this source (the STK request row, the tenant row); if two writers ever
 * did race past the lookup, the unique index rejects the second and its transaction rolls back
 * cleanly, to be retried — the money still moves exactly once.
 */
export async function appendLedgerEntry(db: Db, input: LedgerEntryInput): Promise<boolean> {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new RangeError(`Ledger amounts must be positive whole minor units, got ${input.amountMinor}`);
  }
  const existing = await db.tenantLedgerEntry.findUnique({
    where: { sourceType_sourceId: { sourceType: input.sourceType, sourceId: input.sourceId } },
    select: { id: true },
  });
  if (existing) return false;

  await db.tenantLedgerEntry.create({
    data: {
      tenantId: input.tenantId,
      direction: input.direction,
      entryType: input.entryType,
      amountMinor: input.amountMinor,
      currency: input.currency ?? "KES",
      description: input.description,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      gatewayTransactionId: input.gatewayTransactionId ?? null,
      settlementId: input.settlementId ?? null,
      createdByUserId: input.createdByUserId ?? null,
    },
  });
  return true;
}

export interface TenantBalance {
  tenantId: string;
  currency: string;
  /** Gross customer payments collected for this tenant. */
  collectedMinor: number;
  /** Platform fees net of fees returned on refunds/reversals. */
  feesMinor: number;
  /** Refunds and reversals charged back to the tenant (gross). */
  refundsMinor: number;
  /** Paid out and confirmed by the provider. */
  settledMinor: number;
  /** Reserved by settlements that have not finished (requested, awaiting approval, processing). */
  pendingSettlementMinor: number;
  /** What is still owed and not reserved: credits minus debits. Can be negative after a refund
   *  of money already settled — the tenant then owes the platform until new collections cover it. */
  availableMinor: number;
  /** The part of availableMinor that can be sent now: whole shillings only (M-Pesa has no cents). */
  settleableMinor: number;
}

interface LedgerSums {
  credit: bigint | null;
  debit: bigint | null;
  collected: bigint | null;
  fees: bigint | null;
  fee_returns: bigint | null;
  refunds: bigint | null;
}

/** Computed in SQL with 64-bit sums: a busy tenant's lifetime total can exceed the 32-bit range
 *  an individual row's amount lives in. */
export async function getTenantBalance(tenantId: string, db: Db = prisma): Promise<TenantBalance> {
  const [sums] = await db.$queryRaw<LedgerSums[]>`
    SELECT
      SUM(CASE WHEN "direction" = 'CREDIT' THEN "amountMinor"::bigint ELSE 0 END) AS credit,
      SUM(CASE WHEN "direction" = 'DEBIT'  THEN "amountMinor"::bigint ELSE 0 END) AS debit,
      SUM(CASE WHEN "entryType" = 'CUSTOMER_PAYMENT' THEN "amountMinor"::bigint ELSE 0 END) AS collected,
      SUM(CASE WHEN "entryType" = 'PLATFORM_FEE' THEN "amountMinor"::bigint ELSE 0 END) AS fees,
      SUM(CASE WHEN "entryType" = 'FEE_REVERSAL' THEN "amountMinor"::bigint ELSE 0 END) AS fee_returns,
      SUM(CASE WHEN "entryType" IN ('PAYMENT_REVERSAL', 'REFUND') THEN "amountMinor"::bigint ELSE 0 END) AS refunds
    FROM "tenant_ledger_entries" WHERE "tenantId" = ${tenantId}`;
  const [settlements] = await db.$queryRaw<{ pending: bigint | null; settled: bigint | null }[]>`
    SELECT
      SUM(CASE WHEN "status" IN ('REQUESTED', 'AWAITING_APPROVAL', 'PROCESSING') THEN "amountMinor"::bigint ELSE 0 END) AS pending,
      SUM(CASE WHEN "status" = 'SETTLED' THEN "amountMinor"::bigint ELSE 0 END) AS settled
    FROM "tenant_payouts" WHERE "tenantId" = ${tenantId}`;

  const n = (v: bigint | null | undefined) => Number(v ?? 0n);
  const availableMinor = n(sums?.credit) - n(sums?.debit);

  return {
    tenantId,
    currency: "KES",
    collectedMinor: n(sums?.collected),
    feesMinor: n(sums?.fees) - n(sums?.fee_returns),
    refundsMinor: n(sums?.refunds),
    settledMinor: n(settlements?.settled),
    pendingSettlementMinor: n(settlements?.pending),
    availableMinor,
    settleableMinor: availableMinor > 0 ? Math.floor(availableMinor / 100) * 100 : 0,
  };
}

export async function listTenantLedger(
  tenantId: string,
  options: { limit?: number; cursor?: string } = {}
): Promise<TenantLedgerEntry[]> {
  const take = Math.min(Math.max(options.limit ?? 100, 1), 500);
  return prisma.tenantLedgerEntry.findMany({
    where: { tenantId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    ...(options.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
  });
}

/**
 * Every tenant currently owed at least `minimumMinor`, whatever their collection mode today. A
 * tenant switched back to collecting on their own paybill is still owed what the platform
 * collected for them before the switch — filtering on the current mode would strand that money.
 */
export async function listTenantsWithBalance(minimumMinor = 1): Promise<{ tenantId: string; availableMinor: number }[]> {
  const rows = await prisma.$queryRaw<{ tenantId: string; available: bigint }[]>`
    SELECT l."tenantId",
           SUM(CASE WHEN l."direction" = 'CREDIT' THEN l."amountMinor"::bigint ELSE -l."amountMinor"::bigint END) AS available
    FROM "tenant_ledger_entries" l
    JOIN "tenants" t ON t."id" = l."tenantId" AND t."deletedAt" IS NULL
    GROUP BY l."tenantId"
    HAVING SUM(CASE WHEN l."direction" = 'CREDIT' THEN l."amountMinor"::bigint ELSE -l."amountMinor"::bigint END) >= ${minimumMinor}`;
  return rows.map((r) => ({ tenantId: r.tenantId, availableMinor: Number(r.available) }));
}

