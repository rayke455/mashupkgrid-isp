import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import { successResponse, ConflictError, ForbiddenError, NotFoundError } from "@mashupkgrid/shared";
import { backupRouter, diffWithPrevious, listBackups, readBackup, restoreBackup, takeBackupForRestoreLink } from "@mashupkgrid/network";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { getCachedPermissions } from "../lib/permission-cache.js";
import { writeAuditLog } from "../lib/audit.js";

/**
 * Router configuration backups. Listing needs routers.read; taking one needs routers.manage.
 * Downloading, comparing and restoring need settings.manage too: a backup holds every password
 * and key on the router, and a restore replaces the router's whole configuration.
 */

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;
const idParams = z.object({ backupId: z.string().uuid() });

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) throw new ConflictError("Router backups belong to an ISP account");
  return tenantId;
}

async function requireOwner(userId: string, tenantId: string | null): Promise<void> {
  const permissions = await getCachedPermissions(userId, tenantId);
  if (!permissions.has("settings.manage")) throw new ForbiddenError("Only the account owner can open or restore router backups");
}

export async function routerBackupRoutes(app: FastifyInstance): Promise<void> {
  /** The router fetches its backup here during a restore. The token is the only credential:
   *  one-time, 15 minutes, and useless once used. */
  app.get("/fetch/:token", { config: { audience: "system-critical" } }, async (request, reply) => {
    const { token } = z.object({ token: z.string().regex(/^[A-Za-z0-9]{40}\.rsc$/) }).parse(request.params);
    const content = await takeBackupForRestoreLink(token.slice(0, -4));
    if (!content) throw new NotFoundError("Backup link");
    reply.header("content-type", "text/plain; charset=utf-8").header("cache-control", "no-store").send(content);
  });

  app.get("/", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.read")] }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const { routerId } = z.object({ routerId: z.string().uuid().optional() }).parse(request.query);
    reply.send(successResponse(await listBackups(tenantId, routerId), request.id));
  });

  app.post("/", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.manage")] }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const { routerId } = z.object({ routerId: z.string().uuid() }).parse(request.body);
    if (!(await prisma.router.findFirst({ where: { id: routerId, tenantId, deletedAt: null }, select: { id: true } }))) throw new NotFoundError("Router");
    try {
      const backup = await backupRouter(routerId, "Taken by hand", request.user!.id);
      reply.status(201).send(successResponse(backup, request.id));
    } catch (err) {
      throw new ConflictError(`Could not back up the router: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  app.get("/:backupId/download", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.manage")] }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    await requireOwner(request.user!.id, request.user!.tenantId);
    const { backupId } = idParams.parse(request.params);
    const { backup, content } = await readBackup(tenantId, backupId);
    const router = await prisma.router.findUnique({ where: { id: backup.routerId }, select: { name: true } });
    const name = `${(router?.name ?? "router").replace(/[^A-Za-z0-9-]+/g, "-")}-${backup.createdAt.toISOString().slice(0, 16).replace(/[:T]/g, "")}.rsc`;
    await writeAuditLog({ tenantId, actorUserId: request.user!.id, action: "router.backup_downloaded", resourceType: "RouterBackup", resourceId: backupId, ipAddress: request.ip, userAgent: request.headers["user-agent"] ?? null });
    reply.header("content-type", "text/plain; charset=utf-8").header("content-disposition", `attachment; filename="${name}"`).send(content);
  });

  app.get("/:backupId/diff", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.manage")] }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    await requireOwner(request.user!.id, request.user!.tenantId);
    const { backupId } = idParams.parse(request.params);
    const diff = await diffWithPrevious(tenantId, backupId);
    // Secrets inside changed lines are masked: seeing that a password changed is useful, seeing it is not.
    const mask = (line: string) => line.replace(/(password|secret|private-key|passphrase|key|psk)=("[^"]*"|\S+)/gi, "$1=********");
    reply.send(successResponse({ previousId: diff.previousId, added: diff.added.slice(0, 500).map(mask), removed: diff.removed.slice(0, 500).map(mask) }, request.id));
  });

  app.post("/:backupId/restore", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.manage")] }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    await requireOwner(request.user!.id, request.user!.tenantId);
    const { backupId } = idParams.parse(request.params);
    try {
      await restoreBackup(tenantId, backupId);
    } catch (err) {
      throw new ConflictError(err instanceof Error ? err.message : String(err));
    }
    await writeAuditLog({ tenantId, actorUserId: request.user!.id, action: "router.backup_restored", resourceType: "RouterBackup", resourceId: backupId, ipAddress: request.ip, userAgent: request.headers["user-agent"] ?? null });
    reply.send(successResponse({ restoring: true }, request.id));
  });
}
