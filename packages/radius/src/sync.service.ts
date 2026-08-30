import { prisma, type NetworkSyncTask, type SyncTaskAction } from "@mashupkgrid/database";
import { createAdapterForRouter } from "@mashupkgrid/network";

const MAX_ATTEMPTS = 5;

/**
 * Queues a router-side operation for every router the tenant has, and makes one best-effort
 * synchronous attempt right away — most of the time this resolves immediately and the caller
 * never even notices a queue was involved. If a router is unreachable, the task is left
 * PENDING for the worker's retry job (docs/architecture/06, "Failure mode: router offline") —
 * an operation on a router without an active session for this user is a harmless no-op (see
 * MikroTikAdapter.disconnectUser), so fanning out to every router is safe, not wasteful.
 */
export async function queueSyncTask(
  tenantId: string,
  radiusUserId: string,
  action: SyncTaskAction
): Promise<void> {
  const routers = await prisma.router.findMany({ where: { tenantId, deletedAt: null } });
  for (const router of routers) {
    const task = await prisma.networkSyncTask.create({
      data: { tenantId, routerId: router.id, radiusUserId, action, status: "PENDING" },
    });
    await applySyncTask(task);
  }
}

/** Attempts to actually apply one queued task against its router. Always returns — failure
 *  updates the task's status/attempts/lastError rather than throwing, since this is called
 *  both inline (best-effort) and from the worker's retry loop, neither of which should crash
 *  on a single bad task. */
export async function applySyncTask(task: NetworkSyncTask): Promise<void> {
  const [router, radiusUser] = await Promise.all([
    prisma.router.findUnique({ where: { id: task.routerId } }),
    task.radiusUserId ? prisma.radiusUser.findUnique({ where: { id: task.radiusUserId } }) : null,
  ]);

  if (!router || !radiusUser) {
    await prisma.networkSyncTask.update({
      where: { id: task.id },
      data: { status: "FAILED", lastError: "Router or RADIUS user no longer exists" },
    });
    return;
  }

  if (!router.host) {
    // Same routine, expected condition as an unreachable router (handled below) — this one just
    // hasn't checked in yet, so leave it PENDING for the worker's retry job to pick up once it
    // has.
    const attempts = task.attempts + 1;
    await prisma.networkSyncTask.update({
      where: { id: task.id },
      data: {
        status: attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
        attempts,
        lastError: "Router hasn't checked in yet — no known address to sync to",
      },
    });
    return;
  }

  const adapter = createAdapterForRouter({ ...router, host: router.host });
  try {
    await adapter.connect();
    // DISCONNECT_USER is the only action there is (see the SyncTaskAction doc comment in
    // schema.prisma) — kick whatever active PPPoE session this router currently holds for the
    // user; a no-op if there isn't one (see MikroTikAdapter.disconnectUser).
    await adapter.disconnectUser(radiusUser.username);
    await prisma.networkSyncTask.update({
      where: { id: task.id },
      data: { status: "SUCCEEDED", attempts: { increment: 1 } },
    });
    await prisma.router.update({
      where: { id: router.id },
      data: { status: "ONLINE", lastSeenAt: new Date(), lastError: null },
    });
  } catch (err) {
    const attempts = task.attempts + 1;
    await prisma.networkSyncTask.update({
      where: { id: task.id },
      data: {
        status: attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
        attempts,
        lastError: err instanceof Error ? err.message : String(err),
      },
    });
    await prisma.router.update({
      where: { id: router.id },
      data: { status: "DOWN", lastError: err instanceof Error ? err.message : String(err) },
    });
  } finally {
    await adapter.disconnect().catch(() => {});
  }
}

/** Called by the worker's repeatable job — retries every task still PENDING. */
export async function retryPendingSyncTasks(): Promise<{ processed: number }> {
  const tasks = await prisma.networkSyncTask.findMany({ where: { status: "PENDING" }, take: 100 });
  for (const task of tasks) {
    await applySyncTask(task);
  }
  return { processed: tasks.length };
}
