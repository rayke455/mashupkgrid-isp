# Database ERD and PostgreSQL Schema Plan

PostgreSQL + Prisma. UUIDs (`gen_random_uuid()`, `pgcrypto`/native `uuid` in PG13+) as primary
keys for every table except pure join tables where a composite key is clearer. All tenant-owned
tables carry `tenantId`. All tables carry `createdAt`/`updatedAt`; mutable business entities
(`Customer`, `Invoice`, `Payment`, `Router`, ...) carry `deletedAt` for soft deletion.

## Phase 1 entities (implemented now)

```
Tenant
  id, name, slug (unique), status (ACTIVE|SUSPENDED|CANCELLED), planTier,
  timezone, currency, createdAt, updatedAt, deletedAt

User
  id, tenantId? (null for SUPER_ADMIN), email (unique per tenant), phone?,
  passwordHash, emailVerifiedAt?, status (ACTIVE|SUSPENDED|LOCKED|PENDING_VERIFICATION),
  failedLoginCount, lockedUntil?, lastLoginAt?, createdAt, updatedAt, deletedAt

Role
  id, tenantId? (null = system role template, e.g. SUPER_ADMIN/ISP_OWNER/...),
  name, isSystem, createdAt, updatedAt

Permission
  id, key (unique, e.g. "customers.read"), description

RolePermission
  roleId, permissionId   (composite PK)

UserRole
  userId, roleId, tenantId  (composite PK) — a user can hold a role only within one tenant scope

Session
  id, userId, tenantId?, refreshTokenHash, userAgent, ipAddress,
  createdAt, expiresAt, revokedAt?, lastUsedAt

EmailVerificationToken
  id, userId, tokenHash (unique), expiresAt, usedAt?, createdAt

PasswordResetToken
  id, userId, tokenHash (unique), expiresAt, usedAt?, createdAt

LoginAttempt
  id, userId?, email, tenantId?, ipAddress, userAgent, success,
  failureReason?, createdAt
  -- indexed by (email, createdAt) and (ipAddress, createdAt) for rate-limit/lockout queries

AuditLog
  id, tenantId?, actorUserId?, action, resourceType, resourceId?,
  before? (jsonb), after? (jsonb), ipAddress?, userAgent?, createdAt
  -- indexed by (tenantId, createdAt), (resourceType, resourceId)

MaintenanceEvent
  id, enabled, level (1-5), message?, startAt?, endAt?,
  allowLogin, allowCustomerPortal, allowPayments, allowWebhooks, allowApi,
  allowedRoles (text[]), allowedIps (text[]),
  updatedBy, updatedAt, createdAt
  -- singleton-ish: latest row by createdAt is authoritative "current state";
  -- every change is a new row so history is a first-class audit trail

ApiKey
  id, tenantId, name, keyPrefix, keyHash, scopes (text[]),
  rateLimitPerMinute, lastUsedAt?, revokedAt?, createdAt
  -- introduced in Phase 1 schema (used from Phase 7) so the shape doesn't churn later
```

## Full target ERD (all phases — documented now, built incrementally)

```
Tenant 1---* User
Tenant 1---* Branch
Tenant 1---* Role (tenant-custom roles; system roles have tenantId = null)
Role *---* Permission (via RolePermission)
User *---* Role (via UserRole, scoped by tenantId)

Tenant 1---* Customer
Customer 1---* CustomerService (a customer can hold multiple active services/packages)
CustomerService *---1 Package
CustomerService *---1 Router / NAS
CustomerService 1---1 RadiusUser
CustomerService 1---* IPAddress (assigned)

Tenant 1---* Package
Tenant 1---* Invoice
Invoice 1---* InvoiceItem
Invoice 1---* Payment
Payment *---1 PaymentProvider (enum-backed provider config per tenant)
Payment 1---1 Transaction (raw provider record + idempotency key)
Customer 1---1 Wallet
Payment 0---1 Refund
Invoice 0---* CreditNote / DebitNote

Tenant 1---* Router (MikroTik) 1---* NAS mapping
Router 1---* PPPoESession
Router 1---* HotspotVoucher
RadiusUser 1---* RadiusSession (RadAcct-shaped)
Tenant 1---* IPPool 1---* IPAddress

Tenant 1---* Ticket 1---* TicketMessage
Tenant 1---* Lead (CRM pipeline)
Tenant 1---* Installation *---1 Technician
Tenant 1---* InventoryItem 1---* InventoryTransaction
Tenant 1---* Expense
Tenant 1---* Reseller 1---* Commission
Tenant 1---* Notification / NotificationTemplate
Tenant 1---* Webhook 1---* WebhookDelivery
Tenant 1---* ApiKey
Tenant 1---* AutomationRule
Tenant 1---* Incident (outage) *---* NetworkDevice
Tenant 1---* File (polymorphic: ownerType/ownerId)
(global) Job — background job execution records, tenantId nullable for system jobs
```

## Indexing plan (Phase 1 tables)

- `User(tenantId, email)` unique composite (a SUPER_ADMIN with `tenantId = null` is unique on
  email globally via a partial unique index).
- `Session(userId)`, `Session(refreshTokenHash)` unique.
- `LoginAttempt(email, createdAt)`, `LoginAttempt(ipAddress, createdAt)` — both b-tree, support
  the lockout/rate-limit window queries (`WHERE createdAt > now() - interval`).
- `AuditLog(tenantId, createdAt DESC)`, `AuditLog(resourceType, resourceId)`.
- `UserRole(userId, tenantId)`, `RolePermission(roleId)`.

## Partitioning / high-volume tables (documented for later phases)

`RadiusSession`/`RadAcct`-equivalent and `BandwidthUsage` are designed from the start as
range-partitioned by month (`PARTITION BY RANGE (createdAt)`) since they are the tables
expected to reach hundreds of millions of rows. Not created in Phase 1 (no RADIUS yet), but the
partitioning strategy is decided now so Phase 4 doesn't require a redesign.

## Soft delete convention

Soft-deletable models get `deletedAt timestamptz null`. Repository read methods default to
`WHERE deletedAt IS NULL` and expose an explicit `includeDeleted` flag for admin/audit views.
Hard deletion is never exposed over the API for financial or audit-relevant records.
