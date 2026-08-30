import { Redis } from "ioredis";
import { env } from "@mashupkgrid/config";

export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });

redis.on("error", (err: Error) => {
  console.error("[redis] connection error", err);
});

/** Mirrors apps/api/src/lib/maintenance-state.ts's cache key — invalidated here too so a
 *  scheduled maintenance flip takes effect immediately instead of waiting out the 30s TTL. */
export async function invalidateMaintenanceCache(): Promise<void> {
  try {
    await redis.del("platform:maintenance");
  } catch {
    // best-effort; the cache TTL bounds staleness regardless
  }
}
