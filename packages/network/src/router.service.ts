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

export interface RouterHeartbeatMetrics {
  cpuLoadPercent?: number;
  uptimeSeconds?: number;
  memoryUsedBytes?: bigint;
  memoryTotalBytes?: bigint;
}

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

/** Pre-allocates or returns the reserved WireGuard tunnel IP for a router */
export async function ensureRouterVpnIp(routerId: string): Promise<string> {
  const router = await prisma.router.findUnique({ where: { id: routerId } });
  if (!router) throw new NotFoundError("Router");
  if (router.vpnIp) return router.vpnIp;

  const vpnIp = await prisma.$transaction(async (tx) => {
    const existing = await tx.router.findUnique({ where: { id: routerId } });
    if (existing?.vpnIp) return existing.vpnIp;
    const inUse = await tx.router.findMany({
      where: { vpnIp: { not: null }, id: { not: routerId } },
      select: { vpnIp: true },
    });
    const candidate = allocateNextVpnIp(env.WIREGUARD_SUBNET_CIDR, inUse.map((r) => r.vpnIp!));
    await tx.router.update({ where: { id: routerId }, data: { vpnIp: candidate } });
    return candidate;
  });

  return vpnIp;
}

/** Completes provisioning for the router that owns `provisionToken`: records the address the
 *  callback actually arrived from as its `host`, and if a WireGuard public key is provided,
 *  registers the peer and sets the tunnel IP as `host` automatically. */
/** Registers this router as a RADIUS NAS at the address its packets actually come FROM.
 *
 *  The embedded RADIUS server (packages/radius/src/radius-server.ts, getNasSecret) authorizes a
 *  NAS purely by the UDP source address of the incoming Access-Request, looking it up as
 *  RadiusNas.nasname. With no matching row it logs a warning and returns WITHOUT replying at
 *  all — and a MikroTik with no RADIUS reply leaves the login attempt pending, which the user
 *  sees on the captive portal as "Already authorizing, retry later". So a router that is
 *  otherwise perfectly provisioned can never authenticate anyone until this row exists.
 *
 *  `sourceAddress` is the address this callback arrived from, NOT router.host: when remote
 *  access is on, host becomes the WireGuard tunnel IP, but the router still sends RADIUS out
 *  its WAN to the platform's public address, so the packets keep arriving from the public IP.
 *  Registering the tunnel IP here would look right and still drop every Access-Request.
 *
 *  The secret is the router's own generated password because that is exactly what
 *  buildMikrotikProvisioningScript embeds as the RADIUS shared secret (its `radiusSecret`
 *  defaults to `credentials.password`) — the two must not drift apart.
 *
 *  Re-run on every heartbeat rather than once at provisioning, so a router on a dynamic or
 *  CGNAT address re-registers itself within a minute of its address changing instead of
 *  silently losing hotspot auth. */
async function syncRadiusNasRegistration(router: Router, sourceAddress: string): Promise<void> {
  const secret = decryptAtRest(router.passwordEncrypted, env.ENCRYPTION_KEY);
  const existing = await prisma.radiusNas.findFirst({ where: { routerId: router.id } });

  if (existing && existing.nasname === sourceAddress && existing.secret === secret) return;

  // `nasname` is globally unique (one source IP can only mean one NAS). A row already holding
  // this address that belongs to a DIFFERENT router is not ours to take — two routers sharing
  // one public address is unsupportable under source-IP-keyed auth, and stealing the row would
  // silently break whichever one lost the race. Leave it and make the reason visible instead.
  const conflict = await prisma.radiusNas.findFirst({ where: { nasname: sourceAddress } });
  if (conflict && conflict.routerId && conflict.routerId !== router.id) {
    console.warn(
      `[radius] Cannot register router ${router.id} at ${sourceAddress}: already registered to router ${conflict.routerId}. ` +
        `Both routers appear to share one public address — hotspot/PPPoE auth cannot work for both.`
    );
    return;
  }
  if (conflict) await prisma.radiusNas.delete({ where: { id: conflict.id } });

  if (existing) {
    await prisma.radiusNas.update({
      where: { id: existing.id },
      data: { nasname: sourceAddress, secret, shortname: router.name.slice(0, 32) },
    });
    return;
  }

  await prisma.radiusNas.create({
    data: {
      tenantId: router.tenantId,
      routerId: router.id,
      nasname: sourceAddress,
      shortname: router.name.slice(0, 32),
      type: "mikrotik",
      secret,
    },
  });
}

