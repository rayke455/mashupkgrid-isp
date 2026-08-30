import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getRevenueByDay, getOutstandingSummary } from "@mashupkgrid/billing";
import { getBandwidthByDay, getTopBandwidthConsumers } from "@mashupkgrid/radius";
import { successResponse, ConflictError } from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;
const revenueQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) throw new ConflictError("Reports are not available at the platform level");
  return tenantId;
}

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/revenue",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("reports.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { days } = revenueQuerySchema.parse(request.query);
      reply.send(successResponse(await getRevenueByDay(tenantId, days), request.id));
    }
  );

  app.get(
    "/outstanding",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("reports.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      reply.send(successResponse(await getOutstandingSummary(tenantId), request.id));
    }
  );

  app.get(
    "/bandwidth",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("reports.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { days } = revenueQuerySchema.parse(request.query);
      reply.send(successResponse(await getBandwidthByDay(tenantId, days), request.id));
    }
  );

  app.get(
    "/bandwidth/top-consumers",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("reports.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { days } = revenueQuerySchema.parse(request.query);
      reply.send(successResponse(await getTopBandwidthConsumers(tenantId, days), request.id));
    }
  );
}
