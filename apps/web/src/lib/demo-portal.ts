export function isDemoPortalEnabled(): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  const explicitFlag = process.env.NEXT_PUBLIC_ENABLE_DEMO_PORTAL;
  if (explicitFlag !== undefined) {
    return explicitFlag === "true";
  }

  return true;
}

export function getDemoTenantSlug(): string | null {
  if (!isDemoPortalEnabled()) {
    return null;
  }

  return process.env.NEXT_PUBLIC_DEMO_TENANT_SLUG || "demo-isp";
}
