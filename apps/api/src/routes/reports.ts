import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import {
  getRevenueByDay,
  getOutstandingSummary,
  getComprehensiveRevenueReport,
  getClientsTrackingReport,
  getStampedPaymentReceipt,
  getRevenueAnalytics,
} from "@mashupkgrid/billing";
import { getBandwidthByDay, getTopBandwidthConsumers } from "@mashupkgrid/radius";
import { successResponse, ConflictError } from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

const legacyRevenueQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

const comprehensiveRevenueQuerySchema = z.object({
  period: z.enum(["day", "week", "month", "year", "custom", "all"]).optional(),
  date: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  days: z.coerce.number().int().min(1).max(365).optional(),
});

const clientsReportQuerySchema = z.object({
  search: z.string().optional(),
  joinedPeriod: z.enum(["all", "today", "this_week", "this_month"]).optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

const receiptParamsSchema = z.object({ paymentId: z.string().uuid() });

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) throw new ConflictError("Reports are not available at the platform level");
  return tenantId;
}

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  // Legacy revenue by day (preserves backwards-compatibility)
  /** Growth, what sells, when customers pay, and who is at risk of leaving. */
  app.get(
    "/analytics",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("reports.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { months, branchId } = z
        .object({ months: z.coerce.number().int().min(2).max(24).default(6), branchId: z.string().uuid().optional() })
        .parse(request.query);
      if (branchId && !(await prisma.branch.findFirst({ where: { id: branchId, tenantId }, select: { id: true } }))) {
        throw new ConflictError("That branch is not part of this account");
      }
      reply.send(successResponse(await getRevenueAnalytics(tenantId, months, branchId ?? null), request.id));
    }
  );

  app.get(
    "/revenue",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("reports.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const query = request.query as Record<string, unknown>;
      if (query.period || query.date || query.startDate || query.detailed === "true") {
        const parsed = comprehensiveRevenueQuerySchema.parse(request.query);
        reply.send(successResponse(await getComprehensiveRevenueReport(tenantId, parsed), request.id));
        return;
      }
      const { days } = legacyRevenueQuerySchema.parse(request.query);
      reply.send(successResponse(await getRevenueByDay(tenantId, days), request.id));
    }
  );

  // Comprehensive Revenue Report (Day, Week, Month, Custom with Stamped Date & Breakdown)
  app.get(
    "/revenue/comprehensive",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("reports.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const options = comprehensiveRevenueQuerySchema.parse(request.query);
      reply.send(successResponse(await getComprehensiveRevenueReport(tenantId, options), request.id));
    }
  );

  // Clients Joined, Lifetime Spend, and Receipts Tracking Report
  app.get(
    "/clients",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("reports.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const options = clientsReportQuerySchema.parse(request.query);
      reply.send(successResponse(await getClientsTrackingReport(tenantId, options), request.id));
    }
  );

  // Stamped Official Payment Receipt
  app.get(
    "/receipts/:paymentId",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("reports.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { paymentId } = receiptParamsSchema.parse(request.params);
      reply.send(successResponse(await getStampedPaymentReceipt(tenantId, paymentId), request.id));
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
      const { days } = legacyRevenueQuerySchema.parse(request.query);
      reply.send(successResponse(await getBandwidthByDay(tenantId, days), request.id));
    }
  );

  app.get(
    "/bandwidth/top-consumers",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("reports.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { days } = legacyRevenueQuerySchema.parse(request.query);
      reply.send(successResponse(await getTopBandwidthConsumers(tenantId, days), request.id));
    }
  );
}
