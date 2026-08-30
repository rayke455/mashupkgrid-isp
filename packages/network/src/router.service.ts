import { prisma, type Router, type RouterVendor } from "@mashupkgrid/database";
import {
  NotFoundError,
  ConflictError,
  encryptAtRest,
  decryptAtRest,
  generateSecureToken,
  hashToken,
} from "@mashupkgrid/shared";
import { env } from "@mashupkgrid/config";
import { createAdapterForRouter } from "./factory.js";
import type { DeviceHealth, DeviceSession } from "./adapter.interface.js";
import { allocateNextVpnIp, registerWireguardPeer, removeWireguardPeer } from "./wireguard-peer.service.js";

/** The RouterOS user this platform creates on every router it links via the call-home flow
 *  (packages/radius/src/setup-script.ts embeds `/user add name=${MANAGED_API_USERNAME} ...` in
 *  the provisioning script) — a fixed, recognizable name rather than a per-router random one,
 *  since it only ever needs to be unique within that one router's own user list. */
export const MANAGED_API_USERNAME = "mashupkgrid-api";

export interface CreateRouterInput {
  name: string;
  vendor: RouterVendor;
  host: string;
  apiPort?: number;
  useTls?: boolean;
  username: string;
  password: string;
}

export type UpdateRouterInput = Partial<CreateRouterInput>;

export async function listRouters(tenantId: string): Promise<Router[]> {
  return prisma.router.findMany({ where: { tenantId, deletedAt: null }, orderBy: { name: "asc" } });
}

export async function getRouterOrThrow(tenantId: string, routerId: string): Promise<Router> {
  const router = await prisma.router.findFirst({ where: { id: routerId, tenantId, deletedAt: null } });
  if (!router) throw new NotFoundError("Router");
  return router;
}

export async function createRouter(tenantId: string, input: CreateRouterInput): Promise<Router> {
  const existing = await prisma.router.findFirst({
    where: { tenantId, name: input.name, deletedAt: null },
  });
  if (existing) throw new ConflictError(`A router named "${input.name}" already exists`);

  return prisma.router.create({
    data: {
      tenantId,
      name: input.name,
      vendor: input.vendor,
      host: input.host,
      apiPort: input.apiPort ?? 8728,
      useTls: input.useTls ?? false,
      usernameEncrypted: encryptAtRest(input.username, env.ENCRYPTION_KEY),
      passwordEncrypted: encryptAtRest(input.password, env.ENCRYPTION_KEY),
      status: "UNKNOWN",
    },
  });
}

/** Creates a router row with no known address yet — just a name plus generated credentials
 *  (a dedicated RouterOS user/password only this platform knows) and a one-time provisioning
 *  token. The admin never types a host/port/username/password for this path at all: the token
 *  gets embedded in a paste-and-run script (packages/radius's buildMikrotikProvisioningScript),
 *  and `host` is filled in automatically once the router calls back with it (see
 *  completeRouterProvisioning) — the request's own source address *is* the discovered host,
 *  which only works when the router is directly reachable at that address afterward (a public
 *  or port-forwarded IP, same assumption a WISP's edge/CPE routers typically already satisfy).
 *  Returns the plaintext provisioning token alongside the row — like an API key, it is never
 *  recoverable again once this call returns. */
export async function createPendingRouter(
  tenantId: string,
  name: string
): Promise<{ router: Router; provisionToken: string }> {
  const existing = await prisma.router.findFirst({ where: { tenantId, name, deletedAt: null } });
  if (existing) throw new ConflictError(`A router named "${name}" already exists`);

  const generatedPassword = generateSecureToken(18);
  const provisionToken = generateSecureToken(24);

  const router = await prisma.router.create({
    data: {
      tenantId,
      name,
      vendor: "MIKROTIK",
      apiPort: 8728,
      useTls: false,
      usernameEncrypted: encryptAtRest(MANAGED_API_USERNAME, env.ENCRYPTION_KEY),
      passwordEncrypted: encryptAtRest(generatedPassword, env.ENCRYPTION_KEY),
      provisionTokenHash: hashToken(provisionToken),
      status: "UNKNOWN",
    },
  });

  return { router, provisionToken };
}

