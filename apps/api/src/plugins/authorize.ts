import type { FastifyRequest } from "fastify";
import type { PermissionKey } from "@mashupkgrid/shared";
import { ForbiddenError, UnauthorizedError } from "@mashupkgrid/shared";
import { getCachedPermissions } from "../lib/permission-cache.js";

/**
 * Authorization is always a server-side gate (project instruction §6/§78) — this is the only
 * place a route decides whether a user may proceed, never a hidden frontend button. Runs after
 * authentication, tenant resolution, and the maintenance check.
 */
export function requirePermission(permission: PermissionKey) {
  return async function requirePermissionHandler(request: FastifyRequest): Promise<void> {
    if (!request.user) {
      throw new UnauthorizedError();
    }
    const permissions = await getCachedPermissions(request.user.id, request.user.tenantId);
    if (!permissions.has(permission)) {
      throw new ForbiddenError(`Missing required permission: ${permission}`);
    }
    if (request.user.apiKeyScopes && !request.user.apiKeyScopes.includes(permission)) {
      throw new ForbiddenError(`API token is not scoped for: ${permission}`);
    }
  };
}
