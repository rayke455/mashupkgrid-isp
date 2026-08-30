import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import {
  initiateSubscriptionChargeStkPush,
  getTenantSubscriptionPayments,
  assertNoUnpaidSubscriptionCharge,
} from "@mashupkgrid/payments";
import { successResponse, ConflictError, NotFoundError } from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance, requirePermission("settings.manage")];

const renewSchema = z.object({ phone: z.string().min(9) });

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) throw new ConflictError("Subscription billing is not available at the platform level");
  return tenantId;
}

/** Tenant-facing "My Subscription" routes — self-service, one level below the super-admin
 *  /platform/plans catalog and /platform/tenants/:id/subscription assignment. Registered at
 *  /api/v1/billing, deliberately not /api/v1/subscriptions (already the ISP's own
 *  customer-subscription routes — see the multi-tenant-domains plan's naming-collision note). */
export async function tenantBillingRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { config: { audience: "staff" }, preHandler }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);

    const subscription = await prisma.tenantSubscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });
    if (!subscription) throw new NotFoundError("Subscription");

    const [customerCount, routerCount, payments] = await Promise.all([
      prisma.customer.count({ where: { tenantId, deletedAt: null } }),
      prisma.router.count({ where: { tenantId, deletedAt: null } }),
      getTenantSubscriptionPayments(tenantId),
    ]);

    reply.send(
      successResponse(
        {
          subscription,
          usage: {
            customers: { used: customerCount, limit: subscription.plan.maxCustomers },
            routers: { used: routerCount, limit: subscription.plan.maxRouters },
          },
          payments,
        },
        request.id
      )
    );
  });

  app.post("/renew", { config: { audience: "staff" }, preHandler }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const { phone } = renewSchema.parse(request.body);

    await assertNoUnpaidSubscriptionCharge(tenantId);
    const payment = await initiateSubscriptionChargeStkPush(tenantId, phone);

    await writeAuditLog({
      tenantId,
      actorUserId: request.user!.id,
      action: "subscription.renewal_charged",
      resourceType: "TenantSubscriptionPayment",
      resourceId: payment.id,
      after: { checkoutRequestId: payment.checkoutRequestId, amountMinor: payment.amountMinor },
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });

    reply.status(201).send(successResponse(payment, request.id));
  });
}
