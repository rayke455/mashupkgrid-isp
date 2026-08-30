import { Redis } from "ioredis";
import { env } from "@mashupkgrid/config";

/**
 * Single shared Redis connection for caching, rate limiting, and (later) queues in this
 * process. `lazyConnect: false` so a broken Redis fails fast at boot rather than on the first
 * request.
 */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
});

redis.on("error", (err: Error) => {
  // eslint-disable-next-line no-console
  console.error("[redis] connection error", err);
});
