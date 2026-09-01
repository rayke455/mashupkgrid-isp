import { beforeEach, describe, expect, it, vi } from "vitest";

/** A router that is unreachable over its management API — the normal case for CPE behind NAT or
 *  CGNAT with no port forward, where the heartbeat is the only real liveness signal. */
const unreachableAdapter = {
  connect: async () => {
    throw new Error("ECONNREFUSED");
  },
  healthCheck: async () => ({ reachable: false }),
  disconnect: async () => {},
};

const routerRow: Record<string, unknown> = {};
const updates: Record<string, unknown>[] = [];

vi.mock("@mashupkgrid/database", () => ({
  prisma: {
    router: {
      findFirst: async () => routerRow,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return { ...routerRow, ...data };
      },
    },
  },
}));

vi.mock("@mashupkgrid/config", () => ({
  env: { ENCRYPTION_KEY: "x".repeat(64), WIREGUARD_INTERFACE: "wg0" },
  isProduction: false,
}));

vi.mock("../factory.js", () => ({ createAdapterForRouter: () => unreachableAdapter }));
vi.mock("../wireguard-peer.service.js", () => ({
  allocateNextVpnIp: () => "10.90.0.2",
  registerWireguardPeer: async () => {},
  removeWireguardPeer: async () => {},
}));

const { testRouterConnection } = await import("../router.service.js");

function setRouter(lastSeenMinutesAgo: number | null) {
  for (const k of Object.keys(routerRow)) delete routerRow[k];
  Object.assign(routerRow, {
    id: "r1",
    tenantId: "t1",
    name: "hAP",
    host: "203.0.113.10",
    vpnIp: null,
    apiPort: 8728,
    useTls: false,
    usernameEncrypted: "",
    passwordEncrypted: "",
    lastSeenAt: lastSeenMinutesAgo === null ? null : new Date(Date.now() - lastSeenMinutesAgo * 60_000),
    cpuLoadPercent: 5,
    uptimeSeconds: 100,
    memoryUsedBytes: null,
    memoryTotalBytes: null,
  });
}

beforeEach(() => {
  updates.length = 0;
});

describe("testRouterConnection liveness", () => {
  it("keeps a router ONLINE when the API is unreachable but a heartbeat arrived recently", async () => {
    setRouter(2);
    const health = await testRouterConnection("t1", "r1");
    expect(health.reachable).toBe(true);
    expect(updates.at(-1)?.status).toBe("ONLINE");
  });

  it("does NOT advance lastSeenAt when liveness was inferred rather than measured", async () => {
    // The regression this guards: the inferred branch READS lastSeenAt to decide the router is
    // alive. Writing it back makes the window self-refreshing, so a router that has been
    // physically unplugged reports ONLINE forever because poll-router-health keeps resetting
    // the very timestamp it is testing against.
    setRouter(2);
    await testRouterConnection("t1", "r1");
    expect(updates.at(-1)).not.toHaveProperty("lastSeenAt");
  });

  it("marks a router DOWN once its last heartbeat falls outside the liveness window", async () => {
    setRouter(30);
    const health = await testRouterConnection("t1", "r1");
    expect(health.reachable).toBe(false);
    expect(updates.at(-1)?.status).toBe("DOWN");
  });

  it("marks a router that has never checked in DOWN rather than assuming it is alive", async () => {
    setRouter(null);
    const health = await testRouterConnection("t1", "r1");
    expect(health.reachable).toBe(false);
    expect(updates.at(-1)?.status).toBe("DOWN");
  });
});
