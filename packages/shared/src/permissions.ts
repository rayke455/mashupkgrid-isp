/**
 * Single source of truth for the platform permission catalog. Both the database seed script
 * and the runtime RBAC authorization check import from here, so "permissions that exist" and
 * "permissions the seed created" can never drift apart.
 */
export const PERMISSIONS = [
  "customers.read",
  "customers.create",
  "customers.update",
  "customers.delete",

  "billing.read",
  "billing.create",
  "billing.update",

  "payments.read",
  "payments.create",
  "payments.refund",

  // Phase 2 — core ISP billing (docs/architecture/09-phase2-plan.md)
  "packages.read",
  "packages.manage",

  "customer_services.read",
  "customer_services.manage",

  "wallet.read",
  "wallet.manage",

  // Phase 3 — M-Pesa and payments (docs/architecture/10-phase3-plan.md)
  "payments.reconcile",

  "routers.read",
  "routers.manage",

  // VLAN management and automated network provisioning. Split three ways on purpose: a support
  // agent must be able to SEE network state and re-run a failed provisioning job without being
  // able to alter VLAN configuration, which is the distinction the spec draws between a support
  // agent and a network administrator.
  "vlans.read",
  "vlans.manage",
  "provisioning.retry",

  "radius.manage",

  "tickets.read",
  "tickets.manage",

  "reports.read",

  "staff.manage",

  "settings.manage",

  "maintenance.manage",

  // Phase 1 platform/tenant administration (not in the product brief's example list, but
  // required for the Phase 1 admin endpoints this build actually ships).
  "tenants.read",
  "tenants.create",
  "tenants.update",
  "tenants.suspend",

  // Platform subscription-plan catalog (super admin only — see the multi-tenant-domains plan's
  // Phase 3). Excluded from TENANT_SCOPED_PERMISSIONS below, same reasoning as tenants.*.
  "plans.manage",

  "roles.read",
  "roles.manage",

  "audit_logs.read",

  "sessions.manage_own",
  "sessions.manage_any",
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

/**
 * System role -> permission key mapping used by the seed script. SUPER_ADMIN is granted every
 * permission (computed, not hand-maintained) so it can never silently fall out of sync when a
 * new permission is added.
 */
/**
 * Every permission a *tenant*-scoped role is allowed to ever hold. `tenants.*` and
 * `maintenance.manage` are deliberately excluded: their routes (`/platform/tenants`,
 * `/platform/maintenance`) have no per-tenant filtering at all — maintenance mode is a single
 * global switch and the tenants endpoints list/edit every tenant on the platform — so granting
 * either to a tenant role would let one tenant's owner see other tenants or take the whole
 * platform down. Live end-to-end testing caught exactly this: `ISP_OWNER` was previously
 * defined as "every permission except tenants.create/tenants.suspend" (a deny-list), which
 * silently included `maintenance.manage` and let a single tenant's owner disable the platform
 * for every tenant. Tenant roles are now an explicit allow-list instead, so a newly added
 * platform-only permission is excluded by default rather than leaking in automatically.
 */
const TENANT_SCOPED_PERMISSIONS = [
  "customers.read",
  "customers.create",
  "customers.update",
  "customers.delete",
  "billing.read",
  "billing.create",
  "billing.update",
  "payments.read",
  "payments.create",
  "payments.refund",
  "payments.reconcile",
  "packages.read",
  "packages.manage",
  "customer_services.read",
  "customer_services.manage",
  "wallet.read",
  "wallet.manage",
  "routers.read",
  "routers.manage",
  "vlans.read",
  "vlans.manage",
  "provisioning.retry",
  "radius.manage",
  "tickets.read",
  "tickets.manage",
  "reports.read",
  "staff.manage",
  "settings.manage",
  "roles.read",
  "roles.manage",
  "audit_logs.read",
  "sessions.manage_own",
  "sessions.manage_any",
] as const satisfies readonly PermissionKey[];

export const SYSTEM_ROLE_PERMISSIONS: Record<string, readonly PermissionKey[]> = {
  SUPER_ADMIN: PERMISSIONS,
  // The tenant's top-level owner account — every tenant-scoped permission, nothing platform-wide.
  ISP_OWNER: TENANT_SCOPED_PERMISSIONS,
  ADMIN: [
    "customers.read",
    "customers.create",
    "customers.update",
    "billing.read",
    "billing.create",
    "billing.update",
    "payments.read",
    "payments.create",
    "payments.refund",
    "payments.reconcile",
    "packages.read",
    "packages.manage",
    "customer_services.read",
    "customer_services.manage",
    "wallet.read",
    "wallet.manage",
    "routers.read",
    "routers.manage",
    "vlans.read",
    "vlans.manage",
    "provisioning.retry",
    "radius.manage",
    "tickets.read",
    "tickets.manage",
    "reports.read",
    "staff.manage",
    "settings.manage",
    "roles.read",
    "audit_logs.read",
    "sessions.manage_own",
    "sessions.manage_any",
  ],
  FINANCE_MANAGER: [
    "billing.read",
    "billing.create",
    "billing.update",
    "payments.read",
    "payments.create",
    "payments.refund",
    "payments.reconcile",
    "packages.read",
    "customer_services.read",
    "wallet.read",
    "wallet.manage",
    "reports.read",
    "sessions.manage_own",
  ],
  NETWORK_ADMIN: [
    "routers.read",
    "routers.manage",
    "vlans.read",
    "vlans.manage",
    "provisioning.retry",
    "radius.manage",
    "customers.read",
    "customer_services.read",
    "reports.read",
    "sessions.manage_own",
  ],
  SUPPORT: [
    "customers.read",
    "customer_services.read",
    // Deliberately vlans.read + provisioning.retry WITHOUT vlans.manage: an agent can diagnose a
    // customer's network problem and re-run a failed job, but cannot alter VLAN configuration.
    "vlans.read",
    "provisioning.retry",
    "billing.read",
    "wallet.read",
    "tickets.read",
    "tickets.manage",
    "sessions.manage_own",
  ],
  SALES: [
    "customers.read",
    "customers.create",
    "packages.read",
    "customer_services.read",
    "customer_services.manage",
    "reports.read",
    "sessions.manage_own",
  ],
  ACCOUNTANT: [
    "billing.read",
    "payments.read",
    "packages.read",
    "wallet.read",
    "reports.read",
    "sessions.manage_own",
  ],
  TECHNICIAN: [
    "customers.read",
    "customer_services.read",
    "routers.read",
    "vlans.read",
    "sessions.manage_own",
  ],
  RESELLER: [
    "customers.read",
    "customers.create",
    "packages.read",
    "customer_services.read",
    "reports.read",
    "sessions.manage_own",
  ],
  // `packages.read` (browsing the tenant's rate-plan catalog) and `tickets.read` are the only
  // tenant-wide list permissions genuinely safe for a self-service customer: neither route
  // returns other customers' data. `billing.read`/`payments.read`/`customer_services.read`/
  // `wallet.read` are deliberately withheld — their routes (/invoices, /payments,
  // /subscriptions, /wallets/:customerId) are staff endpoints that return or accept *any*
  // customer's records with no "is this the caller's own" scoping. A live test confirmed a
  // self-registered account could see another customer's invoices/wallet through them.
  // Granting those permissions here without first building "my own records" customer-scoped
  // endpoints would be a real horizontal-privilege-escalation bug, not a future nice-to-have.
  CUSTOMER: ["packages.read", "tickets.read", "sessions.manage_own"],
  READ_ONLY: [
    "customers.read",
    "billing.read",
    "payments.read",
    "packages.read",
    "customer_services.read",
    "reports.read",
    "routers.read",
  ],
};

export const SYSTEM_ROLE_NAMES = Object.keys(SYSTEM_ROLE_PERMISSIONS);
