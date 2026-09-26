import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import {
  createCustomer,
  updateCustomer,
  changeCustomerStatus,
  getCustomerOrThrow,
  linkCustomerToUserAccount,
} from "@mashupkgrid/billing";
import {
  successResponse,
  ConflictError,
  NotFoundError,
  paginationQuerySchema,
  paginate,
  toSkipTake,
  buildSafeOrderBy,
  buildKeywordSearchWhere,
  toCsv,
} from "@mashupkgrid/shared";
import { enqueueSendCustomerMessage } from "../lib/queue.js";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";
import { emitWebhookEvent } from "../lib/webhooks.js";
import { assertWithinPlanLimit } from "../lib/plan-limits.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

/** A branch id from the request must belong to this tenant; anything else is refused. */
async function assertBranchInTenant(tenantId: string, branchId: string | null | undefined): Promise<void> {
  if (!branchId) return;
  const branch = await prisma.branch.findFirst({ where: { id: branchId, tenantId }, select: { id: true } });
  if (!branch) throw new NotFoundError("Branch");
}

const createCustomerSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().min(5),
  idNumber: z.string().optional(),
  address: z.string().optional(),
  gpsLat: z.number().optional(),
  gpsLng: z.number().optional(),
  connectionType: z.string().optional(),
  branchId: z.string().uuid().nullable().optional(),
});

const updateCustomerSchema = createCustomerSchema.partial().extend({ notes: z.string().optional() });

const statusSchema = z.object({
  status: z.enum([
    "ACTIVE",
    "SUSPENDED",
    "PENDING",
    "INSTALLATION",
    "DISCONNECTED",
    "CANCELLED",
    "BLACKLISTED",
  ]),
});

const listQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional(),
  status: z.string().optional(),
  /** A branch id, or "none" for customers in no branch. */
  branchId: z.union([z.string().uuid(), z.literal("none")]).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

const idParamsSchema = z.object({ customerId: z.string().uuid() });

const messageSchema = z.object({
  channels: z.array(z.enum(["EMAIL", "SMS"])).min(1),
  subject: z.string().trim().min(1).max(150),
  body: z.string().trim().min(1).max(2000),
});

const SORTABLE_FIELDS = ["fullName", "customerNumber", "createdAt", "status"] as const;
const SEARCHABLE_FIELDS = ["fullName", "phone", "email", "customerNumber"];

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) {
    throw new ConflictError("Customer management is not available at the platform level");
  }
  return tenantId;
}

