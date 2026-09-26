import { prisma } from "@mashupkgrid/database";
import { resolveTenantPreferences } from "@mashupkgrid/shared";

/**
 * Coverage: a place is covered when it is within the ISP's chosen distance of one of its
 * routers that has a location set. Only the distance and a site name leave this module, never
 * a router's coordinates.
 */

/** Great-circle distance in kilometres. */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface CoverageResult {
  /** Null when the ISP has no router locations, so nobody can say. */
  covered: boolean | null;
  distanceKm: number | null;
  nearestSite: string | null;
  radiusKm: number;
}

export function nearestSite(lat: number, lng: number, sites: { name: string; latitude: number; longitude: number }[], radiusKm: number): CoverageResult {
  let best: { name: string; km: number } | null = null;
  for (const s of sites) {
    const km = distanceKm(lat, lng, s.latitude, s.longitude);
    if (!best || km < best.km) best = { name: s.name, km };
  }
  if (!best) return { covered: null, distanceKm: null, nearestSite: null, radiusKm };
  return { covered: best.km <= radiusKm, distanceKm: Math.round(best.km * 10) / 10, nearestSite: best.name, radiusKm };
}

export async function checkCoverage(tenantId: string, lat: number, lng: number): Promise<CoverageResult> {
  const [tenant, routers] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { preferences: true } }),
    prisma.router.findMany({ where: { tenantId, deletedAt: null, latitude: { not: null }, longitude: { not: null } }, select: { name: true, siteName: true, latitude: true, longitude: true } }),
  ]);
  const { radiusKm } = resolveTenantPreferences(tenant.preferences).coverage;
  return nearestSite(
    lat,
    lng,
    routers.map((r) => ({ name: r.siteName ?? r.name, latitude: r.latitude!, longitude: r.longitude! })),
    radiusKm
  );
}
