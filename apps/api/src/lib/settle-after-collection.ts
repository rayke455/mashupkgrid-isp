import type { FastifyBaseLogger } from "fastify";
import { settleTenantIfInstant } from "@mashupkgrid/payments";

/**
 * Start an INSTANT settlement once a platform collection has committed. It runs after the current
 * request is answered, so a slow payout provider never delays Safaricom's callback; if it fails,
 * the worker's scheduled settlement run picks the balance up.
 */
export function settleAfterCollection(tenantId: string, log: FastifyBaseLogger): void {
  setImmediate(() => {
    settleTenantIfInstant(tenantId).catch((err) => log.error({ err, tenantId }, "Instant settlement after collection failed"));
  });
}
