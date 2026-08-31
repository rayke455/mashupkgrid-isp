import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

/**
 * Route-level tests for VLAN management.
 *
 * Two things are being pinned here, and they are different in kind.
 *
 * The first is the vlans.read / vlans.manage split from spec section 15: a support agent must be
 * able to SEE network configuration and be refused when they try to change it. That is an
 * authorization boundary, and the only place it exists is the route layer.
 *
 * The second is that a VLAN row is tenant-scoped. A VLAN is network configuration for one ISP;
 * one tenant reaching another's is the same class of bug as the captive-portal write that
 * shipped unauthenticated, and it is worth a test before rather than after.
 *
 * As in hotspot-config-auth.test.ts, only the data layer is faked. authenticate ->
 * resolveTenant -> checkMaintenance -> requirePermission all run for real against a genuinely
 * signed token.
 */

const h = vi.hoisted(() => ({
  prisma: {
    session: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    tenant: { findUnique: vi.fn() },
  },
  getCachedPermissions: vi.fn(),
  network: {
    listVlans: vi.fn().mockResolvedValue([]),
    getVlanOrThrow: vi.fn(),
    createVlan: vi.fn(),
    updateVlan: vi.fn(),
    deleteVlan: vi.fn().mockResolvedValue(undefined),
    setVlanEnabled: vi.fn(),
    getVlanOverview: vi.fn().mockResolvedValue({
      total: 0,
      enabled: 0,
      disabled: 0,
      byType: {},
      provisioningFailed: 0,
    }),
    listVlanCustomers: vi.fn().mockResolvedValue([]),
  },
  auditEntries: [] as Array<Record<string, unknown>>,
}));

vi.mock("@mashupkgrid/database", () => ({ prisma: h.prisma }));
vi.mock("../../lib/redis.js", () => ({ redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }));
vi.mock("../../lib/permission-cache.js", () => ({ getCachedPermissions: h.getCachedPermissions }));
vi.mock("../../lib/maintenance-state.js", () => ({
  getCurrentMaintenanceState: vi
    .fn()
    .mockResolvedValue({ enabled: false, level: 1, allowedIps: [], allowedRoles: [] }),
}));
// Captured rather than silenced: several assertions below are about WHAT gets audited, which the
// spec calls for explicitly (section 14 wants previous and new configuration recorded).
vi.mock("../../lib/audit.js", () => ({
  writeAuditLog: vi.fn(async (entry: Record<string, unknown>) => {
    h.auditEntries.push(entry);
  }),
}));
vi.mock("@mashupkgrid/network", async (importOriginal) => {
  // The pure helpers (tag validation, advisories) are the real ones — they are the spec's
  // validation rules and there is no value in asserting against a stub of them.
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...h.network };
});

import { signAccessToken } from "@mashupkgrid/auth";
import { registerErrorHandler } from "../../plugins/error-handler.js";
import { vlanRoutes } from "../vlans.js";

const TENANT = { id: "11111111-1111-1111-1111-111111111111", slug: "acme", name: "Acme Fibre" };
const SESSION_ID = "33333333-3333-3333-3333-333333333333";
const USER_ID = "44444444-4444-4444-4444-444444444444";
const VLAN_ID = "55555555-5555-5555-5555-555555555555";

const VLAN_ROW = {
  id: VLAN_ID,
  tenantId: TENANT.id,
  vlanTag: 20,
  name: "Home Internet",
  type: "CUSTOMER_INTERNET",
  routerId: null,
  isEnabled: true,
  provisioningStatus: "NOT_PROVISIONED",
};

async function token(): Promise<string> {
  return signAccessToken({ sub: USER_ID, tenantId: TENANT.id, sessionId: SESSION_ID, roles: [] });
}

const auth = async () => ({ authorization: `Bearer ${await token()}` });

