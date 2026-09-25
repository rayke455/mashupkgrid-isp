import net from "node:net";
import { prisma } from "@mashupkgrid/database";
import { ConflictError, ValidationError } from "@mashupkgrid/shared";

/**
 * Remote WinBox through the platform server.
 *
 * A router linked with the WireGuard section of its setup script is reachable from this server
 * at its tunnel address (Router.vpnIp, e.g. 10.90.0.7) — including routers behind carrier NAT,
 * because the router dials out. Nobody else can reach that address. The relay gives each such
 * router one public TCP port on this server and pipes it, byte for byte, to the router's WinBox
 * service over the tunnel, so an operator connects WinBox to `server:port` from anywhere.
 *
 * A plain TCP relay rather than iptables DNAT: it needs no kernel forwarding, no firewall rules
 * managed from application code, works identically in development, and can refuse sources that
 * aren't on the allowlist before a single byte reaches the router.
 */

export const WINBOX_PORT = 8291;

export function parsePortRange(range: string): { start: number; end: number } {
  const match = /^(\d{2,5})-(\d{2,5})$/.exec(range.trim());
  const start = Number(match?.[1]);
  const end = Number(match?.[2]);
  if (!match || start < 1024 || end > 65535 || start > end) {
    throw new ValidationError(`Not a valid relay port range: "${range}" (expected e.g. 20000-20999)`);
  }
  return { start, end };
}

/** Lowest free port in the range. */
export function allocateRelayPort(range: string, usedPorts: number[]): number {
  const { start, end } = parsePortRange(range);
  const used = new Set(usedPorts);
  for (let port = start; port <= end; port++) if (!used.has(port)) return port;
  throw new ConflictError(`WinBox relay port range ${range} is exhausted`);
}

/** Gives a VPN-linked router its relay port (idempotent). Returns null for a router with no tunnel. */
export async function ensureWinboxRelayPort(routerId: string, range: string): Promise<number | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const router = await prisma.router.findUnique({ where: { id: routerId }, select: { vpnIp: true, winboxRelayPort: true, deletedAt: true } });
    if (!router || router.deletedAt || !router.vpnIp) return null;
    if (router.winboxRelayPort) return router.winboxRelayPort;
    const used = await prisma.router.findMany({ where: { winboxRelayPort: { not: null } }, select: { winboxRelayPort: true } });
    const port = allocateRelayPort(range, used.map((r) => r.winboxRelayPort!));
    try {
      // Conditional on still having no port, so two callers can't both assign one.
      const { count } = await prisma.router.updateMany({ where: { id: routerId, winboxRelayPort: null }, data: { winboxRelayPort: port } });
      if (count === 1) return port;
    } catch {
      // Another router took this port between the read and the write (unique index) — retry.
    }
  }
  throw new ConflictError("Could not assign a WinBox relay port — try again.");
}

// ---------------------------------------------------------------------------------------------
// Source allowlist
// ---------------------------------------------------------------------------------------------

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return null;
  return parts.reduce((acc, p) => (acc << 8) + Number(p), 0) >>> 0;
}

/** Parses "1.2.3.4, 10.0.0.0/8" into a matcher. An empty list allows every source. */
export function sourceMatcher(list: string): (address: string) => boolean {
  const entries = list
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [ip, bitsText] = entry.split("/");
      const base = ipv4ToInt(ip ?? "");
      const bits = bitsText === undefined ? 32 : Number(bitsText);
      if (base === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
        throw new ValidationError(`Not a valid IPv4 address or CIDR in WINBOX_RELAY_ALLOWED_SOURCES: "${entry}"`);
      }
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      return { network: (base & mask) >>> 0, mask };
    });
  if (entries.length === 0) return () => true;
  return (address) => {
    const ip = ipv4ToInt(address.replace(/^::ffff:/, ""));
    return ip !== null && entries.some((e) => ((ip & e.mask) >>> 0) === e.network);
  };
}

// ---------------------------------------------------------------------------------------------
// Relay
// ---------------------------------------------------------------------------------------------

export interface RelayTarget {
  port: number;
  host: string;
  label: string;
}

