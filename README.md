# MASHUPKGRID ISP

Enterprise ISP billing, network management, automation, and SaaS platform. This repository has
**Phase 1 — Foundation**, **Phase 2 — Core ISP Billing**, and **Phase 3 — M-Pesa and Payments**
implemented: authentication, RBAC, multi-tenancy, maintenance mode, audit logging, customers,
packages, subscriptions, invoices, manual + M-Pesa payments, wallets, and automated billing/
payment-reconciliation jobs.

Read `docs/architecture/` first — it's the full system design (database ERD, auth, RBAC,
multi-tenancy, billing/payments/M-Pesa, MikroTik/RADIUS, queues, maintenance mode, security,
deployment) and the Phase 1/2/3 implementation plans this codebase follows.

## What's implemented

**Phase 1 — Foundation:**
- Monorepo (pnpm workspaces): `apps/api` (Fastify), `apps/worker` (BullMQ), `apps/web`
  (Next.js), `packages/{config,shared,database,auth,billing,payments}`.
- Auth: register, email verification, login (with lockout), refresh-token rotation with
  stolen-token-reuse detection, logout, forgot/reset password, session listing/revocation.
- RBAC: system roles + tenant-custom roles, permission catalog, privilege-escalation guard,
  Redis-cached permission resolution.
- Multi-tenancy: tenant CRUD (super admin), tenant resolution middleware, suspended-tenant
  enforcement.
- Maintenance mode: 5 levels, role/IP bypass, scheduled on/off via the worker, audit trail.
- Audit logging, standard error envelope, request IDs, Redis-backed rate limiting, pagination/
  sorting/search helpers, AES-256-GCM encryption-at-rest helper.

**Phase 2 — Core ISP billing** (`packages/billing`, see `docs/architecture/09-phase2-plan.md`):
- Customers (profile, status lifecycle, tenant-scoped CRUD) and Packages (rate plans).
- Subscriptions (`CustomerService`): subscribing a customer to a package generates its first
  pro-rated invoice atomically.
- Billing engine: invoices with line items, integer minor-unit currency throughout, every
  mutation inside a single Prisma transaction.
- Wallets: per-customer balance backed by an append-only ledger.
- Payments: staff-recorded manual/cash/bank/wallet payments against an invoice or as a wallet
  top-up, idempotent on a client-supplied key, with refund/reversal support.
- Receipts, and reports (revenue-by-day, outstanding balance) computed from real rows.
- Automated worker jobs: generate renewal invoices, mark overdue, suspend overdue
  subscriptions, reactivate cleared ones — hourly, idempotent, hardcoded-number-free.
- Web UI: customers list/detail (subscribe, wallet top-up), packages, invoices list/detail
  (record payment), and real dashboard revenue/outstanding metrics for tenant accounts.

**Phase 3 — M-Pesa and payments** (`packages/payments`, see `docs/architecture/10-phase3-plan.md`):
- Real Safaricom Daraja API integration: OAuth token caching, STK Push (Lipa na M-Pesa Online),
  STK Push Query, C2B Validation + Confirmation — genuine HTTP calls to Safaricom's sandbox/
  production endpoints, not a mock.
- A payment is only ever marked complete by a verified callback or a server-initiated status
  query — never by the request that initiated it.
- Idempotent on `checkoutRequestId`/`mpesaReceiptNumber`/`TransID`: a duplicated or replayed
  callback can never create a second Payment.
- Per-tenant credentials, encrypted at rest, configured via the admin UI.
- C2B automatic reconciliation by bill reference number (invoice or customer number), with a
  manual-match admin screen for anything that doesn't auto-match.
- A worker job defensively polls any STK request still pending after 2 minutes (covers a lost/
  delayed callback) — and is honest about a real Daraja API limitation: the Query API alone
  can't supply a receipt number, so an unresolved "Safaricom says success but we have no
  receipt" case is surfaced for operator follow-up rather than silently guessed at.
- Payment confirmation emails on both STK and C2B success.
- Web UI: per-tenant M-Pesa credential form, a "Pay via M-Pesa" flow on the invoice page with
  live status polling, and a reconciliation screen for unmatched Paybill payments.
- Refunds are explicitly **not** automated (Safaricom's B2C reversal is a materially different,
  riskier flow) — the interface has a `refund()` method for a future gateway to implement, but
  M-Pesa's isn't wired up. No card/other gateway ships either.

Tests: **81 automated tests** across the workspace (`pnpm -r test`), all passing.

Everything past Phase 3 (MikroTik/RADIUS, CRM, tickets, inventory, etc.) is designed in
`docs/architecture/` but **not implemented** — there are no fake dashboard numbers or stubbed
integrations pretending otherwise.

## Environment note

This codebase was built and typechecked/tested in an environment without Docker, Postgres, or
Redis available, so **the database migration, seed script, and full login/billing/M-Pesa flow
have not been run end-to-end against a live database or Safaricom's sandbox**. Everything that
could be verified without live infra was: all packages typecheck (`pnpm -r typecheck`), all apps
build, and all 81 unit tests pass. Run the steps below in an environment with Docker (or local
Postgres/Redis) to complete verification before relying on this in production. M-Pesa
additionally needs a Safaricom Daraja sandbox account and an internet-reachable callback URL
(e.g. an ngrok tunnel) — see `APP_API_PUBLIC_URL` in `.env.example`.

## Getting started

1. **Copy environment config** and fill in secrets:
   ```bash
   cp .env.example .env
   # Generate secrets:
   openssl rand -hex 32   # -> JWT_ACCESS_SECRET
   openssl rand -hex 32   # -> JWT_REFRESH_PEPPER
   openssl rand -hex 32   # -> ENCRYPTION_KEY (must be exactly 64 hex chars)
   ```

2. **Start Postgres + Redis** (Docker):
   ```bash
   docker compose up -d postgres redis
   ```

3. **Install dependencies** (already done in this checkout):
   ```bash
   pnpm install
   ```

4. **Generate the Prisma client and run the initial migration**:
   ```bash
   pnpm db:generate
   pnpm db:migrate   # prisma migrate dev — creates prisma/migrations/<timestamp>_init
   ```
   After the first migration is generated, add the partial unique index that keeps
   super-admin (`tenantId IS NULL`) emails unique — Prisma's schema language can't express a
   partial index directly (see `docs/architecture/01-database-erd-and-schema.md`):
   ```sql
   CREATE UNIQUE INDEX users_email_platform_unique ON users (email) WHERE "tenantId" IS NULL;
   ```
   Add that as its own migration (`prisma migrate dev --create-only`, paste the SQL, then
   `prisma migrate dev` again) rather than hand-editing the generated one.

5. **Seed** system roles, the permission catalog, a super admin, a demo tenant, and two demo
   packages:
   ```bash
   pnpm db:seed
   ```
   Prints the generated super-admin and demo-tenant-owner credentials (override with
   `SEED_SUPER_ADMIN_PASSWORD` / `SEED_TENANT_OWNER_PASSWORD` env vars before seeding).

6. **Run everything**:
   ```bash
   pnpm dev:api      # http://localhost:4000
   pnpm dev:worker
   pnpm dev:web      # http://localhost:3000
   ```
   Or via Docker Compose: `docker compose up -d`.

7. **Verify**:
   ```bash
   pnpm -r typecheck
   pnpm -r test
   curl http://localhost:4000/health/ready
   ```

## Repository layout

See `docs/architecture/00-overview.md` §2 for the full monorepo layout and dependency map.
