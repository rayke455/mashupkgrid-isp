/**
 * Fixed catalog of features a super admin can turn off for a specific tenant (Tenant.disabledFeatures
 * — see the schema comment). Mirrors permissions.ts's role: a single source of truth both the
 * super-admin toggle UI and every gate check import from, so "features that exist" can never
 * drift from "features the UI shows a switch for."
 */
export const TENANT_FEATURES = [
  "AI_ASSISTANT",
  "LIVE_CHAT",
  "WIREGUARD_REMOTE_ACCESS",
  "HOTSPOT_VOUCHERS",
  "SUPPORT_TICKETS",
] as const;

export type TenantFeatureKey = (typeof TENANT_FEATURES)[number];

export const TENANT_FEATURE_LABELS: Record<TenantFeatureKey, string> = {
  AI_ASSISTANT: "AI Assistant (hotspot package management)",
  LIVE_CHAT: "Live Chat (Tawk.to widget)",
  WIREGUARD_REMOTE_ACCESS: "WireGuard Remote Router Access",
  HOTSPOT_VOUCHERS: "Hotspot Vouchers & Captive Portal",
  SUPPORT_TICKETS: "Support Tickets",
};

/** A tenant with no matching entry in `disabledFeatures` has the feature — the list is a
 *  disable-list, not an enable-list (see the Tenant.disabledFeatures schema comment for why). */
export function isFeatureEnabled(disabledFeatures: string[], feature: TenantFeatureKey): boolean {
  return !disabledFeatures.includes(feature);
}
