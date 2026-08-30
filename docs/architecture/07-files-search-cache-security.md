# File Upload, Search, Caching, and Security Architecture

## File upload (storage abstraction, implemented skeleton in Phase 1, full flows land with
## the modules that need attachments — tickets, KYC docs, installation photos)

```typescript
interface StorageAdapter {
  put(key: string, data: Buffer, meta: { mime: string; size: number }): Promise<void>;
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}
```

Phase 1 ships a local-disk `StorageAdapter` implementation behind this interface (dev/self-host
default) with S3-compatible (`@aws-sdk/client-s3`, works against S3/MinIO/R2) as the documented
production adapter, swappable via config — no code path assumes local disk.

Rules enforced server-side regardless of adapter: MIME sniffed from file bytes (not the
browser-supplied `Content-Type`), extension allowlist per upload category, max size per
category, filenames rewritten to a random storage key (`{tenantId}/{category}/{uuid}.{ext}`,
original name kept only as metadata), private-by-default with signed URLs, ownership/authorization
checked on every read. Malware scanning is wired as an optional adapter hook
(`scan(buffer): Promise<{clean: boolean}>`) — no scanner ships in Phase 1, and the hook is a
documented no-op (`{clean: true}` unconditionally) rather than a fake "scanned clean" claim; it
is disabled and clearly marked unavailable until a real scanning provider is configured.

## Search and filtering

Phase 1 has no user-facing searchable entities yet, so this documents the pattern later modules
follow: a shared `buildListQuery()` helper in `packages/shared` takes a whitelisted set of
filterable/sortable fields per resource, rejects any field not on the whitelist (never
interpolates a client-supplied column name into SQL/Prisma), and composes Prisma `where`
clauses for keyword (`contains`, case-insensitive), exact, and date-range filters, plus
page/limit and cursor pagination helpers shared across every list endpoint.

## Caching (Redis)

Namespacing: `tenant:{tenantId}:<resource>[:<id>]`, platform-level keys use `platform:<resource>`.
Phase 1 caches: per-user effective permission sets (`tenant:{tenantId}:user:{userId}:permissions`,
TTL 5m, invalidated on role/permission change), current maintenance state (`platform:maintenance`,
TTL 30s, invalidated immediately on write), and rate-limit counters (see Security below).
Financial/billing state is never cached in Phase 1 (nothing to cache yet); when billing lands,
the rule is: never cache anything that a stale read could turn into a double-charge or a wrong
balance shown to a customer — cache read-mostly reference data (packages, settings), not
mutable financial state.

## Security architecture

- **Transport**: HTTPS terminated at the reverse proxy (nginx) in all non-local environments;
  HSTS header set by the API.
- **Security headers**: `helmet`-equivalent Fastify plugin — CSP, X-Frame-Options,
  X-Content-Type-Options, Referrer-Policy — applied as the second middleware stage, before rate
  limiting, so even a rejected request gets safe headers.
- **CSRF**: API is token-based (Bearer access token, not ambient cookie auth for state-changing
  JSON requests) which sidesteps classic CSRF for the API itself; the refresh-token cookie is
  `httpOnly`, `secure`, `sameSite=strict`, scoped to `/auth/refresh` only, which is not a valid
  CSRF target on its own (no session side-effect from a bare GET/POST without the JSON body the
  browser can't forge cross-site with `sameSite=strict`).
- **XSS**: React/Next.js escapes by default; no `dangerouslySetInnerHTML` without explicit
  sanitization; CSP restricts inline scripts.
- **SQL injection**: Prisma parameterizes everything; the search/sort whitelist above is the one
  place raw field names could otherwise leak in, and it's closed by allowlist.
- **Rate limiting**: `@fastify/rate-limit` backed by the shared Redis instance, per-route-family
  buckets (login 5/15min, OTP 5/hr, register, password-reset, public API 100/min/key), returns
  429 with `Retry-After`.
- **Secrets**: all secrets via environment variables (`packages/config`), validated at boot
  (Zod schema — the process refuses to start with a missing/malformed secret rather than
  running with an undefined one), never committed (`.env.example` only, `.env*` gitignored).
- **Encryption at rest**: AES-256-GCM helper in `packages/shared` for any secret-shaped column
  (router credentials in later phases, TOTP secrets) using `ENCRYPTION_KEY`.
- **Audit logs**: see `03-rbac-and-multitenancy.md`/`00-overview.md` — every sensitive mutation.
- **Session/device security**: covered in `02-authentication.md`.

## Deployment architecture

```
                        +-------------+
 clients ---HTTPS---->  |    nginx    |  TLS termination, reverse proxy, static asset cache
                        +------+------+
                               |
                +--------------+--------------+
                |                              |
          apps/web (Next.js)             apps/api (Fastify)
                                                |
                          +---------------------+---------------------+
                          |                     |                     |
                    PostgreSQL              Redis (cache,       apps/worker
                    (Prisma)                queues, rate limit)  (BullMQ)
```

Docker Compose brings up `postgres`, `redis`, `api`, `worker`, `web` for local development
(`13-... ` is folded into this file's deployment section; FreeRADIUS/nginx containers are added
starting Phase 4 when there's an actual AAA workload to front). Each app has its own Dockerfile
under `infrastructure/docker`. Config is 100% environment-variable driven (`packages/config`),
so the same images run in any environment by changing env, never by changing code.
