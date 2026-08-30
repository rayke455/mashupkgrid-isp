import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, type RadiusUser } from "@mashupkgrid/database";
import {
  suspendRadiusUser,
  reactivateRadiusUser,
  getDecryptedRadiusPassword,
  getRadiusUserByCustomerServiceOrThrow,
} from "@mashupkgrid/radius";
import { successResponse, ConflictError } from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

const idParamsSchema = z.object({ customerServiceId: z.string().uuid() });
const listQuerySchema = z.object({ customerId: z.string().uuid().optional() });

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) throw new ConflictError("RADIUS user management is not available at the platform level");
  return tenantId;
}

function toRadiusUserSummary(radiusUser: RadiusUser) {
  const { passwordEncrypted: _p, ...summary } = radiusUser;
  return summary;
}

export async function radiusUserRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("radius.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const query = listQuerySchema.parse(request.query);
      const radiusUsers = await prisma.radiusUser.findMany({
        where: { tenantId, ...(query.customerId ? { customerId: query.customerId } : {}) },
        include: { assignedIp: true },
        orderBy: { createdAt: "desc" },
      });
      reply.send(successResponse(radiusUsers.map(toRadiusUserSummary), request.id));
    }
  );

  app.get(
    "/:customerServiceId",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("radius.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { customerServiceId } = idParamsSchema.parse(request.params);
      const radiusUser = await getRadiusUserByCustomerServiceOrThrow(tenantId, customerServiceId);
      reply.send(successResponse(toRadiusUserSummary(radiusUser), request.id));
    }
  );

  /** Reveals the plaintext PPPoE password once, for staff to relay to the customer — sensitive
   *  enough to warrant its own audit-logged action rather than being included on the normal GET. */
  app.post(
    "/:customerServiceId/reveal-password",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("radius.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { customerServiceId } = idParamsSchema.parse(request.params);
      const radiusUser = await getRadiusUserByCustomerServiceOrThrow(tenantId, customerServiceId);
      const plaintextPassword = await getDecryptedRadiusPassword(radiusUser);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "radius_user.password_revealed",
        resourceType: "RadiusUser",
        resourceId: radiusUser.id,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse({ username: radiusUser.username, password: plaintextPassword }, request.id));
    }
  );

  for (const [path, action, auditAction] of [
    ["suspend", suspendRadiusUser, "radius_user.suspended"],
    ["reactivate", reactivateRadiusUser, "radius_user.reactivated"],
  ] as const) {
    app.post(
      `/:customerServiceId/${path}`,
      { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("radius.manage")] },
      async (request, reply) => {
        const tenantId = requireTenant(request.user!.tenantId);
        const { customerServiceId } = idParamsSchema.parse(request.params);
        const before = await getRadiusUserByCustomerServiceOrThrow(tenantId, customerServiceId);
        const after = await action(tenantId, customerServiceId);

        await writeAuditLog({
          tenantId,
          actorUserId: request.user!.id,
          action: auditAction,
          resourceType: "RadiusUser",
          resourceId: after.id,
          before: { status: before.status },
          after: { status: after.status },
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        });

        reply.send(successResponse(toRadiusUserSummary(after), request.id));
      }
    );
  }
}
