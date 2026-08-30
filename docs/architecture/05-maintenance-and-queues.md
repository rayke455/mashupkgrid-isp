# Maintenance Mode Architecture (Phase 1) + Queue/Worker Architecture

## Maintenance mode — implemented in Phase 1

### Storage

`MaintenanceEvent` table (see `01-database-erd-and-schema.md`). Every change to maintenance
state inserts a **new row**; the current state is "the most recent row." This gives a free,
tamper-evident audit trail (project instruction §46) without a separate history table.

### Enforcement point

A Fastify `onRequest` hook, positioned per the required middleware order:

```
REQUEST ID -> SECURITY HEADERS -> RATE LIMIT -> AUTHENTICATION -> TENANT RESOLUTION
  -> MAINTENANCE CHECK -> AUTHORIZATION -> VALIDATION -> CONTROLLER
```

The hook loads current `MaintenanceEvent` state from a short-TTL Redis cache (invalidated
immediately on update, so toggling maintenance takes effect within one cache TTL window at
worst, and instantly for the admin who just changed it) and evaluates:

```
if (!maintenance.enabled) -> pass through
if (req.route is a payment callback/webhook route) -> allow if allowWebhooks/allowPayments
if (req.user has a role in maintenance.allowedRoles, e.g. SUPER_ADMIN) -> pass through
if (req.ip in maintenance.allowedIps) -> pass through
otherwise, by level:
  LEVEL 1: unreachable (enabled=false is level 1)
  LEVEL 2: reject customer-portal-tagged routes (route metadata `audience: "customer"`)
  LEVEL 3: reject routes tagged `audience: "public-api"`
  LEVEL 4: reject everything except routes tagged `audience: "maintenance-admin"`
  LEVEL 5: reject everything except an explicit emergency-admin allowlist, regardless of role
-> otherwise 503 { code: "MAINTENANCE_MODE", message, retryAfter: endAt }
```

Routes declare their `audience` tag at registration time (Fastify route config), so the
maintenance hook never has to special-case URL strings.

### Payment/webhook carve-out

Per project instruction §44/§45: payment callback and webhook routes are tagged
`audience: "system-critical"` and are evaluated against `allowPayments`/`allowWebhooks`
independently of the numeric level — a full maintenance lockdown does not silently drop a
legitimate M-Pesa callback unless an operator explicitly sets `allowPayments = false`.

### Scheduling

`startAt`/`endAt` on a `MaintenanceEvent` row let a scheduled window be created ahead of time.
A worker job (`apply-scheduled-maintenance`, runs every minute) flips `enabled` on/off at the
boundaries by inserting the corresponding state-change rows — manual override always remains
available (an admin action inserts a new row immediately, superseding the schedule).

### Bypass

Bypass is resolved entirely server-side from `req.user`'s roles against
`maintenance.allowedRoles` — there is no client-supplied flag that affects this decision.

### Audit logging

Every enable/disable/level-change/schedule action writes an `AuditLog` row
(`action: "maintenance.updated"`, `before`/`after` = prior/new `MaintenanceEvent` snapshot,
actor, IP, user agent) in the same transaction as the `MaintenanceEvent` insert.

## Queue and worker architecture (BullMQ + Redis)

```
apps/api    -> enqueues jobs (never processes them inline)
apps/worker -> BullMQ Worker processes per queue, + a repeatable-job scheduler
```

### Queues (Phase 1)

- `email` — verification emails, password reset emails (NORMAL)
- `maintenance` — `apply-scheduled-maintenance` repeatable job (CRITICAL — must keep running
  even under maintenance, since it's what turns maintenance off on schedule)
- `cleanup` — expired token/session pruning (NON-CRITICAL)

Later phases add `billing`, `payments`, `notifications`, `monitoring`, `reports`, `backups`
queues per the project instruction's job classification (§47/§48).

### Job contract

Every job handler receives a typed payload (Zod-validated at enqueue time), and every job run
is recorded in a `Job` table: id, queueName, status, attemptsMade, lastError, startedAt,
completedAt, durationMs. Handlers are written to be idempotent — re-processing the same payload
(BullMQ's at-least-once delivery, or a manual retry) must not double-send an email or
double-apply a state change. For email, idempotency is achieved by keying on
`(userId, tokenId)` and checking the token's `usedAt`/existing send record before dispatch.

### Maintenance-awareness of jobs

Per §48, jobs are classified `CRITICAL` / `NORMAL` / `NON-CRITICAL`. The worker checks current
maintenance level before running a `NORMAL`/`NON-CRITICAL` job at levels 4-5 (re-queues with
backoff instead of dropping); `CRITICAL` jobs always run regardless of maintenance state.
