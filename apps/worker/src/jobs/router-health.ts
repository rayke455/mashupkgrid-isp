import { prisma } from "@mashupkgrid/database";
import type { DeviceHealth } from "@mashupkgrid/network";
import { pushToTenantStaff } from "@mashupkgrid/push";
import { redis } from "../lib/redis.js";

/**
 * Keeps a health reading per router every 5 minutes, and raises three alerts to the staff who
 * manage routers: CPU pinned at 90%+ for three readings in a row, the board running at 75 °C or
 * hotter, and a reboot nobody planned (uptime went backwards with no update running on it).
 * Each alert is sent at most once every 6 hours per router.
 */

const SAMPLE_EVERY_MS = 5 * 60_000;
export const CPU_ALERT = 90;
export const TEMP_ALERT = 75;
const COOLDOWN_S = 6 * 3600;
const lastSampleAt = new Map<string, number>();

type Kind = "cpu" | "temperature" | "reboot";

export interface HealthReading {
  reachable: boolean;
  cpuPercent: number | null;
  temperatureC: number | null;
  uptimeSeconds: number | null;
}

/** Which alerts a new reading raises, given the readings before it (newest first). */
export function healthAlertsFor(current: HealthReading, previous: HealthReading[], plannedRestart: boolean): Kind[] {
  const out: Kind[] = [];
  if (!current.reachable) return out;
  const lastTwo = previous.filter((p) => p.reachable).slice(0, 2);
  if (current.cpuPercent !== null && current.cpuPercent >= CPU_ALERT && lastTwo.length === 2 && lastTwo.every((p) => (p.cpuPercent ?? 0) >= CPU_ALERT)) out.push("cpu");
  if (current.temperatureC !== null && current.temperatureC >= TEMP_ALERT) out.push("temperature");
  const before = previous.find((p) => p.reachable && p.uptimeSeconds !== null);
  if (!plannedRestart && current.uptimeSeconds !== null && before?.uptimeSeconds != null && current.uptimeSeconds < before.uptimeSeconds) out.push("reboot");
  return out;
}

function toReading(h: DeviceHealth): HealthReading & { memoryPercent: number | null } {
  return {
    reachable: h.reachable,
    cpuPercent: h.cpuLoadPercent ?? null,
    memoryPercent: h.memoryUsedBytes !== undefined && h.memoryTotalBytes ? Math.round(Number((h.memoryUsedBytes * 100n) / h.memoryTotalBytes)) : null,
    temperatureC: h.temperatureC ?? null,
    uptimeSeconds: h.uptimeSeconds ?? null,
  };
}

export async function recordRouterHealth(router: { id: string; tenantId: string; name: string }, health: DeviceHealth): Promise<void> {
  const now = Date.now();
  if (now - (lastSampleAt.get(router.id) ?? 0) < SAMPLE_EVERY_MS) return;
  const newest = await prisma.routerHealthSample.findFirst({ where: { routerId: router.id }, orderBy: { at: "desc" }, select: { at: true } });
  if (newest && now - newest.at.getTime() < SAMPLE_EVERY_MS - 10_000) {
    lastSampleAt.set(router.id, newest.at.getTime());
    return;
  }
  lastSampleAt.set(router.id, now);

  const reading = toReading(health);
  const previous = await prisma.routerHealthSample.findMany({ where: { routerId: router.id }, orderBy: { at: "desc" }, take: 3 });
  await prisma.routerHealthSample.create({ data: { routerId: router.id, ...reading } });

  // A reboot within 20 minutes of an update on this router was planned.
  const planned = await prisma.routerRolloutTarget.count({ where: { routerId: router.id, finishedAt: { gte: new Date(now - 20 * 60_000) } } });
  const kinds = healthAlertsFor(reading, previous, planned > 0);
  for (const kind of kinds) {
    const claimed = await redis.set(`router-health-alert:${router.id}:${kind}`, "1", "EX", COOLDOWN_S, "NX");
    if (claimed !== "OK") continue;
    const message =
      kind === "cpu"
        ? { title: `${router.name}: CPU at ${reading.cpuPercent}%`, body: "It has been above 90% for 15 minutes. Customers on it may see slow speeds." }
        : kind === "temperature"
          ? { title: `${router.name} is running hot: ${reading.temperatureC} °C`, body: "Check its ventilation and power. Heat shortens a router's life and causes drop-outs." }
          : { title: `${router.name} restarted`, body: "It rebooted without an update being run on it. Check its power supply if this repeats." };
    await pushToTenantStaff(router.tenantId, "routers.manage", { ...message, url: "/routers/health", tag: `health-${router.id}-${kind}` }).catch(() => 0);
  }
}

/** Readings older than 30 days are dropped. */
export async function pruneHealthSamples(): Promise<number> {
  const { count } = await prisma.routerHealthSample.deleteMany({ where: { at: { lt: new Date(Date.now() - 30 * 86_400_000) } } });
  return count;
}
