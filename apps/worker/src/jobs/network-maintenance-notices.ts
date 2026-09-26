import { prisma } from "@mashupkgrid/database";
import type { AutomationSummary } from "@mashupkgrid/shared";
import { dueMaintenanceNotice, listMaintenanceRecipients, maintenanceAfterSms, maintenanceBeforeSms } from "@mashupkgrid/billing";
import { sendTenantSms } from "@mashupkgrid/sms";

/**
 * Texts customers on the affected routers or branch before planned network work starts, and again
 * once it is over. Each notice is marked sent before the texts go out, so an overlapping run can
 * never send it twice.
 */
export async function handleNetworkMaintenanceNotices(): Promise<AutomationSummary> {
  const now = new Date();
  const candidates = await prisma.networkMaintenance.findMany({
    where: {
      status: "SCHEDULED",
      afterSentAt: null,
      endsAt: { gte: new Date(now.getTime() - 6 * 3_600_000) },
      startsAt: { lte: new Date(now.getTime() + 8 * 86_400_000) },
    },
    include: { tenant: { select: { name: true, timezone: true } } },
  });

  let notices = 0;
  let texted = 0;
  let failed = 0;
  for (const m of candidates) {
    const due = dueMaintenanceNotice(m, now);
    if (!due) continue;
    const field = due === "before" ? "beforeSentAt" : "afterSentAt";
    const claimed = await prisma.networkMaintenance.updateMany({ where: { id: m.id, [field]: null, status: "SCHEDULED" }, data: { [field]: now } });
    if (claimed.count === 0) continue;
    notices += 1;

    const recipients = await listMaintenanceRecipients(m.tenantId, { scope: m.scope, routerIds: m.routerIds, branchId: m.branchId });
    const tz = m.tenant.timezone || "Africa/Nairobi";
    const text = due === "before" ? maintenanceBeforeSms(m, m.tenant.name, tz) : maintenanceAfterSms(m.tenant.name);
    let sent = 0;
    for (const r of recipients) {
      try {
        if ((await sendTenantSms(m.tenantId, r.phone, text)).delivered) sent += 1;
        else failed += 1;
      } catch (err) {
        failed += 1;
        console.error(`[maintenance] SMS to customer ${r.customerId} failed`, err);
      }
    }
    texted += sent;
    await prisma.networkMaintenance.update({ where: { id: m.id }, data: { recipientCount: sent } });
  }
  return { checked: candidates.length, notices, texted, failed };
}
