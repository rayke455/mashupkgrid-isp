import { randomInt } from "node:crypto";
import { prisma, type ReferralReward } from "@mashupkgrid/database";
import { ConflictError, NotFoundError, resolveTenantPreferences } from "@mashupkgrid/shared";
import { creditWallet } from "./wallet.service.js";

/**
 * Refer-a-neighbour. Every customer has a short code; a new customer entered with that code is
 * linked to whoever shared it, and once the new customer's first payment completes the referrer is
 * rewarded once: free days on their plan, or account credit, as the ISP chooses.
 */

/** No 0/O or 1/I/L, so a code read out over the phone is typed right. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const DAY = 86_400_000;

export function generateReferralCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

export function normalizeReferralCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** The customer's code, created the first time it is asked for. */
export async function ensureReferralCode(tenantId: string, customerId: string): Promise<string> {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId }, select: { referralCode: true } });
  if (!customer) throw new NotFoundError("Customer");
  if (customer.referralCode) return customer.referralCode;
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateReferralCode();
    try {
      // Only set it if still empty, so two tabs asking at once end up with one code.
      const updated = await prisma.customer.updateMany({ where: { id: customerId, tenantId, referralCode: null }, data: { referralCode: code } });
      if (updated.count === 0) break;
      return code;
    } catch (err) {
      // Unique clash with another customer's code in this tenant: try another.
      if ((err as { code?: string }).code !== "P2002") throw err;
    }
  }
  const again = await prisma.customer.findFirst({ where: { id: customerId, tenantId }, select: { referralCode: true } });
  if (!again?.referralCode) throw new ConflictError("Could not create a referral code, try again");
  return again.referralCode;
}

/** Finds the referrer for a code in this tenant. */
export async function findReferrerByCode(tenantId: string, code: string): Promise<{ id: string; fullName: string } | null> {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return null;
  return prisma.customer.findFirst({ where: { tenantId, referralCode: normalized, deletedAt: null }, select: { id: true, fullName: true } });
}

/**
 * Links a customer to the referrer who owns `code`. Refused for a customer who already has a
 * referrer, who has already paid (the reward is for bringing in new customers), or who would be
 * referring themselves.
 */
export async function setReferrer(tenantId: string, customerId: string, code: string): Promise<{ referrerId: string; referrerName: string }> {
  const referrer = await findReferrerByCode(tenantId, code);
  if (!referrer) throw new NotFoundError("Referral code");
  if (referrer.id === customerId) throw new ConflictError("A customer cannot refer themselves");
  const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId }, select: { referredById: true } });
  if (!customer) throw new NotFoundError("Customer");
  if (customer.referredById) throw new ConflictError("This customer already has a referrer");
  const paid = await prisma.payment.count({ where: { tenantId, customerId, status: "COMPLETED", reversedAt: null, amountMinor: { gt: 0 } } });
  if (paid > 0) throw new ConflictError("This customer has already paid, so a referral can no longer be added");
  await prisma.customer.update({ where: { id: customerId }, data: { referredById: referrer.id } });
  return { referrerId: referrer.id, referrerName: referrer.fullName };
}

export interface GrantedReward {
  reward: ReferralReward;
  referrer: { fullName: string; phone: string };
  referredName: string;
}

/**
 * Rewards every referrer whose referred customer has now paid. Each referred customer is claimed
 * (referralRewardedAt set) before the reward is written, so a reward is never given twice.
 */
export async function grantDueReferralRewards(tenantId: string): Promise<GrantedReward[]> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { preferences: true } });
  const prefs = resolveTenantPreferences(tenant?.preferences).referrals;
  if (!prefs.enabled) return [];

  const due = await prisma.customer.findMany({
    where: {
      tenantId,
      referredById: { not: null },
      referralRewardedAt: null,
      deletedAt: null,
      payments: { some: { status: "COMPLETED", reversedAt: null, amountMinor: { gt: 0 } } },
      referredBy: { deletedAt: null },
    },
    select: { id: true, fullName: true, referredById: true },
    take: 500,
  });

  const granted: GrantedReward[] = [];
  for (const referred of due) {
    const claimed = await prisma.customer.updateMany({ where: { id: referred.id, referralRewardedAt: null }, data: { referralRewardedAt: new Date() } });
    if (claimed.count === 0) continue;
    const referrerId = referred.referredById!;

    const reward = await prisma.$transaction(async (tx) => {
      const activeService =
        prefs.rewardType === "DAYS"
          ? await tx.customerService.findFirst({ where: { tenantId, customerId: referrerId, status: "ACTIVE" }, orderBy: { nextBillingAt: "asc" } })
          : null;
      if (activeService) {
        await tx.customerService.update({
          where: { id: activeService.id },
          data: { nextBillingAt: new Date(activeService.nextBillingAt.getTime() + prefs.rewardDays * DAY) },
        });
        return tx.referralReward.create({ data: { tenantId, referrerId, referredId: referred.id, type: "DAYS", days: prefs.rewardDays } });
      }
      // Credit, or the fallback for a referrer with no active plan to extend.
      if (prefs.rewardCreditMinor > 0) {
        await creditWallet(tx, referrerId, prefs.rewardCreditMinor, `Referral reward for ${referred.fullName}`, { referenceType: "ReferralReward", referenceId: referred.id });
      }
      return tx.referralReward.create({ data: { tenantId, referrerId, referredId: referred.id, type: "CREDIT", amountMinor: prefs.rewardCreditMinor } });
    });

    const referrer = await prisma.customer.findUniqueOrThrow({ where: { id: referrerId }, select: { fullName: true, phone: true } });
    granted.push({ reward, referrer, referredName: referred.fullName });
  }
  return granted;
}

export async function getReferralSummary(tenantId: string, customerId: string) {
  const [code, referred, rewards] = await Promise.all([
    ensureReferralCode(tenantId, customerId),
    prisma.customer.findMany({
      where: { tenantId, referredById: customerId, deletedAt: null },
      select: { id: true, fullName: true, createdAt: true, referralRewardedAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.referralReward.findMany({ where: { tenantId, referrerId: customerId }, select: { type: true, days: true, amountMinor: true } }),
  ]);
  return {
    code,
    referred: referred.map((r) => ({ id: r.id, fullName: r.fullName, joinedAt: r.createdAt, rewarded: r.referralRewardedAt !== null })),
    freeDaysEarned: rewards.reduce((s, r) => s + (r.days ?? 0), 0),
    creditEarnedMinor: rewards.reduce((s, r) => s + (r.amountMinor ?? 0), 0),
  };
}

export async function listReferralRewards(tenantId: string) {
  return prisma.referralReward.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { referrer: { select: { id: true, fullName: true } }, referred: { select: { id: true, fullName: true } } },
  });
}
