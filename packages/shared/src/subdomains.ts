/**
 * Reserved subdomain/slug catalog — a tenant's `slug` (already unique, already DNS-safe via the
 * regex validated at creation) doubles as its platform subdomain (`{slug}.{PLATFORM_BASE_DOMAIN}`,
 * see packages/config). Blocking these here, at creation time, is what stops a tenant from ever
 * being created with a slug that would collide with the platform's own reserved namespace once
 * hostname-based routing exists — cheap to enforce now, expensive to untangle later.
 */
export const RESERVED_SUBDOMAINS = [
  "admin",
  "api",
  "www",
  "mail",
  "support",
  "billing",
  "dashboard",
] as const;

export function isReservedSubdomain(slug: string): boolean {
  return (RESERVED_SUBDOMAINS as readonly string[]).includes(slug.toLowerCase());
}
