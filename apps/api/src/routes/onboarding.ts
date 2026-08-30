import type { FastifyInstance } from "fastify";
import { prisma } from "@mashupkgrid/database";
import { successResponse, ConflictError } from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance, requirePermission("settings.manage")];

interface OnboardingStep {
  key: string;
  label: string;
  href: string;
  done: boolean;
}

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) throw new ConflictError("Onboarding progress is not tracked at the platform level");
  return tenantId;
}

/** Every check here reads real, persisted state — nothing is a client-side flag a tenant could
 *  dismiss without actually doing the thing. Order matters: it's also the order steps are shown
 *  in, roughly cheapest/most-foundational first. */
export async function onboardingRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { config: { audience: "staff" }, preHandler }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);

    const [tenant, smsConfig, mpesaConfig, paystackConfig, routerCount, customerCount, packageCount] =
      await Promise.all([
        prisma.tenant.findUnique({ where: { id: tenantId }, select: { brandColor: true, logoUrl: true } }),
        prisma.smsProviderConfig.findUnique({ where: { tenantId } }),
        prisma.paymentProviderConfig.findUnique({
          where: { tenantId_provider: { tenantId, provider: "MPESA" } },
        }),
        prisma.paymentProviderConfig.findUnique({
          where: { tenantId_provider: { tenantId, provider: "PAYSTACK" } },
        }),
        prisma.router.count({ where: { tenantId, deletedAt: null } }),
        prisma.customer.count({ where: { tenantId, deletedAt: null } }),
        prisma.package.count({ where: { tenantId } }),
      ]);

    const steps: OnboardingStep[] = [
      {
        key: "branding",
        label: "Set network name & logo",
        href: "/settings",
        done: Boolean(tenant?.brandColor || tenant?.logoUrl),
      },
      {
        key: "sms",
        label: "Configure SMS provider",
        href: "/sms",
        done: Boolean(smsConfig?.isActive),
      },
      {
        key: "payment",
        label: "Choose a payment gateway",
        href: "/mpesa",
        done: Boolean(mpesaConfig?.isActive) || Boolean(paystackConfig?.isActive),
      },
      { key: "router", label: "Link a router", href: "/routers/new", done: routerCount > 0 },
      { key: "package", label: "Create a package", href: "/packages", done: packageCount > 0 },
      { key: "customer", label: "Add your first customer", href: "/customers", done: customerCount > 0 },
    ];

    reply.send(successResponse({ steps }, request.id));
  });
}
