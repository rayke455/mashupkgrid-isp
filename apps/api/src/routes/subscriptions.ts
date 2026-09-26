import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import {
  subscribeCustomerToPackage,
  cancelSubscription,
  suspendSubscription,
  reactivateSubscription,
  getSubscriptionOrThrow,
} from "@mashupkgrid/billing";
import { successResponse, ConflictError } from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

const subscribeSchema = z.object({
  customerId: z.string().uuid(),
  packageId: z.string().uuid(),
  startDate: z.string().datetime().optional(),
  priceOverrideMinor: z.number().int().nonnegative().optional(),
  autoRenew: z.boolean().optional(),
});

const idParamsSchema = z.object({ subscriptionId: z.string().uuid() });
const listQuerySchema = z.object({ customerId: z.string().uuid().optional() });
const extendSchema = z.object({ days: z.number().int().min(1).max(365), reason: z.string().trim().max(200).optional() });

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) throw new ConflictError("Subscription management is not available at the platform level");
  return tenantId;
}

export async function subscriptionRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/",
    {
      config: { audience: "staff" },
      preHandler: [...preHandler, requirePermission("customer_services.read")],
    },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const query = listQuerySchema.parse(request.query);
      const subscriptions = await prisma.customerService.findMany({
        where: { tenantId, ...(query.customerId ? { customerId: query.customerId } : {}) },
        include: { package: true },
        orderBy: { createdAt: "desc" },
      });
      reply.send(successResponse(subscriptions, request.id));
    }
  );

  app.post(
    "/",
    {
      config: { audience: "staff" },
      preHandler: [...preHandler, requirePermission("customer_services.manage")],
    },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const body = subscribeSchema.parse(request.body);
      const result = await subscribeCustomerToPackage(tenantId, {
        customerId: body.customerId,
        packageId: body.packageId,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        priceOverrideMinor: body.priceOverrideMinor,
        autoRenew: body.autoRenew,
      });

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "customer_service.subscribed",
        resourceType: "CustomerService",
        resourceId: result.subscription.id,
        after: { customerId: body.customerId, packageId: body.packageId, invoiceId: result.invoiceId },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.status(201).send(successResponse(result, request.id));
    }
  );

  app.get(
    "/:subscriptionId",
    {
      config: { audience: "staff" },
      preHandler: [...preHandler, requirePermission("customer_services.read")],
    },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { subscriptionId } = idParamsSchema.parse(request.params);
      reply.send(successResponse(await getSubscriptionOrThrow(tenantId, subscriptionId), request.id));
    }
  );

  for (const [path, action, auditAction] of [
    ["cancel", cancelSubscription, "customer_service.cancelled"],
    ["suspend", suspendSubscription, "customer_service.suspended"],
    ["reactivate", reactivateSubscription, "customer_service.reactivated"],
  ] as const) {
    app.post(
      `/:subscriptionId/${path}`,
      {
        config: { audience: "staff" },
        preHandler: [...preHandler, requirePermission("customer_services.manage")],
      },
      async (request, reply) => {
        const tenantId = requireTenant(request.user!.tenantId);
        const { subscriptionId } = idParamsSchema.parse(request.params);
        const before = await getSubscriptionOrThrow(tenantId, subscriptionId);
        const after = await action(tenantId, subscriptionId);

        await writeAuditLog({
          tenantId,
          actorUserId: request.user!.id,
          action: auditAction,
          resourceType: "CustomerService",
          resourceId: subscriptionId,
          before: { status: before.status },
          after: { status: after.status },
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        });

        reply.send(successResponse(after, request.id));
      }
    );
  }

  /**
   * Gives a customer extra days: an outage credit, a goodwill extension, "pay me on Friday".
   * Pushes the next billing date out by that many days and, so the extension actually keeps
   * them online, pushes the due date of every open invoice on the subscription by the same
   * amount (an overdue invoice is what suspends a customer, not the billing date). A suspended
   * subscription is reactivated as part of it — the whole point is that they get back online.
   */
  app.post(
    "/:subscriptionId/extend",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("customer_services.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { subscriptionId } = idParamsSchema.parse(request.params);
      const { days, reason } = extendSchema.parse(request.body);
      const before = await getSubscriptionOrThrow(tenantId, subscriptionId);
      if (before.status === "CANCELLED") throw new ConflictError("A cancelled subscription cannot be extended — subscribe the customer again instead");

      const addDays = (d: Date) => new Date(d.getTime() + days * 24 * 60 * 60_000);
      const { after, invoicesMoved } = await prisma.$transaction(async (tx) => {
        const updated = await tx.customerService.update({
          where: { id: subscriptionId },
          data: { nextBillingAt: addDays(before.nextBillingAt < new Date() ? new Date() : before.nextBillingAt) },
        });
        const open = await tx.invoice.findMany({
          where: { tenantId, customerServiceId: subscriptionId, status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] } },
          select: { id: true, dueDate: true },
        });
        for (const inv of open) {
          const newDue = addDays(inv.dueDate < new Date() ? new Date() : inv.dueDate);
          // Back to PENDING: it is no longer past due, and the suspension sweep only looks at OVERDUE.
          await tx.invoice.update({ where: { id: inv.id }, data: { dueDate: newDue, status: "PENDING" } });
        }
        return { after: updated, invoicesMoved: open.length };
      });

      const reactivated = before.status === "SUSPENDED" ? await reactivateSubscription(tenantId, subscriptionId) : null;

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "subscription.extended",
        resourceType: "CustomerService",
        resourceId: subscriptionId,
        before: { nextBillingAt: before.nextBillingAt, status: before.status },
        after: { nextBillingAt: after.nextBillingAt, status: reactivated?.status ?? after.status, days, reason: reason ?? null, invoicesMoved },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });
      reply.send(successResponse({ ...(reactivated ?? after), invoicesMoved, reactivated: Boolean(reactivated) }, request.id));
    }
  );
}
