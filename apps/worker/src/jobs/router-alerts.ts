import { prisma } from "@mashupkgrid/database";
import { sendTenantSms } from "@mashupkgrid/sms";
import { pushToTenantStaff } from "@mashupkgrid/push";
import { resolveTenantPreferences } from "@mashupkgrid/shared";
import { sendEmail } from "../lib/email.js";

/**
 * Tells someone when a router goes down, and again when it comes back.
 *
 * Router status became trustworthy when the liveness check stopped refreshing its own timestamp,
 * but an accurate status nobody is looking at is still an outage discovered by angry customers.
 * This closes that loop.
 *
 * Fires only on transitions (was up → now down, was down → now up), which is what makes a
 * cooldown unnecessary: the status column changes once, so one alert is sent per outage no
 * matter how often the health poll runs. A router that was never up (added but not set up yet,
 * status UNKNOWN) never alerts.
 */

type RouterStatus = "UNKNOWN" | "ONLINE" | "WARNING" | "DOWN";

/** The alert to send for this poll, if any. */
export function routerAlertFor(previous: RouterStatus, reachableNow: boolean): "down" | "recovered" | null {
  if (!reachableNow && (previous === "ONLINE" || previous === "WARNING")) return "down";
  if (reachableNow && previous === "DOWN") return "recovered";
  return null;
}

/** Staff who should hear about it: this tenant's active users who can actually act on a router,
 *  rather than everyone with a login. Waking a receptionist at 2am trains people to ignore
 *  alerts, which is worse than not sending them. */
async function alertRecipients(tenantId: string): Promise<{ id: string; phone: string | null; email: string }[]> {
  return prisma.user.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      deletedAt: null,
      userRoles: {
        some: { role: { rolePermissions: { some: { permission: { key: "routers.manage" } } } } },
      },
    },
    select: { id: true, phone: true, email: true },
  });
}

/** Sends by SMS where the tenant has a gateway and the user a phone, and by email to everyone
 *  (when the server has SMTP). Returns how many people were reached by at least one of them. */
async function notify(tenantId: string, sms: string, subject: string, body: string): Promise<number> {
  const recipients = await alertRecipients(tenantId);
  let reached = 0;
  for (const recipient of recipients) {
    let delivered = false;
    // Each channel on its own: one unreachable number or mailbox must not stop the others.
    if (recipient.phone) {
      try {
        delivered = (await sendTenantSms(tenantId, recipient.phone, sms)).delivered || delivered;
      } catch (err) {
        console.error(`[router-alerts] SMS to ${recipient.id} failed`, err);
      }
    }
    try {
      delivered = (await sendEmail({ to: recipient.email, subject, text: body, html: `<p>${escapeHtml(body)}</p>` })).delivered || delivered;
    } catch (err) {
      console.error(`[router-alerts] email to ${recipient.id} failed`, err);
    }
    if (delivered) reached += 1;
  }
  return reached;
}

/** Also alerts the phones and computers where staff who manage routers turned alerts on, unless
 *  the ISP switched router alerts off. A push failure never stops the SMS and email. */
async function pushRouterAlert(tenantId: string, title: string, body: string, tag: string): Promise<void> {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { preferences: true } });
    if (!resolveTenantPreferences(tenant?.preferences).alerts.routerDown) return;
    await pushToTenantStaff(tenantId, "routers.manage", { title, body, url: "/routers", tag });
  } catch (err) {
    console.error(`[router-alerts] push for tenant ${tenantId} failed`, err);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export async function notifyRouterWentDown(tenantId: string, routerName: string, lastError: string | null): Promise<number> {
  // Deliberately short and specific: an SMS that names the router and says what to check is
  // actionable from a phone at night; "an error occurred" is not.
  const reason = lastError ? ` (${lastError.slice(0, 60)})` : "";
  const sms = `ALERT: router "${routerName}" is DOWN and has stopped reporting${reason}. Customers on it cannot get online.`;
  const body =
    `Router "${routerName}" stopped responding${reason}. Customers connected through it cannot get online.\n\n` +
    `Check its power and internet connection. You'll get another message when it's back.`;
  await pushRouterAlert(tenantId, `Router "${routerName}" is down`, `It stopped reporting${reason}. Customers on it cannot get online.`, `router-${routerName}`);
  return notify(tenantId, sms, `Router "${routerName}" is down`, body);
}

export async function notifyRouterRecovered(tenantId: string, routerName: string): Promise<number> {
  const sms = `OK: router "${routerName}" is back online.`;
  await pushRouterAlert(tenantId, `Router "${routerName}" is back online`, "It is responding again.", `router-${routerName}`);
  return notify(tenantId, sms, `Router "${routerName}" is back online`, `Router "${routerName}" is responding again.`);
}
