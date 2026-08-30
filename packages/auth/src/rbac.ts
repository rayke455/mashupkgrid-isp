import { prisma } from "@mashupkgrid/database";
import { ForbiddenError, type PermissionKey } from "@mashupkgrid/shared";

/**
 * Resolves a user's effective permission set within a given tenant scope (or the platform
 * scope, tenantId = null, for SUPER_ADMIN). Pure DB read — the API layer is responsible for
 * wrapping this with the Redis cache described in docs/architecture/03 (this package has no
 * Redis dependency by design, so it stays testable without infrastructure).
 */
export async function getEffectivePermissions(
  userId: string,
  tenantId: string | null
): Promise<Set<string>> {
  const userRoles = await prisma.userRole.findMany({
    where: { userId, tenantId },
    include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
  });

  const permissions = new Set<string>();
  for (const userRole of userRoles) {
    for (const rp of userRole.role.rolePermissions) {
      permissions.add(rp.permission.key);
    }
  }
  return permissions;
}

export async function hasPermission(
  userId: string,
  tenantId: string | null,
  permission: PermissionKey
): Promise<boolean> {
  const permissions = await getEffectivePermissions(userId, tenantId);
  return permissions.has(permission);
}

/**
 * Privilege-escalation guard: a user editing a role's permissions (or creating a custom role)
 * can never grant a permission they don't themselves hold in that tenant.
 */
export function assertNoPrivilegeEscalation(
  grantorPermissions: ReadonlySet<string>,
  requestedPermissionKeys: readonly string[]
): void {
  const notHeld = requestedPermissionKeys.filter((key) => !grantorPermissions.has(key));
  if (notHeld.length > 0) {
    throw new ForbiddenError(
      `Cannot grant permissions you do not hold: ${notHeld.join(", ")}`
    );
  }
}
