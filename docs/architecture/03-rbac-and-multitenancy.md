# RBAC Design + Multi-Tenant Design

## RBAC

### Data model

`Role`, `Permission`, `RolePermission` (many-to-many), `UserRole` (user ↔ role, scoped by
`tenantId`). System roles (`SUPER_ADMIN`, `ISP_OWNER`, `ADMIN`, `FINANCE_MANAGER`,
`NETWORK_ADMIN`, `SUPPORT`, `SALES`, `ACCOUNTANT`, `TECHNICIAN`, `RESELLER`, `CUSTOMER`,
`READ_ONLY`) are seeded with `tenantId = null`, `isSystem = true`, and a fixed permission set.
Tenants can create additional custom roles (`tenantId = <tenant>`, `isSystem = false`) built
from the same global `Permission` catalog.

### Permission keys

Dot-namespaced strings (`customers.read`, `billing.create`, `maintenance.manage`, ...), stored
once in the `Permission` table and seeded from a single source-of-truth list in
`packages/shared/src/permissions.ts` (kept dependency-free in `shared` rather than `auth` so
`packages/database`'s seed script can import it without creating a `database -> auth` cycle,
since `auth` itself depends on `database`) — the seed script and the runtime authorization
check both import from that list, so there is no drift between "permissions that exist" and
"permissions the seed created."

### Enforcement

```
requirePermission("customers.update")
  -> Fastify preHandler hook
  -> reads req.user (set by auth middleware) and req.tenant (set by tenant-resolution middleware)
  -> loads the user's effective permission set for req.tenant.id
     (UserRole -> Role -> RolePermission -> Permission, cached in Redis per
      tenant:{tenantId}:user:{userId}:permissions with short TTL, invalidated on role change)
  -> 403 AUTHORIZATION_DENIED if the key is missing from the set
```

This runs **after** tenant resolution and **before** the controller — authorization is always a
server-side gate, never a hidden frontend button (project instruction §6, §78). SUPER_ADMIN is
not a permission bypass hack; it is seeded with every permission key, so the same code path
authorizes it.

### Custom roles

A tenant admin with `staff.manage` + `settings.manage` can create a `Role` scoped to their
tenant and attach any subset of the global `Permission` catalog via `RolePermission`. Custom
roles cannot grant permissions the granting admin doesn't themselves hold (privilege escalation
guard, checked server-side at role-edit time).

## Multi-Tenant Design

### Hierarchy

```
SUPER_ADMIN (tenantId = null, platform operator)
   -> Tenant (an ISP)
        -> Branch (optional subdivision)
             -> Staff (User with UserRole scoped to that Tenant)
                  -> Customer
                       -> Network infrastructure (Router, RadiusUser, IPAddress, ...)
```

### Isolation strategy

Phase 1 uses **application-enforced row-level isolation**: every tenant-owned Prisma model has
a required `tenantId` column, and the repository layer's contract is that every query function
touching a tenant-owned table takes `tenantId` as its first parameter and includes it in the
`where` clause — there is no repository method that queries such a table without it. This is
verified by an integration test suite that seeds two tenants and asserts every list/get endpoint
returns zero rows / 404 when called with a different tenant's session (see
`13-phase1-plan.md`).

`SUPER_ADMIN` requests operate outside normal tenant resolution (they explicitly target a
`tenantId` via route/query param for support operations, which is itself audit-logged).

### Tenant resolution middleware

```
REQUEST
  -> AUTHENTICATION (resolves req.user from access token)
  -> TENANT RESOLUTION
       - staff/admin users: tenantId comes from the authenticated session (a user's
         UserRole rows are scoped to exactly one tenant in Phase 1 — cross-tenant staff
         accounts are not supported)
       - SUPER_ADMIN: tenantId comes from an explicit header/param, defaults to "none"
         (platform-level endpoints only)
  -> sets req.tenant = { id, slug, status } or null for SUPER_ADMIN platform routes
```

A suspended (`Tenant.status = SUSPENDED`) tenant's non-super-admin requests are rejected with a
distinct error code (`TENANT_SUSPENDED`) before reaching the controller.

### Why not Postgres RLS in Phase 1

Row-Level Security is a valid hardening layer but adds operational complexity (session
variables per connection, pooler compatibility with PgBouncer transaction mode). Phase 1 ships
with the repository-enforced convention plus tests; RLS is a documented candidate to layer on
top later without changing the application-level contract (the `tenantId`-first repository
convention is exactly what RLS session-variable-setting would wrap).

### Data isolated per tenant (Phase 1 scope)

`User` (via `UserRole`), `Session`, custom `Role`/`RolePermission`, `AuditLog`, `MaintenanceEvent`
overrides (global event is platform-wide; Phase 1 ships only the global maintenance singleton —
per-tenant maintenance is a later-phase extension of the same table shape), `ApiKey`.
Later phases extend this same convention to `Customer`, `Router`, `Package`, `Invoice`, etc.
