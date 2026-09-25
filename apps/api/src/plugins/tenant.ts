import type { FastifyRequest } from "fastify";
import { prisma } from "@mashupkgrid/database";
import { TenantSuspendedError, TenantPendingApprovalError, TenantTrialExpiredError, UnauthorizedError } from "@mashupkgrid/shared";

/**
 * Tenant resolution preHandler — must run after `authenticate`. Staff/customer accounts are
 * scoped to exactly one tenant in Phase 1 (their `User.tenantId`); SUPER_ADMIN accounts have
 * `tenantId = null` and operate in the platform scope (`request.tenantCtx = null`) — platform
 * routes that need to act on a specific tenant take that tenant's id as an explicit route
 * param, which is itself audit-logged, rather than any implicit "acting as" state.
 */
export async function resolveTenant(request: FastifyRequest): Promise<void> {
  if (!request.user) {
    throw new UnauthorizedError("Authentication is required before tenant resolution");
  }

  if (request.user.tenantId === null) {
    request.tenantCtx = null;
    return;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: request.user.tenantId },
    include: { subscription: { include: { plan: true } } },
  });
  if (!tenant || tenant.deletedAt) {
    throw new UnauthorizedError("Tenant account no longer exists");
  }
  if (tenant.status === "SUSPENDED") {
    throw new TenantSuspendedError();
  }
  if (tenant.status === "CANCELLED") {
    throw new UnauthorizedError("This tenant account has been cancelled");
  }
  if (tenant.status === "PENDING_APPROVAL") {
    throw new TenantPendingApprovalError();
  }

  const now = new Date();
  const isTrialExpired = Boolean(
    tenant.trialEndsAt &&
    tenant.trialEndsAt <= now &&
    tenant.subscription?.status !== "ACTIVE"
  );

  request.tenantCtx = {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    status: tenant.status,
    brandColor: tenant.brandColor,
    logoUrl: tenant.logoUrl,
    disabledFeatures: tenant.disabledFeatures,
    trialEndsAt: tenant.trialEndsAt ? tenant.trialEndsAt.toISOString() : null,
    planFeatures: tenant.subscription?.plan.features ?? null,
    subscriptionStatus: tenant.subscription?.status ?? null,
    isTrialExpired,
  };

  // If the trial has expired and there is no active paid subscription, block tenant feature routes.
  // Billing, subscription, plans, and account endpoints stay accessible so the tenant can pay.
  if (isTrialExpired) {
    const rawPath = request.url || (request as any).routerPath || "";
    const isExempt =
      rawPath.startsWith("/api/v1/auth") ||
      rawPath.startsWith("/api/v1/tenant-billing") ||
      rawPath.startsWith("/api/v1/subscriptions") ||
      rawPath.startsWith("/api/v1/plans") ||
      rawPath.startsWith("/api/v1/announcements") ||
      rawPath.startsWith("/api/v1/notifications") ||
      rawPath.startsWith("/api/v1/settings/account") ||
      rawPath.startsWith("/api/v1/tenants/me") ||
      rawPath.startsWith("/api/v1/tenants/subscription");

    if (!isExempt) {
      throw new TenantTrialExpiredError(
        "Your free trial has ended. Please subscribe to a plan under Settings > Billing to continue using tenant features."
      );
    }
  }
}