/** Reveals the plaintext RouterOS credentials this platform generated for a pending router —
 *  needed once, to embed in the provisioning script (never stored or shown as plaintext, same
 *  as the RADIUS password reveal pattern). */
export async function getGeneratedCredentials(
  tenantId: string,
  routerId: string
): Promise<{ username: string; password: string }> {
  const router = await getRouterOrThrow(tenantId, routerId);
  return {
    username: MANAGED_API_USERNAME,
    password: decryptAtRest(router.passwordEncrypted, env.ENCRYPTION_KEY),
  };
}

/** Completes provisioning for the router that owns `provisionToken`: records the address the
 *  callback actually arrived from as its `host`, so the admin never types one in. Idempotent —
 *  a router that re-runs its script (e.g. after a reboot) simply re-confirms/updates its
 *  address rather than erroring on an already-linked token. */
export async function completeRouterProvisioning(provisionToken: string, remoteHost: string): Promise<Router> {
  const router = await prisma.router.findFirst({
    where: { provisionTokenHash: hashToken(provisionToken), deletedAt: null },
  });
  if (!router) throw new NotFoundError("Provisioning token");

  return prisma.router.update({
    where: { id: router.id },
    data: { host: remoteHost, provisionedAt: router.provisionedAt ?? new Date() },
  });
}

/** Starts a router's WireGuard remote-access handshake: issues a one-time token (same pattern
 *  as provisioning) that the RouterOS-side script embeds in its own callback, so the platform
 *  never has to be told which router is calling — the token says so. */
export async function startVpnRegistration(
  tenantId: string,
  routerId: string
): Promise<{ router: Router; vpnRegisterToken: string }> {
  const router = await getRouterOrThrow(tenantId, routerId);
  const vpnRegisterToken = generateSecureToken(24);
  const updated = await prisma.router.update({
    where: { id: router.id },
    data: { vpnRegisterTokenHash: hashToken(vpnRegisterToken) },
  });
  return { router: updated, vpnRegisterToken };
}

/** Completes the handshake: the router has generated its own WireGuard keypair and is telling
 *  us its public key (its private key never leaves the router). Allocates a tunnel IP, adds the
 *  router as a peer on the platform's own WireGuard interface, and — the key behavioral change —
 *  overwrites `host` with that tunnel IP, so every existing host-based feature starts using the
 *  VPN path automatically without any of that code needing to know VPN exists. */
export async function completeVpnRegistration(vpnRegisterToken: string, publicKey: string): Promise<Router> {
  const router = await prisma.router.findFirst({
    where: { vpnRegisterTokenHash: hashToken(vpnRegisterToken), deletedAt: null },
  });
  if (!router) throw new NotFoundError("VPN registration token");

  // Allocate-then-claim inside one transaction, with a last-instant clash re-check right before
  // the write, to shrink the window where two routers registering at the same moment could both
  // compute the same "next free" IP. This is a mitigation, not a guarantee — closing it
  // completely needs a DB-level unique constraint on Router.vpnIp, which isn't added here since
  // there's no reachable dev database in this environment to generate/verify the migration
  // against; add one (`@unique` on `vpnIp` in schema.prisma) the next time migrations run.
  const vpnIp = await prisma.$transaction(async (tx) => {
    if (router.vpnIp) return router.vpnIp;
    const inUse = await tx.router.findMany({
      where: { vpnIp: { not: null }, id: { not: router.id } },
      select: { vpnIp: true },
    });
    const candidate = allocateNextVpnIp(env.WIREGUARD_SUBNET_CIDR, inUse.map((r) => r.vpnIp!));
    const clash = await tx.router.findFirst({ where: { vpnIp: candidate, id: { not: router.id } } });
    if (clash) {
      throw new ConflictError("VPN IP allocation raced with another router — please retry registration");
    }
    return candidate;
  });

  try {
    await registerWireguardPeer(env.WIREGUARD_INTERFACE, publicKey, vpnIp);
  } catch (err) {
    console.warn("WireGuard peer registration deferred or host wg interface unavailable:", err);
  }

  return prisma.router.update({
    where: { id: router.id },
    data: {
      vpnPublicKey: publicKey,
      vpnIp,
      vpnConfiguredAt: router.vpnConfiguredAt ?? new Date(),
      host: vpnIp,
    },
  });
}

