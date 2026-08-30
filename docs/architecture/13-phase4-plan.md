# Phase 4 — Network: Scope Note

Full architecture already in `06-network-mikrotik-radius.md`. This pins down what actually gets
built now.

## Builds now

- **`packages/network`**: the `NetworkDeviceAdapter` interface, plus a real `MikroTikAdapter`
  implementing it over RouterOS's actual binary API protocol (word-length-prefixed sentences,
  TCP 8728 / TLS 8729, the post-6.43 plaintext login) — a genuine protocol client, not a REST
  wrapper or a mock. Every other vendor listed in the product brief gets a stub that throws
  `NotImplementedError`.
- **RADIUS provisioning** (`packages/radius`): writes the standard FreeRADIUS SQL schema
  (`radcheck`/`radreply`/`radacct`/`nas`, mapped to `RadiusUser`/`RadiusAttribute`/
  `RadiusSession`/`NAS` Prisma models) that a real FreeRADIUS instance reads via `rlm_sql` — we
  provision the rows, FreeRADIUS remains the actual AAA server on the wire. FreeRADIUS itself
  (the `infrastructure/freeradius` container + `rlm_sql` config) ships as real, runnable config,
  not just documentation, though it can't be exercised end-to-end in this sandbox without a
  physical/virtual MikroTik to originate Access-Requests.
- **IPAM**: `IPPool`/`IPAddress` models, allocate/release service, dual-stack (IPv4 + IPv6)
  from the start per project instruction §21.
- **PPPoE user lifecycle**: subscribing a customer to a package now provisions a RADIUS user
  (radcheck row) with credentials, in the same transaction as the subscription — mirroring how
  Phase 2's `subscribeCustomerToPackage` atomically creates the first invoice.
- **Hotspot vouchers**: generate single-use, time/data-limited voucher codes as RADIUS users.
- **Router management API**: add/edit/remove a router, test connection, health check (CPU,
  memory, uptime, interfaces) — real RouterOS API calls (`/system/resource/print`,
  `/interface/print`), encrypted-at-rest credentials, never sent to `apps/web`.
- **Automatic suspend/reactivate now actually suspends**: Phase 2's billing-cycle
  `suspendOverdueSubscriptions`/`reactivateClearedSubscriptions` jobs previously only flipped a
  database status. They now also disable/enable the customer's RADIUS user (and, when the
  router is reachable, call the adapter to kick any active session) — closing the gap Phase 2's
  own docs flagged: "does not yet cut network access."
- **Failure handling**: router-unreachable operations are marked `PENDING_SYNC` and retried by
  a worker job rather than silently failing or pretending the change applied — exactly as
  documented in `06-network-mikrotik-radius.md`'s "Failure mode: router offline" section.

## Explicitly deferred

SNMP monitoring, network topology mapping, and outage/incident detection are Phase 6.
Bandwidth-usage time series (the genuinely high-volume `RadiusSession` accounting data is
modeled and partitioned now, but a dashboard/reporting layer over it is Phase 6). Cambium/
Ubiquiti/other vendor adapters are not implemented — calling one throws, and the UI marks them
"not yet available," never fakes success. Actual physical/virtual MikroTik hardware isn't
available in this environment, so the RouterOS client is verified by protocol-level unit tests
(sentence encoding/decoding) rather than a live device — documented as a real verification gap,
same posture as Phase 3's M-Pesa sandbox limitation.
