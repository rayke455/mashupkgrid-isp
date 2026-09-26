import { createHash } from "node:crypto";
import { prisma, type RouterBackup } from "@mashupkgrid/database";
import { env } from "@mashupkgrid/config";
import { ConflictError, NotFoundError, decryptAtRest, encryptAtRest, generateAlnumSecret, hashToken } from "@mashupkgrid/shared";
import { createAdapterForRouter } from "./factory.js";
import { routerFacingApiBase } from "./router.service.js";

/**
 * Router configuration backups. A backup is the router's own /export, secrets included, stored
 * encrypted. Kept: the newest KEEP_PER_ROUTER per router. Restoring gives the router a one-time,
 * short-lived link to download the backup, then resets it to run that script on boot.
 */

const KEEP_PER_ROUTER = 20;
const MAX_BYTES = 5 * 1024 * 1024;
const RESTORE_LINK_MINUTES = 15;

export type BackupSummary = Omit<RouterBackup, "contentEncrypted" | "restoreTokenHash">;

function summary(b: RouterBackup): BackupSummary {
  const { contentEncrypted: _c, restoreTokenHash: _t, ...rest } = b;
  return rest;
}

type RouterRow = Awaited<ReturnType<typeof prisma.router.findFirst>> & object;

/** Takes a backup of one router. Throws with a plain reason when it cannot. */
export async function backupRouter(routerId: string, reason: string, userId: string | null = null): Promise<BackupSummary> {
  const router = (await prisma.router.findFirst({ where: { id: routerId, deletedAt: null } })) as RouterRow | null;
  if (!router) throw new NotFoundError("Router");
  const host = router.host || router.vpnIp;
  if (router.vendor !== "MIKROTIK") throw new ConflictError("Only MikroTik routers can be backed up");
  if (!host) throw new ConflictError("The router has not checked in yet");

  const adapter = createAdapterForRouter({ ...router, host });
  let content: string;
  await adapter.connect();
  try {
    if (!adapter.exportConfig) throw new ConflictError("This router cannot export its configuration");
    content = await adapter.exportConfig();
  } finally {
    await adapter.disconnect().catch(() => undefined);
  }
  const size = Buffer.byteLength(content);
  if (!content.trim()) throw new ConflictError("The router returned an empty export");
  if (size > MAX_BYTES) throw new ConflictError("The export is larger than 5 MB");

  const backup = await prisma.routerBackup.create({
    data: {
      tenantId: router.tenantId,
      routerId,
      reason: reason.slice(0, 120),
      contentEncrypted: encryptAtRest(content, env.ENCRYPTION_KEY),
      sizeBytes: size,
      sha256: createHash("sha256").update(content).digest("hex"),
      routerOsVersion: /by RouterOS ([\w.]+)/.exec(content)?.[1] ?? router.routerOsVersion ?? null,
      createdByUserId: userId,
    },
  });
  await pruneBackups(routerId);
  return summary(backup);
}

export async function pruneBackups(routerId: string): Promise<number> {
  const old = await prisma.routerBackup.findMany({ where: { routerId }, orderBy: { createdAt: "desc" }, skip: KEEP_PER_ROUTER, select: { id: true } });
  if (!old.length) return 0;
  const { count } = await prisma.routerBackup.deleteMany({ where: { id: { in: old.map((b) => b.id) } } });
  return count;
}

export async function listBackups(tenantId: string, routerId?: string): Promise<BackupSummary[]> {
  const rows = await prisma.routerBackup.findMany({ where: { tenantId, ...(routerId ? { routerId } : {}) }, orderBy: { createdAt: "desc" }, take: 200 });
  return rows.map(summary);
}

export async function readBackup(tenantId: string, backupId: string): Promise<{ backup: BackupSummary; content: string }> {
  const backup = await prisma.routerBackup.findFirst({ where: { id: backupId, tenantId } });
  if (!backup) throw new NotFoundError("Backup");
  return { backup: summary(backup), content: decryptAtRest(backup.contentEncrypted, env.ENCRYPTION_KEY) };
}

/** Lines that differ, ignoring the export's own date header, which changes every time. */
export function diffExports(previous: string, current: string): { added: string[]; removed: string[] } {
  const lines = (s: string) => s.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l && !/^#.*by RouterOS/.test(l) && !/^# \w{3}\/\d{2}\/\d{4}|^# \d{4}-\d{2}-\d{2}/.test(l));
  const a = lines(previous);
  const b = lines(current);
  const count = (xs: string[]) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>());
  const ca = count(a);
  const cb = count(b);
  const added: string[] = [];
  const removed: string[] = [];
  for (const [line, n] of cb) for (let i = 0; i < n - (ca.get(line) ?? 0); i++) added.push(line);
  for (const [line, n] of ca) for (let i = 0; i < n - (cb.get(line) ?? 0); i++) removed.push(line);
  return { added, removed };
}

/** What changed since the backup before this one, for the same router. */
export async function diffWithPrevious(tenantId: string, backupId: string): Promise<{ previousId: string | null; added: string[]; removed: string[] }> {
  const { backup, content } = await readBackup(tenantId, backupId);
  const previous = await prisma.routerBackup.findFirst({ where: { routerId: backup.routerId, createdAt: { lt: backup.createdAt } }, orderBy: { createdAt: "desc" } });
  if (!previous) return { previousId: null, added: [], removed: [] };
  const prevContent = decryptAtRest(previous.contentEncrypted, env.ENCRYPTION_KEY);
  return { previousId: previous.id, ...diffExports(prevContent, content) };
}

/**
 * Puts a backup back on its router. The router downloads it once through a link that expires in
 * 15 minutes, resets its configuration, and runs it while booting, so it comes back as it was.
 */
export async function restoreBackup(tenantId: string, backupId: string): Promise<void> {
  const backup = await prisma.routerBackup.findFirst({ where: { id: backupId, tenantId }, include: { router: true } });
  if (!backup) throw new NotFoundError("Backup");
  const router = backup.router;
  const host = router.host || router.vpnIp;
  if (!host) throw new ConflictError("The router has not checked in yet");
  if (router.status === "DOWN") throw new ConflictError("The router is offline");

  const token = generateAlnumSecret(40);
  await prisma.routerBackup.update({
    where: { id: backupId },
    data: { restoreTokenHash: hashToken(token), restoreTokenExpiresAt: new Date(Date.now() + RESTORE_LINK_MINUTES * 60_000) },
  });
  const adapter = createAdapterForRouter({ ...router, host });
  await adapter.connect();
  try {
    if (!adapter.restoreConfigFromUrl) throw new ConflictError("This router cannot be restored from here");
    await adapter.restoreConfigFromUrl(`${routerFacingApiBase()}/api/v1/router-backups/fetch/${token}.rsc`);
  } finally {
    await adapter.disconnect().catch(() => undefined);
  }
  await prisma.routerBackup.update({ where: { id: backupId }, data: { restoredAt: new Date() } });
}

/** The backup behind a restore link, once: the link stops working after it is used. */
export async function takeBackupForRestoreLink(token: string): Promise<string | null> {
  const backup = await prisma.routerBackup.findUnique({ where: { restoreTokenHash: hashToken(token) } });
  if (!backup || !backup.restoreTokenExpiresAt || backup.restoreTokenExpiresAt < new Date()) return null;
  const used = await prisma.routerBackup.updateMany({ where: { id: backup.id, restoreTokenHash: backup.restoreTokenHash }, data: { restoreTokenHash: null, restoreTokenExpiresAt: null } });
  if (used.count === 0) return null;
  return decryptAtRest(backup.contentEncrypted, env.ENCRYPTION_KEY);
}
