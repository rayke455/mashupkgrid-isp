import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, type Tenant } from "@mashupkgrid/database";
import { initiateOnboardingFeeStkPush, getOnboardingFeeStatus } from "@mashupkgrid/payments";
import { env } from "@mashupkgrid/config";
import {
  successResponse,
  NotFoundError,
  ConflictError,
  paginationQuerySchema,
  paginate,
  toSkipTake,
  buildSafeOrderBy,
  buildKeywordSearchWhere,
  TENANT_FEATURES,
  isReservedSubdomain,
} from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

/** A tenant's slug already IS its automatic platform subdomain — no separate column, see the
 *  multi-tenant-domains plan. This just computes the display URL from it; actually making
 *  `{slug}.{PLATFORM_BASE_DOMAIN}` resolve to the tenant's dashboard is a separate,
 *  not-yet-built hostname-routing layer. */
function platformUrlFor(slug: string): string {
  return `https://${slug}.${env.PLATFORM_BASE_DOMAIN}`;
}

function withPlatformUrl<T extends Tenant>(tenant: T): T & { platformUrl: string } {
  return { ...tenant, platformUrl: platformUrlFor(tenant.slug) };
}

const createTenantSchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase alphanumeric with hyphens"),
  timezone: z.string().default("Africa/Nairobi"),
  currency: z.string().default("KES"),
  planTier: z.string().default("standard"),
  /** Which TenantPlan to start the tenant's trial on — defaults to the platform's default plan
   *  when omitted. Drives trialEndsAt (plan.trialDays) instead of a hardcoded constant. */
  planId: z.string().uuid().optional(),
  /** Only used to kick off the onboarding-fee STK push right away — never stored on the tenant
   *  itself (a tenant's real billing contact is whichever staff account signs in first). */
  ownerPhone: z.string().min(9).optional(),
});

const updateTenantSchema = createTenantSchema.partial().omit({ slug: true, ownerPhone: true }).extend({
  disabledFeatures: z.array(z.enum(TENANT_FEATURES)).optional(),
  // ISO datetime string, or null to clear the trial entirely (treat as never having had one) —
  // lets a super admin extend a trial ("+3 more days") or mark a tenant as paid/exempt.
  trialEndsAt: z.string().datetime().nullable().optional(),
});

const listQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

const idParamsSchema = z.object({ tenantId: z.string().uuid() });

const SORTABLE_FIELDS = ["name", "slug", "createdAt", "status"] as const;
const SEARCHABLE_FIELDS = ["name", "slug"];

export async function tenantRoutes(app: FastifyInstance): Promise<void> {
/**
 * Per-tenant usage for the platform tenant list.
 *
 * The list previously showed only administrative state — plan, status, trial dates — which
 * cannot answer the question a platform operator actually has: is this tenant LIVE? A tenant who
 * signed up, never linked a router and has taken no money looks identical to a thriving one, and
 * a trial ending in two days is worth a call only if there is a real network behind it.
 *
 * Three grouped queries scoped to the page's tenant ids, not one query per tenant: the aggregate
 * cost stays flat whether the page shows 10 tenants or 100.
 */
async function loadTenantUsage(tenantIds: string[]): Promise<Map<string, TenantUsage>> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [routers, customers, revenue] = await Promise.all([
    prisma.router.groupBy({
      by: ["tenantId", "status"],
      where: { tenantId: { in: tenantIds }, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.customer.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: tenantIds } },
      _count: { _all: true },
    }),
    prisma.payment.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: tenantIds }, status: "COMPLETED", createdAt: { gte: since } },
      _sum: { amountMinor: true },
    }),
  ]);

  const usage = new Map<string, TenantUsage>();
  const blank = (): TenantUsage => ({
    routerCount: 0,
    routersOnline: 0,
    customerCount: 0,
    revenue30dMinor: 0,
  });

  for (const id of tenantIds) usage.set(id, blank());
  for (const row of routers) {
    const entry = usage.get(row.tenantId)!;
    entry.routerCount += row._count._all;
    if (row.status === "ONLINE") entry.routersOnline += row._count._all;
  }
  for (const row of customers) usage.get(row.tenantId)!.customerCount = row._count._all;
  for (const row of revenue) usage.get(row.tenantId)!.revenue30dMinor = row._sum.amountMinor ?? 0;

  return usage;
}

