import type { FastifyRequest } from "fastify";
import { ConflictError, type TenantFeatureKey, TENANT_FEATURE_LABELS } from "@mashupkgrid/shared";

/**
 * Feature gate — must run after `resolveTenant` (needs `request.tenantCtx.disabledFeatures` and
 * `.planFeatures`). A super-admin request (`tenantCtx === null`) always passes: features are a
 * per-tenant restriction, not something that could ever apply to the platform scope itself.
 * Two independent checks, either can block: `disabledFeatures` is a super admin's manual
 * per-tenant override; `planFeatures` (null = no plan assigned = unrestricted) is what the
 * tenant's current TenantPlan includes.
 */
export function requireFeature(feature: TenantFeatureKey) {
  return async function requireFeatureHandler(request: FastifyRequest): Promise<void> {
    if (!request.tenantCtx) return;
    if (request.tenantCtx.disabledFeatures.includes(feature)) {
      throw new ConflictError(
        `${TENANT_FEATURE_LABELS[feature]} is not enabled for your account — contact your platform administrator.`
      );
    }
    if (request.tenantCtx.planFeatures && !request.tenantCtx.planFeatures.includes(feature)) {
      throw new ConflictError(
        `${TENANT_FEATURE_LABELS[feature]} is not included in your current plan — upgrade to enable it.`
      );
    }
  };
}
