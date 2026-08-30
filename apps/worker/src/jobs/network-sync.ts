import { retryPendingSyncTasks, expireOverdueVouchers } from "@mashupkgrid/radius";
import { prisma } from "@mashupkgrid/database";
import { testRouterConnection } from "@mashupkgrid/network";

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
  const routers = await prisma.router.findMany({ where: { deletedAt: null }, select: { id: true, tenantId: true } });
  let succeeded = 0;
  let failed = 0;
  for (const router of routers) {
    try {
      const health = await testRouterConnection(router.tenantId, router.id);
      if (health.reachable) succeeded += 1;
      else failed += 1;
    } catch (err) {
      failed += 1;
      console.error(`[network] poll-router-health: router ${router.id} failed`, err);
    }
  }
  console.log(`[network] poll-router-health: reachable=${succeeded} unreachable=${failed}`);
}
