import { getEffectivePermissions } from "@mashupkgrid/auth";
import { prisma } from "@mashupkgrid/database";
import { redis } from "./redis.js";

const PERMISSION_CACHE_TTL_SECONDS = 5 * 60;

function cacheKey(tenantId: string | null, userId: string): string {
  return `tenant:${tenantId ?? "platform"}:user:${userId}:permissions`;
}

/**
 * Resolves a user's effective permissions, cached in Redis for 5 minutes
 * (docs/architecture/03-rbac-and-multitenancy.md, 07-...-cache.md). The cache is purely a
 * performance layer: on any Redis error (read or write) this falls through to the
 * authoritative Postgres resolution via `getEffectivePermissions` — never to an "allow all"
 * default — so a Redis outage degrades to slower-but-correct rather than either locking out
 * every user or silently widening access.
 */
export async function getCachedPermissions(
  userId: string,
  tenantId: string | null
): Promise<Set<string>> {
  const key = cacheKey(tenantId, userId);
  try {
    const cached = await redis.get(key);
    if (cached) return new Set(JSON.parse(cached) as string[]);
  } catch {
    // Redis unavailable — fall through to a direct DB resolution below.
  }

  const permissions = await getEffectivePermissions(userId, tenantId);
  try {
    await redis.set(key, JSON.stringify([...permissions]), "EX", PERMISSION_CACHE_TTL_SECONDS);
  } catch {
    // Best-effort cache write; a failure here does not affect correctness.
  }
  return permissions;
}

export async function invalidatePermissionCache(userId: string, tenantId: string | null): Promise<void> {
  try {
    await redis.del(cacheKey(tenantId, userId));
  } catch {
    // Best-effort invalidation; the short TTL bounds staleness even if this fails.
  }
}

/** Invalidates every user currently holding `roleId` — for a role-level permission change
 *  (attach/detach a permission on the role itself), rather than one user's role assignment
 *  changing. Without this, every holder of the role keeps their stale cached permission set for
 *  up to PERMISSION_CACHE_TTL_SECONDS after an admin grants/revokes a permission on their role. */
export async function invalidatePermissionCacheForRole(roleId: string): Promise<void> {
  const holders = await prisma.userRole.findMany({ where: { roleId }, select: { userId: true, tenantId: true } });
  await Promise.all(holders.map((h) => invalidatePermissionCache(h.userId, h.tenantId)));
}