interface TenantUsage {
  routerCount: number;
  routersOnline: number;
  customerCount: number;
  revenue30dMinor: number;
}

  app.get(
    "/",
    { config: { audience: "platform" }, preHandler: [...preHandler, requirePermission("tenants.read")] },
    async (request, reply) => {
      const query = listQuerySchema.parse(request.query);
      const where = { deletedAt: null, ...buildKeywordSearchWhere(query.search, SEARCHABLE_FIELDS) };
      const [items, total] = await Promise.all([
        prisma.tenant.findMany({
          where,
          ...toSkipTake(query),
          orderBy: buildSafeOrderBy(query.sortBy, query.sortOrder, SORTABLE_FIELDS, "createdAt"),
          include: { subscription: { include: { plan: true } } },
        }),
        prisma.tenant.count({ where }),
      ]);

      const usage = await loadTenantUsage(items.map((tenant) => tenant.id));
      // platformBaseDomain rides along here (not a separate request) so the "Provision New
      // Tenant" form's live URL preview can show the real configured domain instead of a
      // hardcoded guess — this list is already fetched on page load regardless.
      reply.send(
        successResponse(
          {
            ...paginate(
              items.map((tenant) => ({ ...withPlatformUrl(tenant), usage: usage.get(tenant.id)! })),
              total,
              query
            ),
            platformBaseDomain: env.PLATFORM_BASE_DOMAIN,
          },
          request.id
        )
      );
    }
  );

  app.post(
    "/",
    { config: { audience: "platform" }, preHandler: [...preHandler, requirePermission("tenants.create")] },
    async (request, reply) => {
      const { ownerPhone, planId: requestedPlanId, ...tenantFields } = createTenantSchema.parse(request.body);
      if (isReservedSubdomain(tenantFields.slug)) {
        throw new ConflictError(`"${tenantFields.slug}" is a reserved subdomain — choose a different tenant slug`);
      }

      const plan = requestedPlanId
        ? await prisma.tenantPlan.findUnique({ where: { id: requestedPlanId } })
        : await prisma.tenantPlan.findFirst({ where: { isDefault: true, isActive: true } });
      if (!plan) {
        throw new ConflictError(
          requestedPlanId ? "The requested plan does not exist" : "No default plan is configured — create one first"
        );
      }

      const trialEndsAt = new Date(Date.now() + plan.trialDays * 24 * 60 * 60 * 1000);
      const tenant = await prisma.tenant.create({
        data: {
          ...tenantFields,
          trialEndsAt,
          subscription: {
            create: { planId: plan.id, status: "TRIALING", currentPeriodEnd: trialEndsAt },
          },
        },
      });

      // Best-effort — a tenant should exist even if the platform's own M-Pesa isn't configured
      // yet, or the owner didn't give a phone number at creation time. A super admin can trigger
      // the onboarding-fee charge later from the tenant's own page once either is sorted out.
      if (ownerPhone) {
        try {
          await initiateOnboardingFeeStkPush(tenant.id, ownerPhone);
        } catch (err) {
          request.log.warn({ err, tenantId: tenant.id }, "Onboarding-fee STK push failed at tenant creation");
        }
      }

      await writeAuditLog({
        tenantId: tenant.id,
        actorUserId: request.user!.id,
        action: "tenant.created",
        resourceType: "Tenant",
        resourceId: tenant.id,
        after: tenant,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });
      reply.status(201).send(successResponse(withPlatformUrl(tenant), request.id));
    }
  );

  app.get(
    "/:tenantId",
    { config: { audience: "platform" }, preHandler: [...preHandler, requirePermission("tenants.read")] },
    async (request, reply) => {
      const { tenantId } = idParamsSchema.parse(request.params);
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { subscription: { include: { plan: true } } },
      });
      if (!tenant || tenant.deletedAt) throw new NotFoundError("Tenant");
      reply.send(successResponse(withPlatformUrl(tenant), request.id));
    }
  );

  app.patch(
    "/:tenantId",
    { config: { audience: "platform" }, preHandler: [...preHandler, requirePermission("tenants.update")] },
    async (request, reply) => {
      const { tenantId } = idParamsSchema.parse(request.params);
      const { trialEndsAt, ...body } = updateTenantSchema.parse(request.body);
      const before = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!before || before.deletedAt) throw new NotFoundError("Tenant");

      const after = await prisma.tenant.update({
        where: { id: tenantId },
        data: { ...body, ...(trialEndsAt !== undefined ? { trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : null } : {}) },
      });
      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "tenant.updated",
        resourceType: "Tenant",
        resourceId: tenantId,
        before,
        after,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });
      reply.send(successResponse(withPlatformUrl(after), request.id));
    }
  );

  app.post(
    "/:tenantId/suspend",
    { config: { audience: "platform" }, preHandler: [...preHandler, requirePermission("tenants.suspend")] },
    async (request, reply) => {
      const { tenantId } = idParamsSchema.parse(request.params);
      const before = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!before || before.deletedAt) throw new NotFoundError("Tenant");

      const after = await prisma.tenant.update({ where: { id: tenantId }, data: { status: "SUSPENDED" } });
      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "tenant.suspended",
        resourceType: "Tenant",
        resourceId: tenantId,
        before,
        after,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });
      reply.send(successResponse(withPlatformUrl(after), request.id));
    }
  );

  app.post(
    "/:tenantId/reactivate",
    { config: { audience: "platform" }, preHandler: [...preHandler, requirePermission("tenants.suspend")] },
    async (request, reply) => {
      const { tenantId } = idParamsSchema.parse(request.params);
      const before = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!before || before.deletedAt) throw new NotFoundError("Tenant");

      const after = await prisma.tenant.update({ where: { id: tenantId }, data: { status: "ACTIVE" } });
      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "tenant.reactivated",
        resourceType: "Tenant",
        resourceId: tenantId,
        before,
        after,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });
      reply.send(successResponse(withPlatformUrl(after), request.id));
    }
  );

  // --- Onboarding fee (450 KSH, collected via the platform's own M-Pesa, not the tenant's) ---

  app.get(
    "/:tenantId/onboarding-fee",
    { config: { audience: "platform" }, preHandler: [...preHandler, requirePermission("tenants.read")] },
    async (request, reply) => {
      const { tenantId } = idParamsSchema.parse(request.params);
      const fee = await getOnboardingFeeStatus(tenantId);
      reply.send(successResponse(fee, request.id));
    }
  );

  app.post(
    "/:tenantId/onboarding-fee/charge",
    { config: { audience: "platform" }, preHandler: [...preHandler, requirePermission("tenants.update")] },
    async (request, reply) => {
      const { tenantId } = idParamsSchema.parse(request.params);
      const { phone } = z.object({ phone: z.string().min(9) }).parse(request.body);

      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant || tenant.deletedAt) throw new NotFoundError("Tenant");

      const fee = await initiateOnboardingFeeStkPush(tenantId, phone);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "tenant.onboarding_fee_charged",
        resourceType: "TenantOnboardingFee",
        resourceId: fee.id,
        after: { checkoutRequestId: fee.checkoutRequestId, amountMinor: fee.amountMinor },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.status(201).send(successResponse(fee, request.id));
    }
  );

  // --- Subscription plan assignment (super admin changes a tenant's plan/cycle) ---

  app.patch(
    "/:tenantId/subscription",
    { config: { audience: "platform" }, preHandler: [...preHandler, requirePermission("tenants.update")] },
    async (request, reply) => {
      const { tenantId } = idParamsSchema.parse(request.params);
      const { planId, billingCycle } = z
        .object({ planId: z.string().uuid(), billingCycle: z.enum(["MONTHLY", "ANNUAL"]).optional() })
        .parse(request.body);

      const [tenant, plan, before] = await Promise.all([
        prisma.tenant.findUnique({ where: { id: tenantId } }),
        prisma.tenantPlan.findUnique({ where: { id: planId } }),
        prisma.tenantSubscription.findUnique({ where: { tenantId } }),
      ]);
      if (!tenant || tenant.deletedAt) throw new NotFoundError("Tenant");
      if (!plan) throw new NotFoundError("Plan");

      // No proration this pass — plan change takes effect immediately, currentPeriodEnd unchanged.
      const after = before
        ? await prisma.tenantSubscription.update({
            where: { tenantId },
            data: { planId, ...(billingCycle ? { billingCycle } : {}) },
          })
        : await prisma.tenantSubscription.create({
            data: {
              tenantId,
              planId,
              billingCycle: billingCycle ?? "MONTHLY",
              status: "ACTIVE",
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          });

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "tenant.plan_changed",
        resourceType: "TenantSubscription",
        resourceId: after.id,
        before,
        after,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(after, request.id));
    }
  );
}
