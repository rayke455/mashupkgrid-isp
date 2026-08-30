import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import { listActiveSessionsForUser, revokeSession } from "@mashupkgrid/auth";
import { successResponse, ForbiddenError, NotFoundError } from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";

const revokeParamsSchema = z.object({ sessionId: z.string().uuid() });

export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  const selfServicePreHandler = [authenticate, resolveTenant, checkMaintenance] as const;

  app.get(
    "/",
    { config: { audience: "customer" }, preHandler: [...selfServicePreHandler, requirePermission("sessions.manage_own")] },
    async (request, reply) => {
      const sessions = await listActiveSessionsForUser(request.user!.id);
      reply.send(
        successResponse(
          sessions.map((s) => ({
            id: s.id,
            userAgent: s.userAgent,
            ipAddress: s.ipAddress,
            createdAt: s.createdAt,
            lastUsedAt: s.lastUsedAt,
            isCurrent: s.id === request.user!.sessionId,
          })),
          request.id
        )
      );
    }
  );

  app.delete(
    "/:sessionId",
    { config: { audience: "customer" }, preHandler: [...selfServicePreHandler, requirePermission("sessions.manage_own")] },
    async (request, reply) => {
      const { sessionId } = revokeParamsSchema.parse(request.params);
      const session = await prisma.session.findUnique({ where: { id: sessionId } });
      if (!session || session.userId !== request.user!.id) {
        throw new NotFoundError("Session");
      }
      await revokeSession(sessionId, "revoked_by_owner");
      await writeAuditLog({
        tenantId: request.user!.tenantId,
        actorUserId: request.user!.id,
        action: "session.revoked",
        resourceType: "Session",
        resourceId: sessionId,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });
      reply.send(successResponse({ revoked: true }, request.id));
    }
  );

  // Staff/admin revoking any user's session within their tenant (e.g. a support agent forcing
  // a compromised customer account to log out). SUPER_ADMIN may act platform-wide.
  app.delete(
    "/admin/:sessionId",
    { config: { audience: "staff" }, preHandler: [...selfServicePreHandler, requirePermission("sessions.manage_any")] },
    async (request, reply) => {
      const { sessionId } = revokeParamsSchema.parse(request.params);
      const session = await prisma.session.findUnique({ where: { id: sessionId } });
      if (!session) throw new NotFoundError("Session");
      if (request.user!.tenantId !== null && session.tenantId !== request.user!.tenantId) {
        throw new ForbiddenError("Cannot manage a session outside your tenant");
      }
      await revokeSession(sessionId, "revoked_by_admin");
      await writeAuditLog({
        tenantId: session.tenantId,
        actorUserId: request.user!.id,
        action: "session.revoked_by_admin",
        resourceType: "Session",
        resourceId: sessionId,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });
      reply.send(successResponse({ revoked: true }, request.id));
    }
  );
}
