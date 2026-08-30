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
}
