import { prisma } from "@mashupkgrid/database";
import type { AutomationSummary } from "@mashupkgrid/shared";
import { grantDueReferralRewards } from "@mashupkgrid/billing";
import { sendTenantSms } from "@mashupkgrid/sms";
import { formatMoney } from "../lib/format.js";

/** Rewards customers whose referred neighbour has now paid, and thanks them by SMS. */
export async function handleReferralRewards(): Promise<AutomationSummary> {
  const tenants = await prisma.tenant.findMany({ where: { status: "ACTIVE", deletedAt: null }, select: { id: true, name: true, currency: true } });
  let rewarded = 0;
  let errors = 0;
  for (const tenant of tenants) {
    try {
      const granted = await grantDueReferralRewards(tenant.id);
      rewarded += granted.length;
      for (const g of granted) {
        const first = g.referrer.fullName.split(/\s+/)[0] ?? g.referrer.fullName;
        const what =
          g.reward.type === "DAYS"
            ? `${g.reward.days} free days have been added to your plan`
            : `${formatMoney(g.reward.amountMinor ?? 0, tenant.currency || "KES")} has been added to your account`;
        await sendTenantSms(tenant.id, g.referrer.phone, `Thank you ${first}! ${g.referredName} joined ${tenant.name} with your code, so ${what}.`).catch(() => undefined);
      }
    } catch (err) {
      errors += 1;
      console.error(`[referrals] tenant ${tenant.id} failed`, err);
    }
  }
  return { tenants: tenants.length, rewarded, errors };
}
