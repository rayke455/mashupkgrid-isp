/**
 * Reserved subdomain/slug catalog — a tenant's `slug` (already unique, already DNS-safe via the
 * regex validated at creation) doubles as its platform subdomain (`{slug}.{PLATFORM_BASE_DOMAIN}`,
 * see packages/config). Blocking these here, at creation time, is what stops a tenant from ever
 * being created with a slug that would collide with the platform's own reserved namespace once
 * hostname-based routing exists — cheap to enforce now, expensive to untangle later.
 *
 * This is a real security boundary, not just tidiness. Every entry that infrastructure/caddy's
 * Caddyfile routes explicitly (`api`, `admin`, `app`, `wifi`, `portal`, `www`) resolves through
 * the same wildcard DNS record, and apps/api/src/plugins/security.ts's CORS check admits ANY
 * single-label subdomain of the platform domain as a trusted origin. A tenant that managed to
 * claim one of those would be handed a platform-looking, CORS-trusted address to phish from.
 */
export const RESERVED_SUBDOMAINS = [
  // Explicitly routed by the reverse proxy (infrastructure/caddy/Caddyfile).
  "admin",
  "api",
  "app",
  "captive",
  "portal",
  "wifi",
  "www",
  // Platform-namespace words a tenant must never be able to impersonate.
  "auth",
  "billing",
  "dashboard",
  "demo",
  "help",
  "hotspot",
  "isp",
  "mail",
  "radius",
  "status",
  "superadmin",
  "support",
  "system",
  "test",
  "vouchers",
] as const;

export function isReservedSubdomain(slug: string): boolean {
  return (RESERVED_SUBDOMAINS as readonly string[]).includes(slug.trim().toLowerCase());
}
