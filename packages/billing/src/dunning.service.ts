import { prisma, type Invoice, type Customer } from "@mashupkgrid/database";

export interface DunningCandidate extends Invoice {
  customer: Customer;
}

/** PENDING invoices due within `daysAhead` days that haven't had any dunning notice yet
 *  (dunningStage 0) — a courtesy reminder before anything is actually overdue. */
export async function listInvoicesDueSoon(daysAhead = 3): Promise<DunningCandidate[]> {
  const now = new Date();
  const horizon = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  return prisma.invoice.findMany({
    where: { status: "PENDING", dunningStage: 0, dueDate: { gte: now, lte: horizon } },
    include: { customer: true },
  });
}

/** OVERDUE invoices (status already flipped by markOverdueInvoices) that haven't had an
 *  overdue-specific notice yet (dunningStage < 2 — covers both "never notified" and "only got
 *  the due-soon reminder"). */
export async function listOverdueInvoicesNeedingNotice(): Promise<DunningCandidate[]> {
  return prisma.invoice.findMany({
    where: { status: "OVERDUE", dunningStage: { lt: 2 } },
    include: { customer: true },
  });
}

/** OVERDUE invoices about to cross `suspendOverdueSubscriptions`'s grace-period cutoff — one
 *  day out, so this is the last warning before network access actually gets cut, not just
 *  another overdue notice. No upper bound on how overdue, matching every other job in this file
 *  (a late-running job still catches what it missed, it just also catches everyone since). */
export async function listInvoicesNeedingFinalNotice(gracePeriodDays = 3): Promise<DunningCandidate[]> {
  const cutoff = new Date(Date.now() - (gracePeriodDays - 1) * 24 * 60 * 60 * 1000);
  return prisma.invoice.findMany({
    where: { status: "OVERDUE", dunningStage: { lt: 3 }, dueDate: { lt: cutoff } },
    include: { customer: true },
  });
}

export async function markDunningStage(invoiceId: string, stage: 1 | 2 | 3): Promise<void> {
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { dunningStage: stage, lastDunningAt: new Date() },
  });
}
