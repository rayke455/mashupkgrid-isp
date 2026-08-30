import { prisma, type Wallet } from "@mashupkgrid/database";
import { ConflictError, ValidationError } from "@mashupkgrid/shared";
import type { Db } from "./db.js";

export async function getOrCreateWallet(db: Db, customerId: string, currency = "KES"): Promise<Wallet> {
  const existing = await db.wallet.findUnique({ where: { customerId } });
  if (existing) return existing;
  return db.wallet.create({ data: { customerId, currency, balanceMinor: 0 } });
}

interface LedgerRef {
  referenceType?: string;
  referenceId?: string;
}

/** Credits a customer's wallet and appends the corresponding ledger row atomically. */
export async function creditWallet(
  db: Db,
  customerId: string,
  amountMinor: number,
  reason: string,
  ref: LedgerRef = {}
): Promise<Wallet> {
  if (amountMinor <= 0) throw new ValidationError("Credit amount must be positive");

  const wallet = await getOrCreateWallet(db, customerId);

  // Atomic increment rather than read-then-write: two concurrent credits (e.g. a duplicate
  // gateway callback race) must both land, not have the second overwrite the first's balance
  // with a value computed from a now-stale read.
  const updated = await db.wallet.update({
    where: { id: wallet.id },
    data: { balanceMinor: { increment: amountMinor } },
  });
  await db.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: "CREDIT",
      amountMinor,
      balanceAfterMinor: updated.balanceMinor,
      reason,
      referenceType: ref.referenceType,
      referenceId: ref.referenceId,
    },
  });
  return updated;
}

/** Debits a customer's wallet. Throws ConflictError rather than allowing a negative balance. */
export async function debitWallet(
  db: Db,
  customerId: string,
  amountMinor: number,
  reason: string,
  ref: LedgerRef = {}
): Promise<Wallet> {
  if (amountMinor <= 0) throw new ValidationError("Debit amount must be positive");

  const wallet = await getOrCreateWallet(db, customerId);

  // Conditional atomic decrement (WHERE balanceMinor >= amountMinor) instead of a read-then-write:
  // two concurrent debits that both read the same starting balance must not both succeed and
  // together push the balance negative — only one can win the guarded update.
  const { count } = await db.wallet.updateMany({
    where: { id: wallet.id, balanceMinor: { gte: amountMinor } },
    data: { balanceMinor: { decrement: amountMinor } },
  });
  if (count === 0) {
    const current = await db.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
    throw new ConflictError("Insufficient wallet balance", {
      available: current.balanceMinor,
      requested: amountMinor,
    });
  }
  const updated = await db.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
  await db.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: "DEBIT",
      amountMinor,
      balanceAfterMinor: updated.balanceMinor,
      reason,
      referenceType: ref.referenceType,
      referenceId: ref.referenceId,
    },
  });
  return updated;
}

export async function listWalletTransactions(customerId: string, take = 50) {
  const wallet = await prisma.wallet.findUnique({ where: { customerId } });
  if (!wallet) return [];
  return prisma.walletTransaction.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: "desc" },
    take,
  });
}
