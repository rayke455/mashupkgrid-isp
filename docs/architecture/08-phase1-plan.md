# Phase 1 — Detailed Implementation Plan

Scope: monorepo + Docker, PostgreSQL + Prisma, Redis, authentication, email verification, RBAC,
multi-tenancy + isolation tests, error handling, request IDs, rate limiting, file storage
abstraction, search/filter helper, pagination/sorting helpers, caching, maintenance mode, audit
logs, and a basic admin dashboard shell that actually calls the real API (login, protected
route, view own sessions).

## Build order

1. **Repo tooling**: pnpm workspace, root TypeScript config (strict), ESLint/Prettier,
   `.env.example`, Docker Compose (postgres, redis).
2. **`packages/config`**: Zod-validated env loader, fails fast on boot.
3. **`packages/shared`**: `AppError` hierarchy, standard response envelope, request-id
   middleware helper, list-query (pagination/sorting/filtering) helpers, AES-256-GCM helper.
4. **`packages/database`**: Prisma schema for the Phase 1 entity set (`01-database-erd-and-schema.md`),
   migration, seed script (system roles + permission catalog + a demo tenant + super admin).
5. **`packages/auth`**: Argon2id hashing, token generation/hash helpers, session lifecycle
   functions, RBAC effective-permission resolver.
6. **`apps/api`**: Fastify app wired with the full middleware order; routes for
   register/login/logout/refresh/verify-email/resend-verification/forgot-password/reset-password/
   me/sessions; tenant CRUD (super admin only) to have something real to RBAC-protect; RBAC
   admin endpoints (roles, permissions, assigning roles); maintenance-mode admin endpoints;
   audit-log read endpoint; health checks.
7. **`apps/worker`**: BullMQ worker process + scheduler; `email` queue (console/SMTP transport
   depending on env, real nodemailer wiring — not a fake "sent" log); `apply-scheduled-maintenance`
   repeatable job; `cleanup-expired-tokens` job.
8. **`apps/web`**: Next.js app — login page, register page, verify-email page, admin shell
   (protected layout, calls `/me`, shows sessions list with revoke), maintenance-mode admin
   toggle screen, tenant list (super admin). Talks to `apps/api` only over HTTP.
9. **Tests**: auth unit tests (hashing, lockout math, token expiry), RBAC unit tests
   (permission resolution, escalation guard), tenant isolation integration tests (two tenants,
   cross-tenant access must fail), maintenance-mode middleware tests (each level's allow/deny
   matrix), rate-limit test, error-handler shape test.

## Explicit non-goals for Phase 1

Billing, payments, M-Pesa, MikroTik, RADIUS, PPPoE, hotspot, CRM/leads, tickets, installations,
inventory, expenses, accounting, resellers, reports, analytics beyond raw counts, automation
engine, webhooks/developer portal, white-label, customer map. These are designed in the other
architecture docs and built in Phases 2–7. Any dashboard tile for these areas is either omitted
or explicitly labeled unavailable — never a hard-coded placeholder number (project instruction
§78, §81).

## Definition of done, applied to Phase 1 features

Each Phase 1 feature (register, login, logout, refresh, verify-email, resend-verification,
forgot/reset password, sessions list/revoke, RBAC role/permission admin, tenant admin,
maintenance-mode admin, audit-log viewer) must have: a Prisma-backed persistence path, a
service-layer implementation with validation and error handling, server-side authorization,
an audit-log entry for sensitive actions, at least one automated test, and a real UI screen in
`apps/web` that calls the real endpoint (no mocked fetch, no hard-coded response).

## Risk checklist applied per feature (project instruction §"FINAL INSTRUCTION")

For every Phase 1 service method, before marking it done: Does this solve a real need for
Phase 1 (auth/RBAC/tenancy/maintenance/audit)? Can it fail safely (validation + try/catch +
typed error, no unhandled rejection)? Can it produce duplicate rows (token issuance, session
creation — guarded by unique constraints + idempotent job design)? Can Tenant A reach Tenant B
data (covered by the isolation test suite)? What happens if Redis is down (rate limiter and
permission cache must fail closed for security-sensitive checks, not open)? What happens during
maintenance (checked in the maintenance middleware tests)? How is it audited? How is it tested?
