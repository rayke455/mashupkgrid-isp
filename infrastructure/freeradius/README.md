# FreeRADIUS integration

A real FreeRADIUS 3.2 instance, configured to authenticate/account against this app's own
Postgres database — not a mock, not a stand-in. `packages/radius` writes rows into
`nas`/`radcheck`/`radreply`/`radacct` (see `packages/database/prisma/schema.prisma`); FreeRADIUS
reads and writes those same tables via `rlm_sql`, and is the process a MikroTik router's PPPoE/
hotspot service actually sends `Access-Request`/`Accounting-Request` packets to.

## Why this works with almost no custom SQL

`nas`/`radcheck`/`radreply`/`radacct` were deliberately named and shaped (via Prisma's `@@map`)
to match FreeRADIUS's own stock Postgres schema, so `raddb/mods-available/sql` only needs to be a
connection block — the actual queries are FreeRADIUS's unmodified stock query set, included via
`$INCLUDE .../queries.conf`.

The one place our schema diverges from stock — every tenant-scoped table needs a `tenantId`, but
FreeRADIUS's stock `INSERT INTO radacct` has no idea a "tenant" exists — is handled by a Postgres
trigger (`packages/database/prisma/migrations/20260827112358_radacct_tenant_trigger/`) that
derives `tenantId` from the accounting row's `username`, checked against `radius_users` (a normal
PPPoE subscriber) and then `hotspot_vouchers` (a voucher's `code` doubles as its RADIUS
username). A username matching neither raises inside the trigger rather than writing an orphaned,
tenant-less accounting row — a session FreeRADIUS is accounting for that this app never actually
provisioned is a real anomaly, not something to paper over.

## Running it

```
cd infrastructure/freeradius
RADIUS_DB_PASSWORD=<same password as DATABASE_URL> docker compose up
```

Points `RADIUS_DB_HOST`/`PORT`/`NAME`/`USER` at the same Postgres instance the app itself uses
(defaults assume the same values as the repo-root `.env`'s `DATABASE_URL`). Add each router as a
`client` block in `raddb/clients.conf` (dynamic SQL-backed client loading is intentionally off —
see the comment in `raddb/mods-available/sql` — our `nas` table carries extra multi-tenancy
columns the stock `read_clients` query doesn't select).

## Known gap

This environment has no Docker available, so this config has never actually been brought up or
exercised against a live RADIUS client here — the RouterOS/RADIUS *application* code
(`packages/network`, `packages/radius`) is verified by protocol-level unit tests and live API
calls instead (see their test suites). This is the same documented posture as Phase 3's M-Pesa
sandbox limitation: real, deployable config, verified as far as this environment allows, not
verified end-to-end against real hardware.
