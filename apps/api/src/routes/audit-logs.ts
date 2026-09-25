import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, type Prisma } from "@mashupkgrid/database";
import { successResponse, paginationQuerySchema, paginate, toSkipTake, ForbiddenError, UnauthorizedError } from "@mashupkgrid/shared";
import { getCachedPermissions } from "../lib/permission-cache.js";
import { writeAuditLog } from "../lib/audit.js";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

const listQuerySchema = paginationQuerySchema.extend({
  resourceType: z.string().optional(),
  action: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export async function auditLogRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("audit_logs.read")] },
    async (request, reply) => {
      const query = listQuerySchema.parse(request.query);

      // Tenant-scoped staff see only their tenant's audit trail; SUPER_ADMIN (tenantId = null)
      // sees platform-wide entries — tenant isolation is enforced here, not left to the client.
      const where: Prisma.AuditLogWhereInput = {
        tenantId: request.user!.tenantId,
        ...(query.resourceType ? { resourceType: query.resourceType } : {}),
        ...(query.action ? { action: query.action } : {}),
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      };

      const [items, total] = await Promise.all([
        prisma.auditLog.findMany({ where, ...toSkipTake(query), orderBy: { createdAt: "desc" } }),
        prisma.auditLog.count({ where }),
      ]);

      reply.send(successResponse(paginate(items, total, query), request.id));
    }
  );

  /**
   * Purges old entries. Reading the log is audit_logs.read; deleting it is a bigger ask — an
   * owner's call for a tenant (settings.manage), a super admin's for the platform
   * (maintenance.manage) — and it never reaches the last 30 days, so a purge cannot hide what
   * just happened. The purge itself is the newest entry afterwards.
   */
  app.delete("/", { config: { audience: "staff" }, preHandler: [...preHandler] }, async (request, reply) => {
    if (!request.user) throw new UnauthorizedError();
    const wanted = request.user.tenantId === null ? "maintenance.manage" : "settings.manage";
    const permissions = await getCachedPermissions(request.user.id, request.user.tenantId);
    if (!permissions.has(wanted)) throw new ForbiddenError(`Missing required permission: ${wanted}`);

    const { olderThanDays } = z.object({ olderThanDays: z.coerce.number().int().min(30).max(3650).default(90) }).parse(request.query);
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const result = await prisma.auditLog.deleteMany({ where: { tenantId: request.user.tenantId, createdAt: { lt: cutoff } } });
    await writeAuditLog({
      tenantId: request.user.tenantId,
      actorUserId: request.user.id,
      action: "audit_logs.purged",
      resourceType: "AuditLog",
      after: { olderThanDays, deleted: result.count },
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });
    reply.send(successResponse({ deleted: result.count, olderThanDays }, request.id));
  });
}
