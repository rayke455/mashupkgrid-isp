import { prisma } from "@mashupkgrid/database";
import type { AutomationSummary } from "@mashupkgrid/shared";
import { findOtaAction, runOtaActionOnRouter, type OtaActionKey } from "@mashupkgrid/network";
import { pushToUser } from "@mashupkgrid/push";

/**
 * Applies over-the-air router updates, one router at a time. A rollout with canaryFirst updates
 * its first router alone; the rest follow only if that one did not fail. Each target is claimed
 * (PENDING to RUNNING) before it is touched, so an overlapping run never updates a router twice.
 * A run stops taking new routers after ~40 seconds; the next run carries on.
 */

const BUDGET_MS = 40_000;
const STUCK_MS = 15 * 60_000;

export async function handleRouterRollouts(): Promise<AutomationSummary> {
  const started = Date.now();
  const now = new Date();

  // A worker restart mid-router leaves a target RUNNING forever; close those off.
  const stuck = await prisma.routerRolloutTarget.updateMany({
    where: { status: "RUNNING", startedAt: { lt: new Date(now.getTime() - STUCK_MS) } },
    data: { status: "FAILED", message: "Interrupted before the router answered", finishedAt: now },
  });

  // Scheduled rollouts whose time has come.
  await prisma.routerRollout.updateMany({ where: { status: "SCHEDULED", scheduledFor: { lte: now } }, data: { status: "RUNNING" } });

  const rollouts = await prisma.routerRollout.findMany({ where: { status: "RUNNING" }, orderBy: { createdAt: "asc" }, take: 20 });
  let updated = 0;
  let failed = 0;

  for (const rollout of rollouts) {
    if (!rollout.startedAt) await prisma.routerRollout.update({ where: { id: rollout.id }, data: { startedAt: now } });
    const action = findOtaAction(rollout.action);
    const params = (rollout.params ?? {}) as { script?: string };

    while (Date.now() - started < BUDGET_MS) {
      const targets = await prisma.routerRolloutTarget.findMany({ where: { rolloutId: rollout.id }, orderBy: { position: "asc" }, select: { id: true, status: true, position: true, routerId: true } });
      const first = targets[0];
      if (rollout.canaryFirst && first) {
        // The first router goes alone: wait for it, and stop the rollout if it failed.
        if (first.status === "RUNNING") break;
        if (first.status === "FAILED") {
          await prisma.routerRolloutTarget.updateMany({
            where: { rolloutId: rollout.id, status: "PENDING" },
            data: { status: "SKIPPED", message: "Not updated: the first router failed, so the rollout stopped", finishedAt: new Date() },
          });
        }
      }
      // Targets are in position order, so the first PENDING one is the canary while it is pending.
      const next = targets.find((t) => t.status === "PENDING");
      if (!next) break;

      const claimed = await prisma.routerRolloutTarget.updateMany({ where: { id: next.id, status: "PENDING" }, data: { status: "RUNNING", startedAt: new Date() } });
      if (claimed.count === 0) continue;

      const router = next.routerId ? await prisma.router.findFirst({ where: { id: next.routerId, tenantId: rollout.tenantId, deletedAt: null } }) : null;
      const result = !router
        ? { status: "SKIPPED" as const, message: "The router was removed" }
        : !action
          ? { status: "FAILED" as const, message: `Unknown action ${rollout.action}` }
          : await runOtaActionOnRouter(router, action.key as OtaActionKey, params);
      await prisma.routerRolloutTarget.update({ where: { id: next.id }, data: { status: result.status, message: result.message, finishedAt: new Date() } });
      if (result.status === "SUCCEEDED") updated += 1;
      if (result.status === "FAILED") failed += 1;
    }

    const remaining = await prisma.routerRolloutTarget.count({ where: { rolloutId: rollout.id, status: { in: ["PENDING", "RUNNING"] } } });
    if (remaining === 0) {
      const done = await prisma.routerRollout.updateMany({ where: { id: rollout.id, status: "RUNNING" }, data: { status: "COMPLETED", finishedAt: new Date() } });
      if (done.count && rollout.createdByUserId) {
        const counts = await prisma.routerRolloutTarget.groupBy({ by: ["status"], where: { rolloutId: rollout.id }, _count: true });
        const n = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
        await pushToUser(rollout.createdByUserId, {
          title: `Router update finished: ${action?.label ?? rollout.action}`,
          body: `${n("SUCCEEDED")} done, ${n("FAILED")} failed, ${n("SKIPPED")} skipped.`,
          url: "/routers/updates",
          tag: `rollout-${rollout.id}`,
        }).catch(() => 0);
      }
    }
    if (Date.now() - started >= BUDGET_MS) break;
  }
  return { rollouts: rollouts.length, updated, failed, interrupted: stuck.count };
}
