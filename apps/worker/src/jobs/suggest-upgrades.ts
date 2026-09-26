import { prisma } from "@mashupkgrid/database";
import { resolveTenantPreferences, type AutomationSummary } from "@mashupkgrid/shared";
import { findUpgradeSuggestions, upgradeSuggestionSms } from "@mashupkgrid/billing";
import { sendTenantSms } from "@mashupkgrid/sms";
import { pushToTenantStaff } from "@mashupkgrid/push";
import { formatMoney } from "../lib/format.js";

/**
 * Looks for subscribers running into their data cap, records a suggested bigger plan for staff to
 * apply, texts the customer about it when the ISP allows, and tells staff on their devices.
 */
export async function handleSuggestUpgrades(): Promise<AutomationSummary> {
  const tenants = await prisma.tenant.findMany({ where: { status: "ACTIVE", deletedAt: null }, select: { id: true, name: true, preferences: true } });
  let found = 0;
  let texted = 0;
  let errors = 0;
  for (const tenant of tenants) {
    try {
      const suggestions = await findUpgradeSuggestions(tenant.id);
      found += suggestions.length;
      if (!suggestions.length) continue;
      const prefs = resolveTenantPreferences(tenant.preferences).upgrades;
      if (prefs.smsCustomer) {
        for (const s of suggestions) {
          const sms = upgradeSuggestionSms({
            firstName: s.customer.fullName.split(/\s+/)[0] ?? s.customer.fullName,
            isp: tenant.name,
            usedMb: s.usedMb,
            capMb: s.capMb,
            fromPackage: s.fromPackageName,
            toPackage: s.toPackageName,
            price: `${formatMoney(s.toPriceMinor, s.currency)} a month`,
          });
          try {
            if ((await sendTenantSms(tenant.id, s.customer.phone, sms)).delivered) {
              texted += 1;
              await prisma.upgradeSuggestion.update({ where: { id: s.id }, data: { smsSentAt: new Date() } });
            }
          } catch (err) {
            console.error(`[upgrades] SMS for suggestion ${s.id} failed`, err);
          }
        }
      }
      await pushToTenantStaff(tenant.id, "customers.update", {
        title: `${suggestions.length} customer${suggestions.length === 1 ? "" : "s"} could use a bigger plan`,
        body: "They keep running into their data cap. Review and apply the upgrades.",
        url: "/customers/upgrades",
        tag: "upgrade-suggestions",
      }).catch(() => 0);
    } catch (err) {
      errors += 1;
      console.error(`[upgrades] tenant ${tenant.id} failed`, err);
    }
  }
  return { tenants: tenants.length, found, texted, errors };
}
