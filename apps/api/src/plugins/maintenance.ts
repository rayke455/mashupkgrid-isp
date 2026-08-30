import type { FastifyRequest } from "fastify";
import { prisma } from "@mashupkgrid/database";
import { MaintenanceModeError } from "@mashupkgrid/shared";
import { getCurrentMaintenanceState } from "../lib/maintenance-state.js";
import type { RouteAudience, MaintenanceCategory } from "../types.js";
import type { MaintenanceEvent } from "@mashupkgrid/database";

async function getUserRoleNames(userId: string, tenantId: string | null): Promise<string[]> {
  const userRoles = await prisma.userRole.findMany({
    where: { userId, tenantId },
    include: { role: true },
  });
  return userRoles.map((ur) => ur.role.name);
}

/**
 * Maintenance-mode enforcement. Must run after `authenticate`/`resolveTenant` (so role/IP
 * bypass checks have `request.user` available) and before authorization/validation, per the
 * required middleware order (docs/architecture/00-overview.md §4, 05-maintenance-and-queues.md).
 */
export async function checkMaintenance(request: FastifyRequest): Promise<void> {
  const audience: RouteAudience = request.routeOptions.config.audience ?? "public";

  if (audience === "system-critical") return; // payment callbacks / webhooks / health checks

  const state = await getCurrentMaintenanceState();
  if (!state.enabled) return;

  // IP allowlist bypass (checked before role bypass since it doesn't require an authenticated user).
  if (state.allowedIps.includes(request.ip)) return;

  // Role allowlist bypass.
  if (request.user) {
    const roleNames = await getUserRoleNames(request.user.id, request.user.tenantId);
    if (roleNames.some((name) => state.allowedRoles.includes(name))) return;
  }

  // Granular allow* flags: an explicit bypass for a specific category of operation, layered on
  // top of the level table (see MaintenanceCategory's doc comment in types.ts).
  const category: MaintenanceCategory | undefined = request.routeOptions.config.maintenanceCategory;
  if (category && isCategoryExplicitlyAllowed(category, state)) return;

  if (isAudienceBlockedAtLevel(audience, state.level)) {
    throw new MaintenanceModeError(
      state.message ?? "The platform is currently undergoing maintenance. Please try again later.",
      state.endAt ? state.endAt.toString() : null
    );
  }
}

export function isCategoryExplicitlyAllowed(
  category: MaintenanceCategory,
  state: Pick<MaintenanceEvent, "allowLogin" | "allowPayments">
): boolean {
  switch (category) {
    case "login":
      return state.allowLogin;
    case "payment":
      return state.allowPayments;
  }
}

/**
 * Pure level/audience decision table, extracted so it can be unit tested without any
 * DB/Redis/HTTP fixtures (docs/architecture/05-maintenance-and-queues.md, "MAINTENANCE
 * LEVELS"). `system-critical` is never blocked here — that carve-out is handled by the early
 * return in `checkMaintenance` before this is even called.
 */
export function isAudienceBlockedAtLevel(audience: RouteAudience, level: number): boolean {
  const blockedByLevel: Record<number, RouteAudience[]> = {
    1: [],
    2: ["public", "customer"],
    3: ["public", "customer"],
    4: ["public", "customer", "staff"],
    5: ["public", "customer", "staff", "platform"],
  };
  // An out-of-range level (data corruption, a future level not yet mapped here) fails closed
  // — treated as maximally restrictive (LEVEL 5's block set) rather than as "block nothing".
  return (blockedByLevel[level] ?? blockedByLevel[5]!).includes(audience);
}
