import { prisma, type Prisma, type TenantLedgerEntry } from "@mashupkgrid/database";

/**
 * What this platform owes each tenant whose payments it collects.
 *
 * Only tenants on collectionMode=PLATFORM have a ledger at all. A tenant collecting with their
 * own M-Pesa credentials is paid directly by their customers — the money never passes through
 * here, so crediting them would invent a debt that does not exist. Getting that distinction
 * wrong is how an aggregator pays a tenant twice.
 */

export interface TenantBalance {
  tenantId: string;
  currency: string;
  creditedMinor: number;
  paidOutMinor: number;
  /** What is still owed: credits minus payouts. */
  balanceMinor: number;
}

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Credits a tenant for one confirmed customer payment.
 *
 * Idempotent by construction: (sourceType, sourceId) is unique, so a replayed gateway callback
 * that reaches the same payment a second time hits the constraint and is ignored rather than
 * doubling the debt. That matters more here than almost anywhere else in the system — M-Pesa
 * and Paystack both retry callbacks, and a double credit is money paid out twice.
 *
 * A no-op for tenants collecting their own payments, which is the default.
 */
export async function creditTenantForPayment(
  db: Db,
  input: {
    tenantId: string;
    paymentId: string;
    amountMinor: number;
    currency: string;
    description: string;
  }
): Promise<void> {
  const tenant = await db.tenant.findUnique({
    where: { id: input.tenantId },
    select: { collectionMode: true },
  });
  if (tenant?.collectionMode !== "PLATFORM") return;

  try {
    await db.tenantLedgerEntry.create({
      data: {
        tenantId: input.tenantId,
        direction: "CREDIT",
        amountMinor: input.amountMinor,
        currency: input.currency,
        description: input.description,
        sourceType: "Payment",
        sourceId: input.paymentId,
      },
    });
  } catch (err) {
    // A duplicate is the expected outcome of a retried callback, not a failure — and it must not
    // roll back the surrounding transaction, which is what actually gave the customer their
    // voucher or marked their invoice paid.
    if (!isUniqueViolation(err)) throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

/** Records money sent to a tenant, so the balance falls by what was actually paid. */
export async function debitTenantForPayout(
  db: Db,
  input: { tenantId: string; payoutId: string; amountMinor: number; currency: string }
): Promise<void> {
  try {
    await db.tenantLedgerEntry.create({
      data: {
        tenantId: input.tenantId,
        direction: "DEBIT",
        amountMinor: input.amountMinor,
        currency: input.currency,
        description: `Payout ${input.payoutId}`,
        sourceType: "TenantPayout",
        sourceId: input.payoutId,
      },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }
}

/**
 * The balance, summed from entries rather than read from a cached column.
 *
 * A stored balance is faster and is how ledgers quietly go wrong: one missed update and the
 * number no longer equals its own history, with nothing to show which is right. Summing is
 * cheap at this scale and can always be reconciled against the entries a tenant can see.
 */
export async function getTenantBalance(tenantId: string): Promise<TenantBalance> {
  const grouped = await prisma.tenantLedgerEntry.groupBy({
    by: ["direction"],
    where: { tenantId },
    _sum: { amountMinor: true },
  });

  const creditedMinor = grouped.find((g) => g.direction === "CREDIT")?._sum.amountMinor ?? 0;
  const paidOutMinor = grouped.find((g) => g.direction === "DEBIT")?._sum.amountMinor ?? 0;

  return {
    tenantId,
    currency: "KES",
    creditedMinor,
    paidOutMinor,
    balanceMinor: creditedMinor - paidOutMinor,
  };
}

export async function listTenantLedger(tenantId: string, limit = 100): Promise<TenantLedgerEntry[]> {
  return prisma.tenantLedgerEntry.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 500),
  });
}

/** Every tenant the platform currently owes money — the payout run's input. */
export async function listTenantsWithBalance(minimumMinor = 1): Promise<TenantBalance[]> {
  const tenants = await prisma.tenant.findMany({
    where: { collectionMode: "PLATFORM", deletedAt: null },
    select: { id: true },
  });

  const balances = await Promise.all(tenants.map((t) => getTenantBalance(t.id)));
  return balances.filter((b) => b.balanceMinor >= minimumMinor);
}
