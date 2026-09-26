import { prisma } from "@mashupkgrid/database";
import type { AutomationSummary } from "@mashupkgrid/shared";
import { backupRouter } from "@mashupkgrid/network";

/** Daily backups: every linked, online MikroTik gets one when its newest is over a day old. */
const DAY = 86_400_000;
const PER_RUN = 20;

export async function handleRouterBackups(): Promise<AutomationSummary> {
  const since = new Date(Date.now() - DAY);
  const due = await prisma.router.findMany({
    where: {
      deletedAt: null,
      vendor: "MIKROTIK",
      status: { in: ["ONLINE", "WARNING"] },
      OR: [{ host: { not: null } }, { vpnIp: { not: null } }],
      backups: { none: { createdAt: { gte: since } } },
      tenant: { status: "ACTIVE", deletedAt: null },
    },
    select: { id: true, name: true },
    take: PER_RUN,
  });
  let saved = 0;
  let failed = 0;
  for (const router of due) {
    try {
      await backupRouter(router.id, "Daily backup");
      saved += 1;
    } catch (err) {
      failed += 1;
      console.warn(`[backups] "${router.name}" could not be backed up:`, err instanceof Error ? err.message : err);
    }
  }
  return { due: due.length, saved, failed };
}