export interface WinboxRelayOptions {
  /** Called on every refresh; the relay opens, retargets and closes listeners to match. */
  loadTargets: () => Promise<RelayTarget[]>;
  allowedSources?: string;
  refreshMs?: number;
  /** Router-side port; overridable for tests. */
  targetPort?: number;
  bindHost?: string;
  log?: (message: string) => void;
}

export interface WinboxRelayHandle {
  refresh: () => Promise<void>;
  listening: () => number[];
  close: () => Promise<void>;
}

export function startWinboxRelay(options: WinboxRelayOptions): WinboxRelayHandle {
  const log = options.log ?? ((m: string) => console.log(`[winbox-relay] ${m}`));
  const allowed = sourceMatcher(options.allowedSources ?? "");
  const targetPort = options.targetPort ?? WINBOX_PORT;
  const listeners = new Map<number, { server: net.Server; target: RelayTarget }>();
  let stopped = false;

  const listen = (target: RelayTarget) => {
    const entry = { server: net.createServer(), target };
    entry.server.on("connection", (client) => {
      const current = entry.target;
      const source = client.remoteAddress ?? "unknown";
      if (!allowed(source)) {
        log(`refused ${source} on :${current.port} (not in WINBOX_RELAY_ALLOWED_SOURCES)`);
        client.on("error", () => {});
        client.resume(); // drain, so the close handshake can complete
        client.end();
        return;
      }
      const upstream = net.connect({ host: current.host, port: targetPort });
      upstream.setTimeout(10_000, () => upstream.destroy(new Error("router did not answer within 10s")));
      upstream.once("connect", () => upstream.setTimeout(0));
      client.pipe(upstream).pipe(client);
      const end = (err?: Error) => {
        if (err) log(`:${current.port} → ${current.label} (${current.host}): ${err.message}`);
        client.destroy();
        upstream.destroy();
      };
      client.on("error", end);
      upstream.on("error", end);
      client.on("close", () => upstream.destroy());
      upstream.on("close", () => client.destroy());
    });
    entry.server.on("error", (err) => log(`cannot listen on :${target.port}: ${err.message}`));
    entry.server.listen(target.port, options.bindHost ?? "0.0.0.0");
    listeners.set(target.port, entry);
  };

  const refresh = async () => {
    if (stopped) return;
    let targets: RelayTarget[];
    try {
      targets = await options.loadTargets();
    } catch (err) {
      log(`could not load routers: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    const wanted = new Map(targets.map((t) => [t.port, t]));
    for (const [port, entry] of listeners) {
      if (!wanted.has(port)) {
        entry.server.close();
        listeners.delete(port);
        log(`closed :${port} (${entry.target.label})`);
      }
    }
    for (const target of wanted.values()) {
      const existing = listeners.get(target.port);
      if (!existing) {
        listen(target);
        log(`:${target.port} → ${target.label} (${target.host}:${targetPort})`);
      } else if (existing.target.host !== target.host || existing.target.label !== target.label) {
        existing.target = target; // New connections go to the new address; open ones are left alone.
      }
    }
  };

  void refresh();
  const timer = setInterval(() => void refresh(), options.refreshMs ?? 30_000);

  return {
    refresh,
    listening: () => [...listeners.keys()].sort((a, b) => a - b),
    close: async () => {
      stopped = true;
      clearInterval(timer);
      await Promise.all([...listeners.values()].map((e) => new Promise<void>((resolve) => e.server.close(() => resolve()))));
      listeners.clear();
    },
  };
}

/** Relay targets from the database: every live router with a tunnel, giving ports to any that lack one. */
export async function loadWinboxRelayTargets(range: string): Promise<RelayTarget[]> {
  const pending = await prisma.router.findMany({
    where: { deletedAt: null, vpnIp: { not: null }, winboxRelayPort: null },
    select: { id: true },
  });
  for (const r of pending) await ensureWinboxRelayPort(r.id, range).catch(() => null);
  const routers = await prisma.router.findMany({
    where: { deletedAt: null, vpnIp: { not: null }, winboxRelayPort: { not: null } },
    select: { name: true, vpnIp: true, winboxRelayPort: true },
  });
  return routers.map((r) => ({ port: r.winboxRelayPort!, host: r.vpnIp!, label: r.name }));
}
