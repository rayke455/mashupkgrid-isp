import { retryPendingSyncTasks, expireOverdueVouchers } from "@mashupkgrid/radius";
import { prisma } from "@mashupkgrid/database";
import { testRouterConnection, reconcileRouterProvisioning } from "@mashupkgrid/network";
import { notifyRouterRecovered, notifyRouterWentDown, routerAlertFor } from "./router-alerts.js";
import type { AutomationSummary } from "@mashupkgrid/shared";

export async function handleRetryPendingSyncTasks(): Promise<AutomationSummary> {
  const result = await retryPendingSyncTasks();
  console.log(`[network] retry-pending-sync-tasks: processed=${result.processed}`);
  return { processed: result.processed };
}

export async function handleExpireOverdueVouchers(): Promise<AutomationSummary> {
  const result = await expireOverdueVouchers();
  console.log(`[network] expire-overdue-vouchers: expired=${result.processed}`);
  return { expired: result.processed };
}

/** Polls every non-deleted router's health once per tick and persists the result — the same
 *  write `testRouterConnection` does for a manual "test connection" click, just on a schedule
 *  so the routers list stays accurate without staff needing to click anything. */
export async function handlePollRouterHealth(): Promise<AutomationSummary> {
  // `status` is selected so the transition can be detected: the alert below must fire on the
  // edge (was up, is now down), not on the state, or every poll would re-send it every 20s.
  const routers = await prisma.router.findMany({
    where: { deletedAt: null },
    select: { id: true, tenantId: true, name: true, status: true },
  });
  let succeeded = 0;
  let failed = 0;
  let alerted = 0;

  for (const router of routers) {
    try {
      const health = await testRouterConnection(router.tenantId, router.id);
      const alert = routerAlertFor(router.status, health.reachable);
      if (alert) {
        // Best-effort: a router really is down (or back) whether or not SMS/email cooperate, and
        // a failed notification must not stop the rest of the fleet being polled.
        try {
          const sent =
            alert === "down"
              ? await notifyRouterWentDown(router.tenantId, router.name, health.error ?? null)
              : await notifyRouterRecovered(router.tenantId, router.name);
          if (sent > 0) alerted += 1;
        } catch (err) {
          console.error(`[network] could not send the ${alert} alert for router ${router.id}`, err);
        }
      }
      if (health.reachable) {
        succeeded += 1;
        // Self-repair of the hotspot essentials; throttled inside, and never allowed to fail the poll.
        await reconcileRouterProvisioning(router.id).catch((err) =>
          console.warn(`[network] could not check hotspot setup on router ${router.id}:`, err instanceof Error ? err.message : err)
        );
        continue;
      }
      failed += 1;
    } catch (err) {
      failed += 1;
      console.error(`[network] poll-router-health: router ${router.id} failed`, err);
    }
  }
  console.log(
    `[network] poll-router-health: reachable=${succeeded} unreachable=${failed} alerts=${alerted}`
  );
  return { reachable: succeeded, unreachable: failed, alerts: alerted };
}