export async function customerRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("customers.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const query = listQuerySchema.parse(request.query);
      const where = {
        tenantId,
        deletedAt: null,
        ...(query.status ? { status: query.status as never } : {}),
        ...(query.branchId ? { branchId: query.branchId === "none" ? null : query.branchId } : {}),
        ...buildKeywordSearchWhere(query.search, SEARCHABLE_FIELDS),
      };
      const [items, total] = await Promise.all([
        prisma.customer.findMany({
          where,
          ...toSkipTake(query),
          orderBy: buildSafeOrderBy(query.sortBy, query.sortOrder, SORTABLE_FIELDS, "createdAt"),
        }),
        prisma.customer.count({ where }),
      ]);
      reply.send(successResponse(paginate(items, total, query), request.id));
    }
  );

  /**
   * Every customer with what they have paid, as a spreadsheet: name, contacts, status, package,
   * next billing date, invoices outstanding, total ever paid and the last payment. The list an
   * owner opens on a Sunday to see where the money is. Same permission as the list, and the
   * whole tenant in one file — the point is not to page through it.
   */
  app.get(
    "/export.csv",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("customers.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const customers = await prisma.customer.findMany({
        where: { tenantId, deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: {
          services: { where: { status: { not: "CANCELLED" } }, include: { package: { select: { name: true, serviceType: true } } }, orderBy: { createdAt: "desc" }, take: 1 },
        },
      });
      const ids = customers.map((c) => c.id);
      const [paid, outstanding, lastPayments] = await Promise.all([
        prisma.payment.groupBy({ by: ["customerId"], where: { tenantId, customerId: { in: ids }, status: "COMPLETED" }, _sum: { amountMinor: true }, _count: { _all: true } }),
        prisma.invoice.groupBy({ by: ["customerId"], where: { tenantId, customerId: { in: ids }, status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] } }, _sum: { totalMinor: true, amountPaidMinor: true }, _count: { _all: true } }),
        prisma.payment.findMany({ where: { tenantId, customerId: { in: ids }, status: "COMPLETED" }, orderBy: { createdAt: "desc" }, distinct: ["customerId"], select: { customerId: true, createdAt: true, amountMinor: true, method: true } }),
      ]);
      const paidBy = new Map(paid.map((p) => [p.customerId, p]));
      const owedBy = new Map(outstanding.map((o) => [o.customerId, o]));
      const lastBy = new Map(lastPayments.map((p) => [p.customerId, p]));
      const major = (minor: number | null | undefined) => ((minor ?? 0) / 100).toFixed(2);

      const csv = toCsv(customers, [
        { header: "Customer number", value: (c) => c.customerNumber },
        { header: "Name", value: (c) => c.fullName },
        { header: "Phone", value: (c) => c.phone },
        { header: "Email", value: (c) => c.email },
        { header: "Address", value: (c) => c.address },
        { header: "Status", value: (c) => c.status },
        { header: "Package", value: (c) => c.services[0]?.package.name ?? "" },
        { header: "Service type", value: (c) => c.services[0]?.package.serviceType ?? "" },
        { header: "Service status", value: (c) => c.services[0]?.status ?? "" },
        { header: "Next billing", value: (c) => c.services[0]?.nextBillingAt ?? null },
        { header: "Payments (count)", value: (c) => paidBy.get(c.id)?._count._all ?? 0 },
        { header: "Total paid", value: (c) => major(paidBy.get(c.id)?._sum.amountMinor) },
        { header: "Open invoices", value: (c) => owedBy.get(c.id)?._count._all ?? 0 },
        { header: "Outstanding", value: (c) => major((owedBy.get(c.id)?._sum.totalMinor ?? 0) - (owedBy.get(c.id)?._sum.amountPaidMinor ?? 0)) },
        { header: "Last payment", value: (c) => lastBy.get(c.id)?.createdAt ?? null },
        { header: "Last payment amount", value: (c) => (lastBy.get(c.id) ? major(lastBy.get(c.id)!.amountMinor) : "") },
        { header: "Last payment method", value: (c) => lastBy.get(c.id)?.method ?? "" },
        { header: "Joined", value: (c) => c.createdAt },
        { header: "Notes", value: (c) => c.notes },
      ]);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "customers.exported",
        resourceType: "Customer",
        after: { rows: customers.length },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });
      reply
        .header("content-type", "text/csv; charset=utf-8")
        .header("content-disposition", `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.csv"`)
        .send(csv);
    }
  );

  /** Staff message a customer by email and/or SMS; delivered by the worker and audited with
   *  the outcome per channel. */
  app.post(
    "/:customerId/message",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("customers.update")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { customerId } = idParamsSchema.parse(request.params);
      const body = messageSchema.parse(request.body);
      const customer = await getCustomerOrThrow(tenantId, customerId);
      if (body.channels.includes("EMAIL") && !customer.email && !body.channels.includes("SMS")) {
        throw new ConflictError("This customer has no email address on file — send an SMS instead, or add their email first");
      }
      await enqueueSendCustomerMessage({ tenantId, customerId, ...body, sentByUserId: request.user!.id });
      reply.status(202).send(
        successResponse(
          {
            queued: true,
            channels: body.channels.filter((c) => c !== "EMAIL" || Boolean(customer.email)),
            note: body.channels.includes("EMAIL") && !customer.email ? "No email on file; sent by SMS only." : "Sending now. The outcome is recorded in the audit log.",
          },
          request.id
        )
      );
    }
  );

  app.post(
    "/",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("customers.create")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const body = createCustomerSchema.parse(request.body);
      await assertBranchInTenant(tenantId, body.branchId);
      await assertWithinPlanLimit(tenantId, "customers");
      const customer = await createCustomer(tenantId, body);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "customer.created",
        resourceType: "Customer",
        resourceId: customer.id,
        after: customer,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      void emitWebhookEvent(tenantId, "customer.created", {
        id: customer.id,
        customerNumber: customer.customerNumber,
        fullName: customer.fullName,
        status: customer.status,
      });

      reply.status(201).send(successResponse(customer, request.id));
    }
  );

  app.get(
    "/:customerId",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("customers.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { customerId } = idParamsSchema.parse(request.params);
      const customer = await getCustomerOrThrow(tenantId, customerId);
      reply.send(successResponse(customer, request.id));
    }
  );

  app.patch(
    "/:customerId",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("customers.update")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { customerId } = idParamsSchema.parse(request.params);
      const body = updateCustomerSchema.parse(request.body);
      const before = await getCustomerOrThrow(tenantId, customerId);
      await assertBranchInTenant(tenantId, body.branchId);
      const after = await updateCustomer(tenantId, customerId, body);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "customer.updated",
        resourceType: "Customer",
        resourceId: customerId,
        before,
        after,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(after, request.id));
    }
  );

  app.post(
    "/:customerId/status",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("customers.update")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { customerId } = idParamsSchema.parse(request.params);
      const { status } = statusSchema.parse(request.body);
      const before = await getCustomerOrThrow(tenantId, customerId);
      const after = await changeCustomerStatus(tenantId, customerId, status);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "customer.status_changed",
        resourceType: "Customer",
        resourceId: customerId,
        before: { status: before.status },
        after: { status: after.status },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(after, request.id));
    }
  );

  app.post(
    "/:customerId/link-account",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("customers.update")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { customerId } = idParamsSchema.parse(request.params);
      const { email } = z.object({ email: z.string().email() }).parse(request.body);
      const after = await linkCustomerToUserAccount(tenantId, customerId, email);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "customer.account_linked",
        resourceType: "Customer",
        resourceId: customerId,
        after: { linkedUserId: after.userId },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(after, request.id));
    }
  );
}
