import { prisma } from "@mashupkgrid/database";
import { ConflictError } from "@mashupkgrid/shared";

export type LimitedResource = "customers" | "routers";

/**
 * Called from route handlers (not the service layer — packages/billing and packages/network must
 * not depend on apps/api) right before the existing create call. A tenant with no subscription
 * row is treated as unrestricted — every tenant created through normal flows always has one (see
 * the backfill script for pre-existing tenants), so this only matters for a tenant a super admin
 * has manually detached from any plan.
 */
export async function assertWithinPlanLimit(tenantId: string, resource: LimitedResource): Promise<void> {
  const subscription = await prisma.tenantSubscription.findUnique({
    where: { tenantId },
    include: { plan: true },
  });
  if (!subscription) return;

  const limit = resource === "customers" ? subscription.plan.maxCustomers : subscription.plan.maxRouters;
  if (limit === null) return;

  const count =
    resource === "customers"
      ? await prisma.customer.count({ where: { tenantId, deletedAt: null } })
      : await prisma.router.count({ where: { tenantId, deletedAt: null } });

  if (count >= limit) {
    throw new ConflictError(
      `Your "${subscription.plan.name}" plan allows up to ${limit} ${resource} — upgrade your plan to add more.`
    );
  }
}
