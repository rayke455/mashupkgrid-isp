# MASHUPKGRID ISP — System Architecture Overview

## 1. What this is

MASHUPKGRID ISP is a multi-tenant SaaS platform for Internet Service Providers, covering
billing, CRM, network management (MikroTik/RADIUS/PPPoE/Hotspot), payments (M-Pesa and other
providers), support, operations, and analytics. This document set is the architecture baseline
required before any Phase 1 code is written (see project instruction, "FIRST TASK").

This build starts at **Phase 1 — Foundation** only. Phases 2–7 are designed for here but not
implemented yet. Every later phase builds on the primitives established in Phase 1:
tenant isolation, RBAC, auth, maintenance mode, audit logging, job queues, caching, and the
service/repository layering.

## 2. Monorepo layout

```
apps/
  web/        Next.js app — admin dashboard, customer portal, auth UI (Phase 1: admin shell + auth only)
  api/        Node.js REST API (Fastify) — all backend HTTP logic
  worker/     BullMQ background workers + scheduler (cron-style repeatable jobs)

packages/
  database/   Prisma schema, migrations, generated client, seed scripts
  auth/       Password hashing, session/token issuing & verification, RBAC permission engine
  shared/     Cross-cutting types, Zod schemas, error classes, constants, request-id/logger utils
  config/     Typed environment configuration loader (single source of truth for env vars)

  # Added in later phases, referenced now for the dependency map:
  billing/ payments/ radius/ mikrotik/ notifications/ monitoring/ accounting/ automation/ storage/ ui/

infrastructure/
  docker/       Dockerfiles for api/worker/web
  freeradius/   FreeRADIUS config (introduced Phase 4)
  nginx/        Reverse proxy config

docs/
  architecture/ This document set
  api/          OpenAPI docs (introduced once endpoints stabilize)
  deployment/   Deployment runbooks
  security/     Security policies, threat model notes
```

Why Fastify over Express for `apps/api`: native TypeScript-friendly schema validation hooks,
better throughput under load (matters at the 1M+ transaction scale target), and a plugin/
lifecycle model that maps cleanly onto the required middleware order (request id → security
headers → rate limit → auth → tenant resolution → maintenance check → authorization →
validation → controller).

## 3. Layered architecture (every module)

```
HTTP ROUTE (Fastify route + Zod schema)
      -> CONTROLLER (thin: parse, call service, shape response)
            -> SERVICE (business rules, transactions, orchestration)
                  -> REPOSITORY (Prisma queries, always tenant-scoped)
                        -> DATABASE (PostgreSQL)
```

Controllers never call Prisma directly. Services never see `req`/`res`. Repositories never
contain business rules. This is enforced by directory convention within each app/package
(`routes/`, `controllers/`, `services/`, `repositories/`).

## 4. Cross-cutting concerns established in Phase 1

- **Multi-tenancy**: see `03-multi-tenant.md`. Every tenant-owned Prisma model carries `tenantId`;
  the repository layer requires it on every query — there is no code path that queries a
  tenant-owned table without a tenant filter.
- **AuthN/AuthZ**: see `02-auth.md`, `04-rbac.md`.
- **Maintenance mode**: see `09-maintenance-mode.md`. Enforced in Fastify middleware, not in the
  frontend.
- **Audit logging**: every mutating service call for a sensitive action writes an `AuditLog` row
  in the same DB transaction as the mutation itself (not best-effort, not fire-and-forget).
- **Validation**: Zod schemas colocated with routes in `packages/shared` where reused, otherwise
  local to the route file.
- **Error handling**: `packages/shared` exports a typed `AppError` hierarchy and a Fastify error
  handler that maps it to the standard `{ success, error: { code, message, requestId } }` shape.
- **Rate limiting**: Redis-backed, keyed per route family (see `12-security.md`).
- **Caching**: Redis, tenant-namespaced keys (see `11-search-caching.md`).

## 5. Module dependency map (Phase 1 scope highlighted)

```
config  ->  (no deps; read first, fails fast on missing/invalid env)
  |
shared  ->  config
  |
database -> shared, config          [Prisma schema + client]
  |
auth    -> database, shared, config [hashing, sessions, RBAC checks]
  |
api     -> database, auth, shared, config
worker  -> database, auth, shared, config
web     -> shared, config (talks to api over HTTP only — never imports database/auth directly)
```

Rule: `web` never imports `packages/database` or `packages/auth` server code. It calls `api`
over HTTP/WS like any other client. This keeps router/DB credentials, hashing, and session
secrets out of the Next.js bundle entirely (see NEVER list, project instruction §78).

Later-phase packages (`billing`, `payments`, `radius`, `mikrotik`, ...) will depend on
`database`, `auth`, `shared`, `config` and be consumed by `api`/`worker` the same way.

## 6. Environments

Three deployable units share one Postgres + one Redis:

```
apps/api     -> stateless, horizontally scalable, behind nginx
apps/worker  -> BullMQ workers + a scheduler process (repeatable jobs)
apps/web     -> Next.js, SSR/edge where safe, calls apps/api
```

Local dev: Docker Compose brings up Postgres, Redis, api, worker, web (FreeRADIUS added in
Phase 4). See `13-deployment.md`.

## 7. Risks and dependencies called out before coding

- **Argon2 native bindings on Windows dev machines**: `argon2` npm package requires node-gyp/
  prebuilt binaries. Mitigated by using `@node-rs/argon2` (prebuilt N-API binaries, no native
  toolchain needed) — verified as part of Phase 1 setup.
- **Prisma + multi-tenancy**: Prisma has no native row-level tenant scoping. Mitigated with a
  repository-layer convention (every tenant-scoped repository method takes `tenantId` as a
  required first argument) plus integration tests that assert cross-tenant queries return
  nothing. True Postgres RLS is a hardening candidate for a later phase, not required for
  Phase 1 correctness.
- **BullMQ requires Redis**: worker package fails fast if `REDIS_URL` is unset — no silent
  no-op job processing.
- **Fastify vs Next.js API routes**: keeping `api` as its own Fastify app (rather than Next.js
  API routes) avoids coupling backend business logic to the frontend framework's lifecycle and
  keeps `worker` able to import the exact same services.
