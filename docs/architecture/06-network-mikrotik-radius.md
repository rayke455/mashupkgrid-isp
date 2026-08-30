# MikroTik and RADIUS Architecture (Phase 4 design, documented now)

Not implemented in Phase 1. `packages/mikrotik` and `packages/radius` do not exist yet; this
document fixes the boundary so Phase 1's `Router`/`RadiusUser`-shaped tables (added in Phase 4,
not Phase 1) won't need a redesign.

## Network device adapter interface

```typescript
interface NetworkDeviceAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  healthCheck(): Promise<DeviceHealth>;
  getActiveSessions(): Promise<Session[]>;
  createUser(user: NetworkUserSpec): Promise<void>;
  updateUser(userId: string, patch: Partial<NetworkUserSpec>): Promise<void>;
  disableUser(userId: string): Promise<void>;
  enableUser(userId: string): Promise<void>;
  disconnectUser(userId: string): Promise<void>;
}
```

`packages/mikrotik` implements this over the RouterOS API (binary API on 8728/8729, TLS for
8729). Router credentials are stored encrypted at rest (AES-256-GCM, `ENCRYPTION_KEY`) in the
`Router` table and are never sent to `apps/web` — only `apps/api`/`apps/worker` decrypt them,
in-process, to open a connection. The frontend only ever sees router status/health summaries.

Only MikroTik ships as a real adapter initially. Other vendors listed in the product brief
(Ubiquiti, TP-Link, Huawei, ZTE, Cambium, Cisco, Juniper, OLT vendors) get `NetworkDeviceAdapter`
stubs that throw `NotImplementedError` and are surfaced in the UI as "not yet available" — never
silently pretending to work (project instruction §20/§78).

## RADIUS / AAA

Standard FreeRADIUS SQL schema (`radcheck`, `radreply`, `radacct`, `radgroupcheck`,
`radgroupreply`, `nas`) mapped into Prisma models (`RadiusUser`, `RadiusSession` = radacct
shape, `NAS`). FreeRADIUS is deployed as its own container (`infrastructure/freeradius`) reading
directly from the same PostgreSQL database via its `rlm_sql` module — the application writes
`RadiusUser`/`radcheck` rows; FreeRADIUS is the actual AAA server on the wire, not something we
reimplement.

```
PPPoE / Hotspot login on MikroTik
   -> RADIUS Access-Request to FreeRADIUS
   -> FreeRADIUS checks radcheck (via rlm_sql against our DB)
   -> Access-Accept/Reject (+ radreply attributes: rate limit, IP pool, session timeout)
   -> Accounting-Start/Interim/Stop -> radacct rows (our RadiusSession table)
```

`RadiusSession` (radacct-shaped) is the highest-volume table in the system and is
range-partitioned by month from day one of Phase 4 (see indexing note in
`01-database-erd-and-schema.md`).

## PPPoE / Hotspot / vouchers

Built on top of the adapter + RADIUS layers: PPPoE user lifecycle (create/suspend/reactivate)
writes both a `RadiusUser`/`radcheck` row (for AAA) and calls the MikroTik adapter (for
PPP profile/queue assignment) inside one service-layer transaction with compensating rollback
if the router call fails (network device calls are not part of the DB transaction itself, since
they're an external system — the service marks the change `PENDING_SYNC` and retries via a
worker job rather than pretending an unreachable router already applied the change).

## Failure mode: router offline

Every adapter call is wrapped with a timeout + circuit breaker per router. If a router is
unreachable: health checks mark it `DOWN`, dependent user-management operations are queued
(`PENDING_SYNC`) rather than silently failing, and outage detection (`Incident`) can use router
`DOWN` state plus network topology to compute affected customers (project instruction §24/§25).
