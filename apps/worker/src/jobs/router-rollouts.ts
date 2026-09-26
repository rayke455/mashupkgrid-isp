import { prisma } from "@mashupkgrid/database";
import type { AutomationSummary } from "@mashupkgrid/shared";
import { backupRouter, findOtaAction, runOtaActionOnRouter, type OtaActionKey } from "@mashupkgrid/network";

/** Actions that cannot change a router's configuration need no backup first. */
const NO_BACKUP = new Set(["check-versions", "reboot"]);
import { pushToTenantStaff, pushToUser } from "@mashupkgrid/push";

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
      let result: { status: "SUCCEEDED" | "FAILED" | "SKIPPED"; message: string };
      if (!router) result = { status: "SKIPPED", message: "The router was removed" };
      else if (!action) result = { status: "FAILED", message: `Unknown action ${rollout.action}` };
      else {
        // A backup first, so any change can be undone from Router backups. No backup, no change.
        let backupError: string | null = null;
        if (!NO_BACKUP.has(action.key) && router.status !== "DOWN" && (router.host || router.vpnIp)) {
          await backupRouter(router.id, `Before: ${action.label}`, rollout.createdByUserId).catch((err: unknown) => {
            backupError = err instanceof Error ? err.message : String(err);
          });
        }
        result = backupError
          ? { status: "FAILED", message: `Could not back up the router first, so nothing was changed: ${backupError}` }
          : await runOtaActionOnRouter(router, action.key as OtaActionKey, params);
      }
      await prisma.routerRolloutTarget.update({ where: { id: next.id }, data: { status: result.status, message: result.message, finishedAt: new Date() } });
      if (result.status === "SUCCEEDED") updated += 1;
      if (result.status === "FAILED") failed += 1;
    }

    const remaining = await prisma.routerRolloutTarget.count({ where: { rolloutId: rollout.id, status: { in: ["PENDING", "RUNNING"] } } });
    if (remaining === 0) {
      const done = await prisma.routerRollout.updateMany({ where: { id: rollout.id, status: "RUNNING" }, data: { status: "COMPLETED", finishedAt: new Date() } });
      if (done.count) {
        const counts = await prisma.routerRolloutTarget.groupBy({ by: ["status"], where: { rolloutId: rollout.id }, _count: true });
        const n = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
        const alert = {
          title: `Router update finished: ${action?.label ?? rollout.action}`,
          body: `${n("SUCCEEDED")} done, ${n("FAILED")} failed, ${n("SKIPPED")} skipped.`,
          url: "/routers/updates",
          tag: `rollout-${rollout.id}`,
        };
        // Someone started it: tell them. The monthly automatic upgrade: tell the router staff.
        await (rollout.createdByUserId ? pushToUser(rollout.createdByUserId, alert) : pushToTenantStaff(rollout.tenantId, "routers.manage", alert)).catch(() => 0);
      }
    }
    if (Date.now() - started >= BUDGET_MS) break;
  }
  return { rollouts: rollouts.length, updated, failed, interrupted: stuck.count };
}
