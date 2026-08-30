import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import { voidInvoice, getInvoiceOrThrow } from "@mashupkgrid/billing";
import {
  successResponse,
  ConflictError,
  NotFoundError,
  paginationQuerySchema,
  paginate,
  toSkipTake,
  buildSafeOrderBy,
} from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

const listQuerySchema = paginationQuerySchema.extend({
  customerId: z.string().uuid().optional(),
  status: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

const idParamsSchema = z.object({ invoiceId: z.string().uuid() });
const SORTABLE_FIELDS = ["invoiceNumber", "totalMinor", "dueDate", "createdAt"] as const;

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) throw new ConflictError("Invoice management is not available at the platform level");
  return tenantId;
}

export async function invoiceRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("billing.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const query = listQuerySchema.parse(request.query);
      const where = {
        tenantId,
        ...(query.customerId ? { customerId: query.customerId } : {}),
        ...(query.status ? { status: query.status as never } : {}),
      };
      const [items, total] = await Promise.all([
        prisma.invoice.findMany({
          where,
          include: { items: true },
          ...toSkipTake(query),
          orderBy: buildSafeOrderBy(query.sortBy, query.sortOrder, SORTABLE_FIELDS, "createdAt"),
        }),
        prisma.invoice.count({ where }),
      ]);
      reply.send(successResponse(paginate(items, total, query), request.id));
    }
  );

  app.get(
    "/:invoiceId",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("billing.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { invoiceId } = idParamsSchema.parse(request.params);
      const invoice = await prisma.invoice.findFirst({
        where: { id: invoiceId, tenantId },
        include: { items: true, payments: true },
      });
      if (!invoice) throw new NotFoundError("Invoice");
      reply.send(successResponse(invoice, request.id));
    }
  );

  app.post(
    "/:invoiceId/void",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("billing.update")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { invoiceId } = idParamsSchema.parse(request.params);
      const before = await getInvoiceOrThrow(tenantId, invoiceId);
      const after = await voidInvoice(tenantId, invoiceId);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "invoice.voided",
        resourceType: "Invoice",
        resourceId: invoiceId,
        before: { status: before.status },
        after: { status: after.status },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(after, request.id));
    }
  );
}
