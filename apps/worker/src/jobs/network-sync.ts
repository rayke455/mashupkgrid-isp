import { retryPendingSyncTasks, expireOverdueVouchers } from "@mashupkgrid/radius";
import { prisma } from "@mashupkgrid/database";
import { testRouterConnection } from "@mashupkgrid/network";
import { notifyRouterWentDown } from "./router-alerts.js";

export async function handleRetryPendingSyncTasks(): Promise<void> {
  const result = await retryPendingSyncTasks();
  console.log(`[network] retry-pending-sync-tasks: processed=${result.processed}`);
}

export async function handleExpireOverdueVouchers(): Promise<void> {
  const result = await expireOverdueVouchers();
  console.log(`[network] expire-overdue-vouchers: expired=${result.processed}`);
}

/** Polls every non-deleted router's health once per tick and persists the result — the same
 *  write `testRouterConnection` does for a manual "test connection" click, just on a schedule
 *  so the routers list stays accurate without staff needing to click anything. */
export async function handlePollRouterHealth(): Promise<void> {
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
      if (health.reachable) {
        succeeded += 1;
        continue;
      }
      failed += 1;

      if (router.status !== "DOWN") {
        // Best-effort: a router really is down whether or not the SMS gateway cooperates, and a
        // failed notification must not stop the rest of the fleet being polled.
        try {
          const sent = await notifyRouterWentDown(router.tenantId, router.name, health.error ?? null);
          if (sent > 0) alerted += 1;
        } catch (err) {
          console.error(`[network] could not alert on router ${router.id} going down`, err);
        }
      }
    } catch (err) {
      failed += 1;
      console.error(`[network] poll-router-health: router ${router.id} failed`, err);
    }
  }
  console.log(
    `[network] poll-router-health: reachable=${succeeded} unreachable=${failed} newlyDownAlerts=${alerted}`
  );
}
