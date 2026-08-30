import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import { successResponse } from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { getCurrentMaintenanceState, invalidateMaintenanceCache } from "../lib/maintenance-state.js";
import { writeAuditLog } from "../lib/audit.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

const updateMaintenanceSchema = z.object({
  enabled: z.boolean(),
  level: z.number().int().min(1).max(5),
  message: z.string().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  allowLogin: z.boolean().default(true),
  allowCustomerPortal: z.boolean().default(true),
  allowPayments: z.boolean().default(true),
  allowWebhooks: z.boolean().default(true),
  allowApi: z.boolean().default(true),
  allowedRoles: z.array(z.string()).default(["SUPER_ADMIN"]),
  allowedIps: z.array(z.string()).default([]),
});

export async function maintenanceRoutes(app: FastifyInstance): Promise<void> {
  // Public, minimal status — the web app shows a maintenance banner before the user is even
  // authenticated. Deliberately omits allowedIps/allowedRoles (those are bypass secrets).
  app.get("/status", { config: { audience: "system-critical" } }, async (request, reply) => {
    const state = await getCurrentMaintenanceState();
    reply.send(
      successResponse(
        { enabled: state.enabled, level: state.level, message: state.message, endAt: state.endAt },
        request.id
      )
    );
  });

  app.get(
    "/",
    { config: { audience: "platform" }, preHandler: [...preHandler, requirePermission("maintenance.manage")] },
    async (request, reply) => {
      const state = await getCurrentMaintenanceState();
      reply.send(successResponse(state, request.id));
    }
  );

  app.get(
    "/history",
    { config: { audience: "platform" }, preHandler: [...preHandler, requirePermission("maintenance.manage")] },
    async (request, reply) => {
      const events = await prisma.maintenanceEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      reply.send(successResponse(events, request.id));
    }
  );

  app.post(
    "/",
    { config: { audience: "platform" }, preHandler: [...preHandler, requirePermission("maintenance.manage")] },
    async (request, reply) => {
      const body = updateMaintenanceSchema.parse(request.body);
      const before = await getCurrentMaintenanceState();

      const after = await prisma.maintenanceEvent.create({
        data: {
          enabled: body.enabled,
          level: body.level,
          message: body.message ?? null,
          startAt: body.startAt ? new Date(body.startAt) : null,
          endAt: body.endAt ? new Date(body.endAt) : null,
          allowLogin: body.allowLogin,
          allowCustomerPortal: body.allowCustomerPortal,
          allowPayments: body.allowPayments,
          allowWebhooks: body.allowWebhooks,
          allowApi: body.allowApi,
          allowedRoles: body.allowedRoles,
          allowedIps: body.allowedIps,
          updatedBy: request.user!.id,
        },
      });

      await invalidateMaintenanceCache();
      await writeAuditLog({
        tenantId: null,
        actorUserId: request.user!.id,
        action: "maintenance.updated",
        resourceType: "MaintenanceEvent",
        resourceId: after.id,
        before,
        after,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.status(201).send(successResponse(after, request.id));
    }
  );
}
