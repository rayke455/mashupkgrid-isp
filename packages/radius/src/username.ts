import { generateAlnumSecret } from "@mashupkgrid/shared";

/** RADIUS usernames are looked up purely by username (no tenant column in `radcheck`), so they
 *  must be globally unique — prefixing with the tenant slug keeps them human-readable while
 *  guaranteeing that. */
export function buildRadiusUsername(tenantSlug: string, customerNumber: string): string {
  return `${tenantSlug}-${customerNumber}`.toLowerCase();
}

/** A reasonably strong, RADIUS/PPP-safe random password (no characters that commonly cause
 *  quoting issues in router configs or RADIUS attribute values). */
export function generateRadiusPassword(): string {
  return generateAlnumSecret(12);
}