export async function completeRouterProvisioning(
  provisionToken: string,
  remoteHost: string,
  wgPublicKey?: string,
  metrics?: RouterHeartbeatMetrics
): Promise<Router> {
  const router = await prisma.router.findFirst({
    where: { provisionTokenHash: hashToken(provisionToken), deletedAt: null },
  });
  if (!router) throw new NotFoundError("Provisioning token");

  const cleanWgKey = wgPublicKey ? wgPublicKey.replace(/["'\r\n]/g, "").trim().replace(/ /g, "+") : "";

  const updateData: Record<string, unknown> = {
    status: "ONLINE",
    lastSeenAt: new Date(),
    lastError: null,
    provisionedAt: router.provisionedAt ?? new Date(),
  };

  if (metrics?.cpuLoadPercent !== undefined) updateData.cpuLoadPercent = metrics.cpuLoadPercent;
  if (metrics?.uptimeSeconds !== undefined) updateData.uptimeSeconds = metrics.uptimeSeconds;
  if (metrics?.memoryUsedBytes !== undefined) updateData.memoryUsedBytes = metrics.memoryUsedBytes;
  if (metrics?.memoryTotalBytes !== undefined) updateData.memoryTotalBytes = metrics.memoryTotalBytes;

  // Always keyed to the WAN source address, in both the tunnel and no-tunnel paths below.
  try {
    await syncRadiusNasRegistration(router, remoteHost);
  } catch (err) {
    // A provisioning callback that reached us must still mark the router online; a NAS-sync
    // failure degrades hotspot auth but is not a reason to drop the heartbeat entirely.
    console.warn("RADIUS NAS registration warning on provisioning:", err);
  }

  if (cleanWgKey) {
    const vpnIp = router.vpnIp || (await ensureRouterVpnIp(router.id));
    try {
      await registerWireguardPeer(env.WIREGUARD_INTERFACE, cleanWgKey, vpnIp);
    } catch (err) {
      console.warn("WireGuard peer registration warning on provisioning:", err);
    }

    return prisma.router.update({
      where: { id: router.id },
      data: {
        ...updateData,
        host: vpnIp,
        vpnIp,
        vpnPublicKey: cleanWgKey,
        vpnConfiguredAt: router.vpnConfiguredAt ?? new Date(),
      },
    });
  }

  return prisma.router.update({
    where: { id: router.id },
    data: {
      ...updateData,
      host: router.host || remoteHost,
    },
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
      status: "ONLINE",
      lastSeenAt: new Date(),
      lastError: null,
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

/** Re-adds every VPN-linked router as a peer on the platform's WireGuard interface, and reports
 *  how many were restored.
 *
 *  A WireGuard peer table lives only in the kernel's copy of the interface, so it is emptied
 *  every time that interface is recreated — which, now that the interface is brought up inside
 *  the API container, is *every deploy and every restart*. The routers themselves reconnect on
 *  their own (their side holds the tunnel open with persistent-keepalive), but the server would
 *  refuse them, so remote access to every router would silently go dead after a routine redeploy
 *  and only come back if someone re-ran the registration by hand. The durable record is
 *  Router.vpnPublicKey/vpnIp in Postgres; this replays it onto the fresh interface at boot.
 *
 *  Best-effort by design: a deployment with WireGuard switched off, or one where the interface
 *  isn't up yet, must not stop the API from starting. */
export async function syncWireguardPeersFromDatabase(): Promise<number> {
  if (!env.ENABLE_WIREGUARD_REMOTE_ACCESS) return 0;
  const linked = await prisma.router.findMany({
    where: { deletedAt: null, vpnPublicKey: { not: null }, vpnIp: { not: null } },
    select: { vpnPublicKey: true, vpnIp: true },
  });

  let restored = 0;
  for (const router of linked) {
    try {
      await registerWireguardPeer(env.WIREGUARD_INTERFACE, router.vpnPublicKey!, router.vpnIp!);
      restored++;
    } catch {
      // One unreachable peer shouldn't abort the rest of the replay.
    }
  }
  return restored;
}

export async function deleteRouter(tenantId: string, routerId: string): Promise<void> {
  const router = await getRouterOrThrow(tenantId, routerId);
  if (router.vpnPublicKey) {
    await removeWireguardPeer(env.WIREGUARD_INTERFACE, router.vpnPublicKey);
  }
  await prisma.router.update({ where: { id: routerId }, data: { deletedAt: new Date() } });
}

/** How long after its last heartbeat a router is still considered alive when the platform
 *  cannot open a management connection to it. Most routers sit behind NAT or CGNAT with no
 *  port forward, so an unreachable API says nothing about whether the router is up — the
 *  heartbeat is the real liveness signal. buildMikrotikProvisioningScript schedules that every
 *  minute, so this is ten missed beats before a router is called DOWN: long enough to ride out
 *  a flaky uplink, short enough that staff notice a dead site the same shift. */
const HEARTBEAT_LIVENESS_WINDOW_MS = 10 * 60 * 1000;

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
  // True when "reachable" was inferred from a recent heartbeat rather than an actual connection.
  // The distinction decides whether lastSeenAt may be advanced below — see the update call.
  let inferredFromHeartbeat = false;
  try {
    await adapter.connect();
    health = await adapter.healthCheck();
  } catch (err) {
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
        } else if (router.lastSeenAt && Date.now() - router.lastSeenAt.getTime() < HEARTBEAT_LIVENESS_WINDOW_MS) {
          inferredFromHeartbeat = true;
          health = {
            reachable: true,
            cpuLoadPercent: router.cpuLoadPercent ?? undefined,
            uptimeSeconds: router.uptimeSeconds ?? undefined,
            memoryUsedBytes: router.memoryUsedBytes ?? undefined,
            memoryTotalBytes: router.memoryTotalBytes ?? undefined,
          };
        } else {
          health = { reachable: false, error: err instanceof Error ? err.message : String(err) };
        }
      } catch {
        if (router.lastSeenAt && Date.now() - router.lastSeenAt.getTime() < HEARTBEAT_LIVENESS_WINDOW_MS) {
          inferredFromHeartbeat = true;
          health = {
            reachable: true,
            cpuLoadPercent: router.cpuLoadPercent ?? undefined,
            uptimeSeconds: router.uptimeSeconds ?? undefined,
            memoryUsedBytes: router.memoryUsedBytes ?? undefined,
            memoryTotalBytes: router.memoryTotalBytes ?? undefined,
          };
        } else {
          health = { reachable: false, error: err instanceof Error ? err.message : String(err) };
        }
      }
    } else if (router.lastSeenAt && Date.now() - router.lastSeenAt.getTime() < HEARTBEAT_LIVENESS_WINDOW_MS) {
      inferredFromHeartbeat = true;
      health = {
        reachable: true,
        cpuLoadPercent: router.cpuLoadPercent ?? undefined,
        uptimeSeconds: router.uptimeSeconds ?? undefined,
        memoryUsedBytes: router.memoryUsedBytes ?? undefined,
        memoryTotalBytes: router.memoryTotalBytes ?? undefined,
      };
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
      // Only a genuinely successful connection advances lastSeenAt. A real heartbeat writes it
      // itself (completeRouterProvisioning), so nothing is lost here — whereas advancing it on
      // an INFERRED result makes the liveness check self-refreshing: the branches above read
      // lastSeenAt to conclude the router is alive, and writing it back means the next poll
      // reads a timestamp this poll just set. With poll-router-health running every 20 seconds,
      // that window never expires and a router physically unplugged from the wall reports
      // ONLINE indefinitely. Confirmed live on a disconnected hAP.
      ...(health.reachable && !inferredFromHeartbeat ? { lastSeenAt: new Date() } : {}),
      lastError: health.error ?? null,
      cpuLoadPercent: health.cpuLoadPercent ?? router.cpuLoadPercent ?? null,
      memoryUsedBytes: health.memoryUsedBytes ?? router.memoryUsedBytes ?? null,
      memoryTotalBytes: health.memoryTotalBytes ?? router.memoryTotalBytes ?? null,
      uptimeSeconds: health.uptimeSeconds ?? router.uptimeSeconds ?? null,
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
