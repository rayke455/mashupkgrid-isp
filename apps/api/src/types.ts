/**
 * Route audience tags drive the maintenance-mode middleware (docs/architecture/05). Phase 1
 * has no separate "developer/public API" surface distinct from the public auth endpoints, so
 * LEVEL 2 and LEVEL 3 currently behave the same (both block "public"/"customer"); that
 * distinction becomes meaningful once Phase 7 ships a real public API surface.
 */
export type RouteAudience = "public" | "customer" | "staff" | "platform" | "system-critical";

/**
 * Governs the granular `MaintenanceEvent.allow*` flags (docs/architecture/05, §44): if the
 * matching flag is `true`, the route bypasses the level-based block entirely, regardless of
 * `audience`. A route with no category is governed purely by `audience`/`level`. Payment
 * *callbacks* (the M-Pesa webhook routes) are tagged `audience: "system-critical"` instead —
 * an unconditional bypass, since dropping a callback for an already-completed transaction is a
 * data-loss risk "never ignore legitimate external payment callbacks" (project instruction
 * §44) — `maintenanceCategory: "payment"` is for payment-*initiating* actions instead (staff
 * recording a manual payment, launching an STK push), which are a deliberate administrative
 * action reasonable to gate.
 */
export type MaintenanceCategory = "login" | "payment";

export interface AuthenticatedUser {
  id: string;
  tenantId: string | null;
  sessionId: string;
  /** Set only when this request was authenticated via a tenant API key (see
   *  plugins/authenticate.ts) with a non-empty `scopes` list — `requirePermission` additionally
   *  requires the checked permission to appear here, so a scoped key can never exceed what it was
   *  issued for even if the creating user's own role later gains more permissions. `undefined`
   *  for session-authenticated requests and for API keys created with no scope restriction. */
  apiKeyScopes?: string[] | null;
}

export interface TenantContext {
  id: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED" | "CANCELLED";
  /** White-label branding, exposed here so `/auth/me` can hand it straight to the frontend
   *  without a second round trip — safe to include on every authenticated request, neither
   *  field is sensitive. */
  brandColor: string | null;
  logoUrl: string | null;
  /** Feature keys (packages/shared's TENANT_FEATURES) a super admin has turned off for this
   *  tenant — see plugins/require-feature.ts for the gate that reads this. */
  disabledFeatures: string[];
  /** Null once a super admin has cleared it (paid/exempt) or for a tenant created before trials
   *  existed — the dashboard's trial countdown banner simply doesn't render in that case. */
  trialEndsAt: string | null;
  /** Feature keys included in the tenant's current TenantPlan — null when the tenant has no
   *  subscription row (unrestricted, back-compat fallback). requireFeature checks this alongside
   *  disabledFeatures; either can block a feature. */
  planFeatures: string[] | null;
}

declare module "fastify" {
  interface FastifyContextConfig {
    audience?: RouteAudience;
    maintenanceCategory?: MaintenanceCategory;
    /** Set true for routes that should not be subject to Redis-backed rate limiting bucketing
     *  beyond the global default (used sparingly — most routes should be rate limited). */
    skipRateLimit?: boolean;
  }

  interface FastifyRequest {
    user?: AuthenticatedUser;
    tenantCtx?: TenantContext | null;
    /** The exact bytes of a JSON request body, captured before parsing — see
     *  plugins/raw-body.ts. Needed anywhere a webhook signature is computed over the raw body
     *  (Paystack's HMAC-SHA512), since re-serializing the parsed object rarely byte-matches
     *  what the sender signed. Undefined for non-JSON or bodyless requests. */
    rawBody?: string;
  }
}
