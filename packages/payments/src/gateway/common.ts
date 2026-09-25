import { prisma, type Prisma } from "@mashupkgrid/database";

export type Db = Prisma.TransactionClient | typeof prisma;

/** Prisma's unique-constraint violation — the expected outcome of a replayed callback. */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

type NumberSequence = "gateway_txn_number_seq" | "settlement_number_seq" | "gateway_refund_number_seq";

/**
 * TXN-20260923-000042 style numbers. The running part comes from a Postgres sequence, so two
 * concurrent transactions can never be handed the same number (a "count + 1" scheme can). The date
 * is Nairobi-local, which is the calendar the business and its customers read.
 */
async function nextNumber(db: Db, prefix: string, sequence: NumberSequence): Promise<string> {
  const rows = await db.$queryRawUnsafe<{ n: bigint; d: string }[]>(
    `SELECT nextval('"${sequence}"') AS n, to_char(now() AT TIME ZONE 'Africa/Nairobi', 'YYYYMMDD') AS d`
  );
  const row = rows[0]!;
  return `${prefix}-${row.d}-${String(row.n).padStart(6, "0")}`;
}

export const nextTransactionNumber = (db: Db) => nextNumber(db, "TXN", "gateway_txn_number_seq");
export const nextSettlementNumber = (db: Db) => nextNumber(db, "STL", "settlement_number_seq");
export const nextRefundNumber = (db: Db) => nextNumber(db, "RFD", "gateway_refund_number_seq");

/**
 * Serialises every balance-changing operation for one tenant. Taken at the start of the
 * transaction that reads the balance and writes against it, so two settlements (or a settlement
 * and a refund) can never both act on the same balance. Held until the transaction ends.
 */
export async function lockTenantForBalanceChange(db: Prisma.TransactionClient, tenantId: string): Promise<void> {
  await db.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
}

export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  return `****${phone.replace(/\D/g, "").slice(-4)}`;
}

export function maskTail(value: string | null | undefined, visible = 4): string | null {
  if (!value) return null;
  return value.length <= visible ? value : `****${value.slice(-visible)}`;
}
