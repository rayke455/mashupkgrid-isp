import { prisma, type NetworkMaintenance } from "@mashupkgrid/database";

/**
 * Who planned network work affects, and what they are told. A customer is on a router when their
 * package is provisioned on it, or when they had a RADIUS session through it in the last 30 days
 * (which catches customers whose package is not pinned to one router).
 */

const DAY = 86_400_000;

export interface MaintenanceAudience {
  scope: "ALL" | "ROUTERS" | "BRANCH";
  routerIds: string[];
  branchId: string | null;
}

export interface MaintenanceRecipient {
  customerId: string;
  fullName: string;
  phone: string;
}

export async function listMaintenanceRecipients(tenantId: string, audience: MaintenanceAudience): Promise<MaintenanceRecipient[]> {
  const base = { tenantId, deletedAt: null, services: { some: { status: { in: ["ACTIVE" as const, "SUSPENDED" as const] } } } };
  let customers: { id: string; fullName: string; phone: string }[];

  if (audience.scope === "BRANCH") {
    if (!audience.branchId) return [];
    customers = await prisma.customer.findMany({ where: { ...base, branchId: audience.branchId }, select: { id: true, fullName: true, phone: true } });
  } else if (audience.scope === "ROUTERS") {
    if (!audience.routerIds.length) return [];
    // Only this tenant's routers, whatever ids were sent.
    const routers = await prisma.router.findMany({ where: { tenantId, id: { in: audience.routerIds } }, select: { id: true } });
    const routerIds = routers.map((r) => r.id);
    if (!routerIds.length) return [];
    const nas = await prisma.radiusNas.findMany({ where: { tenantId, routerId: { in: routerIds } }, select: { nasname: true } });
    const recentUsernames = nas.length
      ? (
          await prisma.radAcct.findMany({
            where: { tenantId, nasIpAddress: { in: nas.map((n) => n.nasname) }, acctStartTime: { gte: new Date(Date.now() - 30 * DAY) } },
            select: { username: true },
            distinct: ["username"],
          })
        ).map((r) => r.username)
      : [];
    customers = await prisma.customer.findMany({
      where: {
        ...base,
        OR: [
          { services: { some: { status: { in: ["ACTIVE", "SUSPENDED"] }, package: { routerId: { in: routerIds } } } } },
          ...(recentUsernames.length ? [{ services: { some: { radiusUser: { username: { in: recentUsernames } } } } }] : []),
        ],
      },
      select: { id: true, fullName: true, phone: true },
    });
  } else {
    customers = await prisma.customer.findMany({ where: base, select: { id: true, fullName: true, phone: true } });
  }

  // One text per phone number, even when a household has two accounts on it.
  const seen = new Set<string>();
  return customers
    .filter((c) => {
      const key = c.phone.replace(/\D/g, "").slice(-9);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((c) => ({ customerId: c.id, fullName: c.fullName, phone: c.phone }));
}

function when(d: Date, timeZone: string): { day: string; time: string } {
  return {
    day: d.toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short", timeZone }),
    time: d.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }),
  };
}

export function maintenanceBeforeSms(m: Pick<NetworkMaintenance, "startsAt" | "endsAt" | "message">, isp: string, timeZone: string): string {
  const start = when(m.startsAt, timeZone);
  const end = when(m.endsAt, timeZone);
  const window = start.day === end.day ? `${start.day} ${start.time}-${end.time}` : `${start.day} ${start.time} to ${end.day} ${end.time}`;
  const extra = m.message ? ` ${m.message.trim()}` : "";
  return `${isp}: planned network maintenance ${window}. Your internet may be off during this time.${extra}`;
}

export function maintenanceAfterSms(isp: string): string {
  return `${isp}: the planned maintenance is finished and your internet is back. Still offline? Restart your router, or contact ${isp} support.`;
}

export function maintenanceCancelledSms(m: Pick<NetworkMaintenance, "startsAt">, isp: string, timeZone: string): string {
  const start = when(m.startsAt, timeZone);
  return `${isp}: the network maintenance planned for ${start.day} ${start.time} is cancelled. Your internet will not be interrupted.`;
}

/** Which notice, if any, is due for this maintenance now. */
export function dueMaintenanceNotice(
  m: Pick<NetworkMaintenance, "status" | "startsAt" | "endsAt" | "notifyHoursBefore" | "beforeSentAt" | "afterSentAt">,
  now = new Date()
): "before" | "after" | null {
  if (m.status !== "SCHEDULED") return null;
  if (!m.afterSentAt && m.endsAt <= now) {
    // Too late to be useful: a window that ended more than 6 hours ago gets no "back online" text.
    return now.getTime() - m.endsAt.getTime() <= 6 * 3_600_000 ? "after" : null;
  }
  if (!m.beforeSentAt && m.startsAt > now && m.startsAt.getTime() - m.notifyHoursBefore * 3_600_000 <= now.getTime()) return "before";
  return null;
}
