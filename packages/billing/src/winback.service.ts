import { prisma, type WinBackOffer } from "@mashupkgrid/database";
import { resolveTenantPreferences } from "@mashupkgrid/shared";
import { listCustomersAtRisk } from "./analytics.service.js";
import { creditWallet } from "./wallet.service.js";

/**
 * Win-back offers: a text to a customer at risk of leaving (suspended, overdue, or gone quiet)
 * offering a share of their next payment back as account credit if they pay within a few days.
 * Each offer is kept, so the ISP can see how many came back and what was recovered.
 */

const DAY = 86_400_000;

const kes = (minor: number, currency = "KES") => `${currency} ${Math.round(minor / 100).toLocaleString("en-KE")}`;

export interface WinBackMessageInput {
  firstName: string;
  isp: string;
  discountPercent: number;
  validDays: number;
  owedMinor: number;
  accountNumber: string;
  currency?: string;
}

/** The offer text: who it's from, the deal, the deadline and how to pay. Fits two SMS. */
export function winBackMessage(m: WinBackMessageInput): string {
  const deadline = m.validDays === 1 ? "today" : `within ${m.validDays} days`;
  const bill = m.owedMinor > 0 ? ` your ${kes(m.owedMinor, m.currency)} bill` : "";
  return `Hi ${m.firstName}, we miss you at ${m.isp}. Pay${bill} ${deadline} and get ${m.discountPercent}% back as credit on your account. Pay in the app or by M-Pesa to account ${m.accountNumber}.`;
}

/** What a paid-up offer earns: the discount on what they paid, counting at most what they owed
 *  when it was sent (if they owed anything), so paying far ahead doesn't earn more. */
export function winBackCredit(paidMinor: number, owedMinor: number, discountPercent: number): number {
  const base = owedMinor > 0 ? Math.min(paidMinor, owedMinor) : paidMinor;
  return Math.floor((base * discountPercent) / 100);
}

export interface WinBackCandidate {
  customerId: string;
  fullName: string;
  phone: string;
  customerNumber: string;
  reason: string;
  owedMinor: number;
}

/** At-risk customers who haven't had an offer recently. */
export async function winBackCandidates(tenantId: string, limit = 200): Promise<WinBackCandidate[]> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { preferences: true } });
  const prefs = resolveTenantPreferences(tenant.preferences).winBack;
  const atRisk = await listCustomersAtRisk(tenantId, limit);
  if (!atRisk.length) return [];
  const recent = await prisma.winBackOffer.findMany({
    where: { tenantId, customerId: { in: atRisk.map((c) => c.customerId) }, sentAt: { gte: new Date(Date.now() - prefs.minDaysBetween * DAY) }, status: { not: "FAILED" } },
    select: { customerId: true },
  });
  const skip = new Set(recent.map((r) => r.customerId));
  const numbers = await prisma.customer.findMany({ where: { id: { in: atRisk.map((c) => c.customerId) } }, select: { id: true, customerNumber: true } });
  const numberOf = new Map(numbers.map((n) => [n.id, n.customerNumber]));
  return atRisk
    .filter((c) => !skip.has(c.customerId) && c.phone)
    .map((c) => ({ customerId: c.customerId, fullName: c.fullName, phone: c.phone, customerNumber: numberOf.get(c.customerId) ?? "", reason: c.reason, owedMinor: c.owedMinor }));
}

/** Records an offer about to be sent, with its text. */
export async function createWinBackOffer(tenantId: string, c: WinBackCandidate, sentByUserId: string | null = null): Promise<WinBackOffer> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, currency: true, preferences: true } });
  const prefs = resolveTenantPreferences(tenant.preferences).winBack;
  const message = winBackMessage({
    firstName: c.fullName.split(/\s+/)[0] ?? c.fullName,
    isp: tenant.name,
    discountPercent: prefs.discountPercent,
    validDays: prefs.validDays,
    owedMinor: c.owedMinor,
    accountNumber: c.customerNumber,
    currency: tenant.currency,
  });
  return prisma.winBackOffer.create({
    data: {
      tenantId,
      customerId: c.customerId,
      reason: c.reason,
      owedMinor: c.owedMinor,
      discountPercent: prefs.discountPercent,
      message,
      sentByUserId,
      expiresAt: new Date(Date.now() + prefs.validDays * DAY),
    },
  });
}

export async function markWinBackOfferFailed(id: string): Promise<void> {
  await prisma.winBackOffer.update({ where: { id }, data: { status: "FAILED" } });
}

/** Marks offers that worked (and credits the customer) or ran out. */
export async function settleWinBackOffers(now = new Date()): Promise<{ redeemed: number; expired: number }> {
  const open = await prisma.winBackOffer.findMany({ where: { status: "SENT" } });
  let redeemed = 0;
  let expired = 0;
  for (const offer of open) {
    const until = offer.expiresAt < now ? offer.expiresAt : now;
    const paid = await prisma.payment.aggregate({
      where: { customerId: offer.customerId, status: "COMPLETED", reversedAt: null, method: { not: "WALLET" }, createdAt: { gte: offer.sentAt, lte: until } },
      _sum: { amountMinor: true },
    });
    const paidMinor = paid._sum.amountMinor ?? 0;
    if (paidMinor > 0) {
      const creditMinor = winBackCredit(paidMinor, offer.owedMinor, offer.discountPercent);
      // Claim the offer first, so a second run can't credit it twice.
      const claimed = await prisma.winBackOffer.updateMany({ where: { id: offer.id, status: "SENT" }, data: { status: "REDEEMED", redeemedAt: now, paidMinor, creditMinor } });
      if (claimed.count === 0) continue;
      if (creditMinor > 0) {
        await creditWallet(prisma, offer.customerId, creditMinor, `Welcome back: ${offer.discountPercent}% of your payment returned as credit`, { referenceType: "WinBackOffer", referenceId: offer.id });
      }
      redeemed += 1;
    } else if (offer.expiresAt <= now) {
      await prisma.winBackOffer.update({ where: { id: offer.id }, data: { status: "EXPIRED" } });
      expired += 1;
    }
  }
  return { redeemed, expired };
}

/** How offers have done over a period, and the latest ones. */
export async function winBackReport(tenantId: string, days = 90) {
  const since = new Date(Date.now() - days * DAY);
  const offers = await prisma.winBackOffer.findMany({
    where: { tenantId, sentAt: { gte: since } },
    include: { customer: { select: { id: true, fullName: true, customerNumber: true } } },
    orderBy: { sentAt: "desc" },
  });
  const sent = offers.filter((o) => o.status !== "FAILED");
  const won = sent.filter((o) => o.status === "REDEEMED");
  const decided = sent.filter((o) => o.status !== "SENT");
  return {
    days,
    sent: sent.length,
    waiting: sent.filter((o) => o.status === "SENT").length,
    redeemed: won.length,
    failed: offers.length - sent.length,
    /** Of the offers that have run their course, the share that brought the customer back. */
    conversionPercent: decided.length ? Math.round((won.length / decided.length) * 100) : null,
    recoveredMinor: won.reduce((s, o) => s + (o.paidMinor ?? 0), 0),
    creditMinor: won.reduce((s, o) => s + (o.creditMinor ?? 0), 0),
    offers: offers.slice(0, 200),
  };
}
