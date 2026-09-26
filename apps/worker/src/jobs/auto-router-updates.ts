import { prisma } from "@mashupkgrid/database";
import { resolveTenantPreferences, type AutomationSummary } from "@mashupkgrid/shared";
import { redis } from "../lib/redis.js";

/**
 * Starts each ISP's monthly RouterOS upgrade at the day and hour it chose, in its own timezone:
 * one rollout for RouterOS (first router alone, the rest if it worked), and optionally one for
 * RouterBOARD firmware 45 minutes later, once the upgrade reboots are over. A Redis key per ISP
 * per month makes sure a month never gets two.
 */

export function localParts(now: Date, timeZone: string): { year: number; month: number; day: number; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour) };
}

export function isAutoUpdateDue(now: Date, timeZone: string, dayOfMonth: number, hour: number): boolean {
  const local = localParts(now, timeZone);
  return local.day === dayOfMonth && local.hour === hour;
}

export async function handleAutoRouterUpdates(): Promise<AutomationSummary> {
  const now = new Date();
  const tenants = await prisma.tenant.findMany({ where: { status: "ACTIVE", deletedAt: null }, select: { id: true, timezone: true, preferences: true } });
  let started = 0;
  for (const tenant of tenants) {
    const prefs = resolveTenantPreferences(tenant.preferences).autoUpdate;
    if (!prefs.enabled) continue;
    const tz = tenant.timezone || "Africa/Nairobi";
    if (!isAutoUpdateDue(now, tz, prefs.dayOfMonth, prefs.hour)) continue;
    const local = localParts(now, tz);
    const claimed = await redis.set(`auto-router-update:${tenant.id}:${local.year}-${local.month}`, "1", "EX", 40 * 86_400, "NX");
    if (claimed !== "OK") continue;

    const routers = await prisma.router.findMany({
      where: { tenantId: tenant.id, deletedAt: null, vendor: "MIKROTIK", OR: [{ host: { not: null } }, { vpnIp: { not: null } }] },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    if (!routers.length) continue;
    const targets = { create: routers.map((r, position) => ({ routerId: r.id, routerName: r.name, position })) };
    await prisma.routerRollout.create({
      data: { tenantId: tenant.id, action: "routeros-upgrade", params: { automatic: true }, canaryFirst: routers.length > 1, status: "RUNNING", targets },
    });
    if (prefs.includeFirmware) {
      await prisma.routerRollout.create({
        data: {
          tenantId: tenant.id,
          action: "firmware-upgrade",
          params: { automatic: true },
          canaryFirst: routers.length > 1,
          status: "SCHEDULED",
          scheduledFor: new Date(now.getTime() + 45 * 60_000),
          targets: { create: routers.map((r, position) => ({ routerId: r.id, routerName: r.name, position })) },
        },
      });
    }
    started += 1;
  }
  return { tenants: tenants.length, started };
}
