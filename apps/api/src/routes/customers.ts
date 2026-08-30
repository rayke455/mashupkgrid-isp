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
  paginationQuerySchema,
  paginate,
  toSkipTake,
  buildSafeOrderBy,
  buildKeywordSearchWhere,
} from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";
import { emitWebhookEvent } from "../lib/webhooks.js";
import { assertWithinPlanLimit } from "../lib/plan-limits.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

const createCustomerSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().min(5),
  idNumber: z.string().optional(),
  address: z.string().optional(),
  gpsLat: z.number().optional(),
  gpsLng: z.number().optional(),
  connectionType: z.string().optional(),
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
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

const idParamsSchema = z.object({ customerId: z.string().uuid() });

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

  app.post(
    "/",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("customers.create")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const body = createCustomerSchema.parse(request.body);
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