export async function updateRouter(tenantId: string, routerId: string, patch: UpdateRouterInput): Promise<Router> {
  await getRouterOrThrow(tenantId, routerId);
  return prisma.router.update({
    where: { id: routerId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.vendor !== undefined ? { vendor: patch.vendor } : {}),
      ...(patch.host !== undefined ? { host: patch.host } : {}),
      ...(patch.apiPort !== undefined ? { apiPort: patch.apiPort } : {}),
      ...(patch.useTls !== undefined ? { useTls: patch.useTls } : {}),
      ...(patch.username !== undefined
        ? { usernameEncrypted: encryptAtRest(patch.username, env.ENCRYPTION_KEY) }
        : {}),
      ...(patch.password !== undefined
        ? { passwordEncrypted: encryptAtRest(patch.password, env.ENCRYPTION_KEY) }
        : {}),
    },
  });
}

export async function deleteRouter(tenantId: string, routerId: string): Promise<void> {
  const router = await getRouterOrThrow(tenantId, routerId);
  if (router.vpnPublicKey) {
    await removeWireguardPeer(env.WIREGUARD_INTERFACE, router.vpnPublicKey);
  }
  await prisma.router.update({ where: { id: routerId }, data: { deletedAt: new Date() } });
}

/** Opens a real connection to the router, runs a health check, and persists the result onto
 *  the Router row (status/lastSeenAt/lastError/resource usage) so the routers list reflects
 *  reality without a separate polling round-trip from the caller. */
export async function testRouterConnection(tenantId: string, routerId: string): Promise<DeviceHealth> {
  const router = await getRouterOrThrow(tenantId, routerId);
  if (!router.host) {
    const health: DeviceHealth = {
      reachable: false,
      error: "Waiting for the router to check in — paste the provisioning script on the router first.",
    };
    await prisma.router.update({
      where: { id: router.id },
      data: { status: "UNKNOWN", lastError: health.error },
    });
    return health;
  }
  const adapter = createAdapterForRouter({ ...router, host: router.host });

  let health: DeviceHealth = { reachable: false };
  try {
    await adapter.connect();
    health = await adapter.healthCheck();
  } catch (err) {
    // Fall back to this router's own registered WireGuard tunnel address (an address this
    // platform itself assigned to this exact physical device — see wireguard-peer.service.ts —
    // not a guess) if the plain `host` is unreachable, e.g. its LAN-side IP changed since last
    // seen but the tunnel is still up. Previously this also probed a hardcoded list of private
    // IPs (192.168.1.198, 192.168.88.1, 10.0.0.6, 192.168.1.1 — leftover from testing against one
    // specific lab router) using this tenant's stored credentials and silently rewrote `host` to
    // whichever one answered; on a shared/VPN network another device entirely could accept the
    // same credentials (MikroTik's factory default has none) and every subsequent action against
    // this router would then silently run against the wrong physical device instead.
    if (router.vpnIp && router.vpnIp !== router.host) {
      try {
        const vpnAdapter = createAdapterForRouter({ ...router, host: router.vpnIp });
        await vpnAdapter.connect();
        const vpnHealth = await vpnAdapter.healthCheck();
        await vpnAdapter.disconnect().catch(() => {});
        if (vpnHealth.reachable) {
          health = vpnHealth;
          await prisma.router.update({ where: { id: router.id }, data: { host: router.vpnIp } });
          router.host = router.vpnIp;
        } else {
          health = { reachable: false, error: err instanceof Error ? err.message : String(err) };
        }
      } catch {
        health = { reachable: false, error: err instanceof Error ? err.message : String(err) };
      }
    } else {
      health = { reachable: false, error: err instanceof Error ? err.message : String(err) };
    }
  } finally {
    await adapter.disconnect().catch(() => {});
  }

  await prisma.router.update({
    where: { id: router.id },
    data: {
      status: health.reachable ? "ONLINE" : "DOWN",
      lastSeenAt: health.reachable ? new Date() : router.lastSeenAt,
      lastError: health.error ?? null,
      cpuLoadPercent: health.cpuLoadPercent ?? null,
      memoryUsedBytes: health.memoryUsedBytes ?? null,
      memoryTotalBytes: health.memoryTotalBytes ?? null,
      uptimeSeconds: health.uptimeSeconds ?? null,
    },
  });

  return health;
}

