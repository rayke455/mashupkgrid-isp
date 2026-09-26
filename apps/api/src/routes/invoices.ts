import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import { renderInvoicePdf } from "@mashupkgrid/billing";
import { voidInvoice, getInvoiceOrThrow } from "@mashupkgrid/billing";
import {
  successResponse,
  ConflictError,
  NotFoundError,
  paginationQuerySchema,
  paginate,
  toSkipTake,
  buildSafeOrderBy,
  toCsv,
} from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";
import { enqueueSendInvoiceEmail } from "../lib/queue.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

const listQuerySchema = paginationQuerySchema.extend({
  customerId: z.string().uuid().optional(),
  search: z.string().max(100).optional(),
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
  /** The invoice as a PDF, the same document that is attached to the invoice email. */
  app.get(
    "/:invoiceId/pdf",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("billing.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { invoiceId } = idParamsSchema.parse(request.params);
      const pdf = await renderInvoicePdf(tenantId, invoiceId);
      reply
        .header("content-type", "application/pdf")
        .header("content-disposition", `attachment; filename="${pdf.filename}"`)
        .send(Buffer.from(pdf.bytes));
    }
  );

  /** Every invoice as a spreadsheet, for the ISP's own accounts. */
  app.get(
    "/export.csv",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("billing.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const invoices = await prisma.invoice.findMany({
        where: { tenantId },
        orderBy: { createdAt: "asc" },
        include: { customer: { select: { customerNumber: true, fullName: true, phone: true } } },
      });
      const csv = toCsv(invoices, [
        { header: "Invoice", value: (i) => i.invoiceNumber },
        { header: "Customer number", value: (i) => i.customer?.customerNumber ?? "" },
        { header: "Customer", value: (i) => i.customer?.fullName ?? "" },
        { header: "Phone", value: (i) => i.customer?.phone ?? "" },
        { header: "Issued", value: (i) => i.issuedAt },
        { header: "Due", value: (i) => i.dueDate },
        { header: "Status", value: (i) => i.status },
        { header: "Subtotal", value: (i) => (i.subtotalMinor / 100).toFixed(2) },
        { header: "Tax", value: (i) => (i.taxMinor / 100).toFixed(2) },
        { header: "Total", value: (i) => (i.totalMinor / 100).toFixed(2) },
        { header: "Paid", value: (i) => (i.amountPaidMinor / 100).toFixed(2) },
        { header: "Balance", value: (i) => ((i.totalMinor - i.amountPaidMinor) / 100).toFixed(2) },
        { header: "Currency", value: (i) => i.currency },
        { header: "Paid at", value: (i) => i.paidAt },
      ]);
      reply
        .header("content-type", "text/csv; charset=utf-8")
        .header("content-disposition", `attachment; filename="invoices-${new Date().toISOString().slice(0, 10)}.csv"`)
        .send(csv);
    }
  );

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
        ...(query.search?.trim()
          ? {
              OR: [
                { invoiceNumber: { contains: query.search.trim(), mode: "insensitive" as const } },
                { customer: { fullName: { contains: query.search.trim(), mode: "insensitive" as const } } },
                { customer: { phone: { contains: query.search.trim() } } },
              ],
            }
          : {}),
      };
      const [items, total] = await Promise.all([
        prisma.invoice.findMany({
          where,
          include: { items: true, customer: { select: { id: true, fullName: true, phone: true, customerNumber: true } } },
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

  /** Emails the invoice to the customer now (new invoices also go out on their own — see the
   *  worker's send-pending-invoice-emails job). */
  app.post(
    "/:invoiceId/send",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("billing.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { invoiceId } = idParamsSchema.parse(request.params);
      const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, tenantId }, include: { customer: { select: { email: true } } } });
      if (!invoice) throw new NotFoundError("Invoice");
      if (!invoice.customer.email) throw new ConflictError("This customer has no email address on file — add one on their profile first");
      await enqueueSendInvoiceEmail({ tenantId, invoiceId });
      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "invoice.emailed",
        resourceType: "Invoice",
        resourceId: invoiceId,
        after: { to: invoice.customer.email },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });
      reply.status(202).send(successResponse({ queued: true, to: invoice.customer.email }, request.id));
    }
  );
}