describe("VLAN routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    registerErrorHandler(app);
    await app.register(vlanRoutes, { prefix: "/api/v1/vlans" });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    h.auditEntries.length = 0;
    h.prisma.session.findUnique.mockResolvedValue({
      id: SESSION_ID,
      userId: USER_ID,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    h.prisma.tenant.findUnique.mockResolvedValue({
      ...TENANT,
      status: "ACTIVE",
      deletedAt: null,
      brandColor: null,
      logoUrl: null,
      disabledFeatures: [] as string[],
      trialEndsAt: null,
      subscription: null,
    });
    h.getCachedPermissions.mockResolvedValue(new Set(["vlans.read", "vlans.manage"]));
    h.network.getVlanOrThrow.mockResolvedValue(VLAN_ROW);
    h.network.createVlan.mockResolvedValue(VLAN_ROW);
    h.network.updateVlan.mockResolvedValue({ ...VLAN_ROW, name: "Renamed" });
    h.network.setVlanEnabled.mockResolvedValue({ ...VLAN_ROW, isEnabled: false });
  });

  // --- authentication -----------------------------------------------------------------------

  it("refuses every VLAN route without a token", async () => {
    for (const [method, url] of [
      ["GET", "/api/v1/vlans"],
      ["GET", "/api/v1/vlans/overview"],
      ["POST", "/api/v1/vlans"],
      ["PATCH", `/api/v1/vlans/${VLAN_ID}`],
      ["DELETE", `/api/v1/vlans/${VLAN_ID}`],
    ] as const) {
      const res = await app.inject({ method: method as "GET", url, payload: {} });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
    expect(h.network.createVlan).not.toHaveBeenCalled();
  });

  // --- the read/manage split (spec section 15) ----------------------------------------------

  it("lets a read-only agent list VLANs", async () => {
    h.getCachedPermissions.mockResolvedValue(new Set(["vlans.read"]));
    const res = await app.inject({ method: "GET", url: "/api/v1/vlans", headers: await auth() });
    expect(res.statusCode).toBe(200);
  });

  it("refuses a read-only agent trying to CREATE a VLAN", async () => {
    h.getCachedPermissions.mockResolvedValue(new Set(["vlans.read"]));
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/vlans",
      headers: await auth(),
      payload: { vlanTag: 30, name: "Business" },
    });
    expect(res.statusCode).toBe(403);
    expect(h.network.createVlan).not.toHaveBeenCalled();
  });

  it("refuses a read-only agent trying to DELETE or DISABLE a VLAN", async () => {
    h.getCachedPermissions.mockResolvedValue(new Set(["vlans.read"]));
    const del = await app.inject({
      method: "DELETE",
      url: `/api/v1/vlans/${VLAN_ID}`,
      headers: await auth(),
    });
    const disable = await app.inject({
      method: "POST",
      url: `/api/v1/vlans/${VLAN_ID}/enabled`,
      headers: await auth(),
      payload: { isEnabled: false },
    });
    expect(del.statusCode).toBe(403);
    expect(disable.statusCode).toBe(403);
    expect(h.network.deleteVlan).not.toHaveBeenCalled();
    expect(h.network.setVlanEnabled).not.toHaveBeenCalled();
  });

  it("refuses a user holding neither VLAN permission", async () => {
    h.getCachedPermissions.mockResolvedValue(new Set(["customers.read"]));
    const res = await app.inject({ method: "GET", url: "/api/v1/vlans", headers: await auth() });
    expect(res.statusCode).toBe(403);
  });

  // --- tenant scoping -----------------------------------------------------------------------

  it("always scopes to the caller's own tenant, never a client-supplied id", async () => {
    await app.inject({ method: "GET", url: "/api/v1/vlans", headers: await auth() });
    expect(h.network.listVlans).toHaveBeenCalledWith(TENANT.id, expect.anything());
  });

  it("refuses a platform (tenant-less) admin, who has no network of their own", async () => {
    h.prisma.tenant.findUnique.mockResolvedValue(null);
    const platformToken = await signAccessToken({
      sub: USER_ID,
      tenantId: null,
      sessionId: SESSION_ID,
      roles: [],
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/vlans",
      headers: { authorization: `Bearer ${platformToken}` },
    });
    expect(res.statusCode).toBe(409);
  });

  // --- validation (spec section 1) ----------------------------------------------------------

  it.each([0, 4095, 5000, -1])("rejects the out-of-range VLAN ID %i", async (vlanTag) => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/vlans",
      headers: await auth(),
      payload: { vlanTag, name: "Bad" },
    });
    expect(res.statusCode).toBe(422);
    expect(h.network.createVlan).not.toHaveBeenCalled();
  });

  it("accepts the boundary VLAN IDs 1 and 4094", async () => {
    for (const vlanTag of [1, 4094]) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/vlans",
        headers: await auth(),
        payload: { vlanTag, name: "Edge" },
      });
      expect(res.statusCode, `tag ${vlanTag}`).toBe(201);
    }
  });

  it("rejects a malformed subnet or gateway rather than storing it for a router to choke on", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/vlans",
      headers: await auth(),
      payload: { vlanTag: 30, name: "Business", subnetCidr: "not-a-subnet" },
    });
    expect(res.statusCode).toBe(422);
  });

  it("surfaces the VLAN 1 advisory without blocking it", async () => {
    h.network.createVlan.mockResolvedValue({ ...VLAN_ROW, vlanTag: 1 });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/vlans",
      headers: await auth(),
      payload: { vlanTag: 1, name: "Default" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.tagAdvisory).toMatch(/default VLAN/i);
  });

  // --- audit (spec section 14) --------------------------------------------------------------

  it("records the previous AND new configuration on an update", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/vlans/${VLAN_ID}`,
      headers: await auth(),
      payload: { name: "Renamed" },
    });
    expect(res.statusCode).toBe(200);

    const entry = h.auditEntries.find((e) => e["action"] === "vlan.updated");
    expect(entry).toBeDefined();
    expect(entry!["before"]).toMatchObject({ name: "Home Internet" });
    expect(entry!["after"]).toMatchObject({ name: "Renamed" });
    expect(entry!["actorUserId"]).toBe(USER_ID);
    expect(entry!["tenantId"]).toBe(TENANT.id);
  });

  it("audits enable and disable distinctly, so the log reads as what happened", async () => {
    await app.inject({
      method: "POST",
      url: `/api/v1/vlans/${VLAN_ID}/enabled`,
      headers: await auth(),
      payload: { isEnabled: false },
    });
    expect(h.auditEntries.map((e) => e["action"])).toContain("vlan.disabled");
  });

  it("does not write an audit entry when the write was refused", async () => {
    h.getCachedPermissions.mockResolvedValue(new Set(["vlans.read"]));
    await app.inject({
      method: "POST",
      url: "/api/v1/vlans",
      headers: await auth(),
      payload: { vlanTag: 30, name: "Business" },
    });
    expect(h.auditEntries).toHaveLength(0);
  });
});
