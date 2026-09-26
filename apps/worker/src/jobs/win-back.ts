import { prisma } from "@mashupkgrid/database";
import { resolveTenantPreferences, type AutomationSummary } from "@mashupkgrid/shared";
import { createWinBackOffer, markWinBackOfferFailed, settleWinBackOffers, winBackCandidates } from "@mashupkgrid/billing";
import { sendTenantSms } from "@mashupkgrid/sms";
import { localParts } from "./auto-router-updates.js";

/** At most this many offers per ISP per run, so a first run on a big base doesn't flood. */
const PER_RUN = 50;

/** Offers go out in the daytime only, in the ISP's own time zone. */
export function isSendingHour(now: Date, timeZone: string): boolean {
  const { hour } = localParts(now, timeZone);
  return hour >= 9 && hour < 18;
}

/** Settles offers that worked or ran out, then texts new offers to at-risk customers. */
export async function handleWinBackOffers(now = new Date()): Promise<AutomationSummary> {
  const { redeemed, expired } = await settleWinBackOffers(now);
  let sent = 0;
  let failed = 0;
  const tenants = await prisma.tenant.findMany({ where: { status: "ACTIVE", deletedAt: null }, select: { id: true, timezone: true, preferences: true } });
  for (const tenant of tenants) {
    if (!resolveTenantPreferences(tenant.preferences).winBack.enabled) continue;
    if (!isSendingHour(now, tenant.timezone)) continue;
    const candidates = (await winBackCandidates(tenant.id)).slice(0, PER_RUN);
    for (const c of candidates) {
      const offer = await createWinBackOffer(tenant.id, c);
      const ok = await sendTenantSms(tenant.id, c.phone, offer.message)
        .then((r) => r.delivered)
        .catch(() => false);
      if (ok) sent += 1;
      else {
        failed += 1;
        await markWinBackOfferFailed(offer.id);
      }
    }
  }
  return { sent, failed, redeemed, expired };
}
