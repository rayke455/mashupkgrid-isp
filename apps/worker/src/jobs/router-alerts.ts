import { prisma } from "@mashupkgrid/database";
import { sendTenantSms } from "@mashupkgrid/sms";

/**
 * Tells someone when a router goes down.
 *
 * Router status became trustworthy when the liveness check stopped refreshing its own timestamp,
 * but an accurate status nobody is looking at is still an outage discovered by angry customers.
 * This closes that loop.
 *
 * Fires only on the ONLINE→DOWN transition, which is what makes a cooldown unnecessary: the
 * status column changes once, so one alert is sent per outage no matter how often the health
 * poll runs (every 20 seconds). A router that genuinely flaps will alert per flap, and the
 * ten-minute liveness window already damps that.
 */

/** Staff who should hear about it: this tenant's active users who can actually act on a router,
 *  rather than everyone with a login. Waking a receptionist at 2am trains people to ignore
 *  alerts, which is worse than not sending them. */
async function alertRecipients(tenantId: string): Promise<{ id: string; phone: string }[]> {
  const users = await prisma.user.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      deletedAt: null,
      phone: { not: null },
      userRoles: {
        some: { role: { rolePermissions: { some: { permission: { key: "routers.manage" } } } } },
      },
    },
    select: { id: true, phone: true },
  });
  return users.flatMap((user) => (user.phone ? [{ id: user.id, phone: user.phone }] : []));
}

export async function notifyRouterWentDown(
  tenantId: string,
  routerName: string,
  lastError: string | null
): Promise<number> {
  const recipients = await alertRecipients(tenantId);
  if (recipients.length === 0) return 0;

  // Deliberately short and specific: an SMS that names the router and says what to check is
  // actionable from a phone at night; "an error occurred" is not.
  const reason = lastError ? ` (${lastError.slice(0, 60)})` : "";
  const message = `ALERT: router "${routerName}" is DOWN and has stopped reporting${reason}. Customers on it cannot get online.`;

  let sent = 0;
  for (const recipient of recipients) {
    try {
      const result = await sendTenantSms(tenantId, recipient.phone, message);
      if (result.delivered) sent += 1;
    } catch (err) {
      // One unreachable number must not stop the others being told.
      console.error(`[router-alerts] SMS to ${recipient.id} failed`, err);
    }
  }
  return sent;
}
