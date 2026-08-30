import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, type Prisma } from "@mashupkgrid/database";
import { successResponse, paginationQuerySchema, paginate, toSkipTake } from "@mashupkgrid/shared";
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
}