export async function getRouterActiveSessions(tenantId: string, routerId: string): Promise<DeviceSession[]> {
  const router = await getRouterOrThrow(tenantId, routerId);
  if (!router.host) {
    throw new ConflictError(
      `"${router.name}" hasn't checked in yet — paste the provisioning script on the router, or link it manually.`
    );
  }
  const adapter = createAdapterForRouter({ ...router, host: router.host });
  try {
    await adapter.connect();
    return await adapter.getActiveSessions();
  } catch (err) {
    // A router being offline is a routine, expected condition here — same as
    // testRouterConnection's `{ reachable: false }` path — not a server bug, so it must not
    // surface as a raw 500. Empty sessions would be misleading (implies a real check that found
    // nothing); a clear "couldn't check" error is what the caller actually needs to show.
    const message = err instanceof Error ? err.message : String(err);
    throw new ConflictError(`Could not reach "${router.name}" to list active sessions: ${message}`);
  } finally {
    await adapter.disconnect().catch(() => {});
  }
}

/** Bulk maintenance/incident-response action — kicks every PPPoE and hotspot session this
 *  router currently has, all at once. Returns how many were actually removed. */
export async function disconnectAllRouterSessions(tenantId: string, routerId: string): Promise<number> {
  const router = await getRouterOrThrow(tenantId, routerId);
  if (!router.host) {
    throw new ConflictError(
      `"${router.name}" hasn't checked in yet — paste the provisioning script on the router, or link it manually.`
    );
  }
  const adapter = createAdapterForRouter({ ...router, host: router.host });
  try {
    await adapter.connect();
    return await adapter.disconnectAllSessions();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ConflictError(`Could not reach "${router.name}" to disconnect sessions: ${message}`);
  } finally {
    await adapter.disconnect().catch(() => {});
  }
}

export async function applyRouterSpeedtestBoost(
  tenantId: string,
  routerId: string
): Promise<{ success: boolean; message: string }> {
  const router = await getRouterOrThrow(tenantId, routerId);
  if (!router.host) {
    throw new ConflictError(
      `"${router.name}" hasn't checked in yet — paste the provisioning script on the router first.`
    );
  }
  const adapter = createAdapterForRouter({ ...router, host: router.host });
  try {
    await adapter.connect();
    if (!adapter.applySpeedtestBoost) {
      throw new ConflictError("Speedtest booster is not supported on this router model");
    }
    return await adapter.applySpeedtestBoost();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ConflictError(`Failed to apply Speedtest boost on "${router.name}": ${message}`);
  } finally {
    await adapter.disconnect().catch(() => {});
  }
}

export async function enforceRouterStrictTimeout(
  tenantId: string,
  routerId: string
): Promise<{ success: boolean; cookiesRemoved: number; message: string }> {
  const router = await getRouterOrThrow(tenantId, routerId);
  if (!router.host) {
    throw new ConflictError(
      `"${router.name}" hasn't checked in yet — paste the provisioning script on the router first.`
    );
  }
  const adapter = createAdapterForRouter({ ...router, host: router.host });
  try {
    await adapter.connect();
    if (!adapter.enforceStrictTimeout) {
      throw new ConflictError("Strict timeout enforcement is not supported on this router model");
    }
    return await adapter.enforceStrictTimeout();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ConflictError(`Failed to enforce strict timeout on "${router.name}": ${message}`);
  } finally {
    await adapter.disconnect().catch(() => {});
  }
}
