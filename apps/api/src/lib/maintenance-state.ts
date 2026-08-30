import { prisma, type MaintenanceEvent } from "@mashupkgrid/database";
import { redis } from "./redis.js";

const CACHE_KEY = "platform:maintenance";
const CACHE_TTL_SECONDS = 30;

export async function getCurrentMaintenanceState(): Promise<MaintenanceEvent> {
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) return JSON.parse(cached) as MaintenanceEvent;
  } catch {
    // fall through to DB
  }

  const latest = await prisma.maintenanceEvent.findFirst({ orderBy: { createdAt: "desc" } });
  const state: MaintenanceEvent =
    latest ??
    ({
      id: "default",
      enabled: false,
      level: 1,
      message: null,
      startAt: null,
      endAt: null,
      allowLogin: true,
      allowCustomerPortal: true,
      allowPayments: true,
      allowWebhooks: true,
      allowApi: true,
      allowedRoles: ["SUPER_ADMIN"],
      allowedIps: [],
      updatedBy: "system",
      createdAt: new Date(),
    } satisfies MaintenanceEvent);

  try {
    await redis.set(CACHE_KEY, JSON.stringify(state), "EX", CACHE_TTL_SECONDS);
  } catch {
    // best-effort cache write
  }
  return state;
}

/** Called immediately after an admin writes a new MaintenanceEvent row, so the new state takes
 *  effect for the very next request rather than waiting out the cache TTL. */
export async function invalidateMaintenanceCache(): Promise<void> {
  try {
    await redis.del(CACHE_KEY);
  } catch {
    // TTL bounds staleness even if this fails
  }
}
