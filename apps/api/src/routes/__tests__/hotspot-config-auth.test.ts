import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

/**
 * Route-level authorization tests for the captive-portal config endpoints.
 *
 * These exist because `PUT /api/v1/hotspot/:tenantSlug/config` shipped as `audience: "public"`
 * with no preHandler at all: any unauthenticated caller could rewrite any ISP's portal branding,
 * support phone number, and price list. Nothing in this repo's existing suite could have caught
 * it — those tests cover pure functions (money, pagination, CIDR), and the bug was in *who is
 * allowed to call a handler*, which only exists at the route layer.
 *
 * What is faked here is deliberately only the DATA layer: Prisma, Redis, and the heavy
 * radius/payments/support services. The security chain under test — authenticate ->
 * resolveTenant -> checkMaintenance -> requirePermission -> the handler's own tenant-ownership
 * check — runs for real, against a real HS256 access token signed with the test secret. Faking
 * any part of that chain would make these tests assert nothing.
 */

// vi.mock is hoisted above the imports below, so anything a factory closes over has to be created
// inside vi.hoisted rather than as a plain module-scope const.
const h = vi.hoisted(() => ({
  prisma: {
    session: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    tenant: { findUnique: vi.fn() },
    paymentProviderConfig: { findMany: vi.fn().mockResolvedValue([]) },
    liveChatConfig: { findUnique: vi.fn().mockResolvedValue(null) },
    mpesaStkRequest: { findFirst: vi.fn() },
    paystackTransaction: { findFirst: vi.fn() },
    captivePortalConfig: {
      findUnique: vi.fn(async ({ where }: { where: { tenantId: string } }) =>
        h.configRows.get(where.tenantId) ?? null
      ),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const existing = h.configRows.get(where.tenantId);
        const row = existing ? { ...existing, ...update } : { ...create };
        h.configRows.set(where.tenantId, row);
        return row;
      }),
    },
  },
  getCachedPermissions: vi.fn(),
  resolveTenantBySlug: vi.fn(),
  /** Stands in for the captive_portal_configs table: tenantId -> stored row. */
  configRows: new Map<string, Record<string, unknown>>(),
}));

vi.mock("@mashupkgrid/database", () => ({ prisma: h.prisma }));
// ioredis connects eagerly at import time (see lib/redis.ts), so stubbing it keeps the suite from
// needing a live Redis. The two libs that actually use it are stubbed below anyway.
vi.mock("../../lib/redis.js", () => ({ redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }));
vi.mock("../../lib/permission-cache.js", () => ({ getCachedPermissions: h.getCachedPermissions }));
vi.mock("../../lib/maintenance-state.js", () => ({
  getCurrentMaintenanceState: vi
    .fn()
    .mockResolvedValue({ enabled: false, level: 1, allowedIps: [], allowedRoles: [] }),
}));
vi.mock("../../services/auth.service.js", () => ({ resolveTenantBySlug: h.resolveTenantBySlug }));
vi.mock("@mashupkgrid/radius", () => ({
  validateVoucherForLogin: vi.fn(),
  normalizeKenyanPhone: vi.fn((v: string) => v),
  authenticateHotspotAccount: vi.fn(),
  listHotspotPackages: vi.fn().mockResolvedValue([]),
}));
vi.mock("@mashupkgrid/support", () => ({ createTicket: vi.fn() }));
vi.mock("@mashupkgrid/payments", () => ({
  initiateHotspotPurchaseStkPush: vi.fn(),
  queryAndReconcileStkRequest: vi.fn(),
  initiatePaystackHotspotPurchase: vi.fn(),
  verifyAndReconcilePaystackTransaction: vi.fn(),
  initiatePesapalHotspotPurchase: vi.fn(),
  verifyAndReconcilePesapalTransaction: vi.fn(),
}));
import { signAccessToken } from "@mashupkgrid/auth";
import { registerErrorHandler } from "../../plugins/error-handler.js";
import { hotspotRoutes } from "../hotspot.js";

const TENANT_A = { id: "11111111-1111-1111-1111-111111111111", slug: "acme", name: "Acme Fibre" };
const TENANT_B = { id: "22222222-2222-2222-2222-222222222222", slug: "globex", name: "Globex Net" };
const SESSION_ID = "33333333-3333-3333-3333-333333333333";
const USER_ID = "44444444-4444-4444-4444-444444444444";

function tenantRow(t: { id: string; slug: string; name: string }) {
  return {
    ...t,
    status: "ACTIVE",
    deletedAt: null,
    brandColor: null,
    logoUrl: null,
    disabledFeatures: [] as string[],
    trialEndsAt: null,
    subscription: null,
  };
}

/** A real, correctly signed access token for a staff member belonging to `tenant`. */
async function tokenFor(tenant: { id: string }): Promise<string> {
  return signAccessToken({ sub: USER_ID, tenantId: tenant.id, sessionId: SESSION_ID, roles: [] });
}

const VALID_BODY = { brandName: "Acme WiFi", supportPhone: "0700000000" };

describe("PUT /hotspot/:tenantSlug/config authorization", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    registerErrorHandler(app);
    await app.register(hotspotRoutes, { prefix: "/api/v1/hotspot" });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    h.configRows.clear();
    // A live, unrevoked session backing whichever token a test presents.
    h.prisma.session.findUnique.mockResolvedValue({
      id: SESSION_ID,
      userId: USER_ID,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    h.prisma.tenant.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === TENANT_A.id
        ? tenantRow(TENANT_A)
        : where.id === TENANT_B.id
          ? tenantRow(TENANT_B)
          : null
    );
    h.resolveTenantBySlug.mockImplementation(async (slug: string) =>
      slug === TENANT_A.slug
        ? tenantRow(TENANT_A)
        : slug === TENANT_B.slug
          ? tenantRow(TENANT_B)
          : null
    );
    h.getCachedPermissions.mockResolvedValue(new Set(["settings.manage"]));
  });

  it("rejects an unauthenticated write — the original bug", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/hotspot/${TENANT_A.slug}/config`,
      payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(401);
    expect(h.configRows.size).toBe(0);
  });

  it("rejects a bearer token that is not a valid access token", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/hotspot/${TENANT_A.slug}/config`,
      headers: { authorization: "Bearer not-a-real-token" },
      payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(401);
    expect(h.configRows.size).toBe(0);
  });

  it("rejects an authenticated staff member who lacks settings.manage", async () => {
    h.getCachedPermissions.mockResolvedValue(new Set(["customers.read"]));
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/hotspot/${TENANT_A.slug}/config`,
      headers: { authorization: `Bearer ${await tokenFor(TENANT_A)}` },
      payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(403);
    expect(h.configRows.size).toBe(0);
  });

  it("rejects a fully-authorized staff member editing ANOTHER tenant's portal", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/hotspot/${TENANT_B.slug}/config`,
      headers: { authorization: `Bearer ${await tokenFor(TENANT_A)}` },
      payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(403);
    expect(h.configRows.size).toBe(0);
  });

  it("rejects a revoked session even though the token itself still verifies", async () => {
    h.prisma.session.findUnique.mockResolvedValue({
      id: SESSION_ID,
      userId: USER_ID,
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/hotspot/${TENANT_A.slug}/config`,
      headers: { authorization: `Bearer ${await tokenFor(TENANT_A)}` },
      payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(401);
    expect(h.configRows.size).toBe(0);
  });

  it("allows a permitted staff member to edit their OWN tenant's portal", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/hotspot/${TENANT_A.slug}/config`,
      headers: { authorization: `Bearer ${await tokenFor(TENANT_A)}` },
      payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.brandName).toBe("Acme WiFi");
    expect(h.configRows.size).toBe(1);
    // Keyed by the caller's OWN tenant id, never by whatever slug the path carried.
    expect([...h.configRows.keys()][0]).toBe(TENANT_A.id);
  });

  it("bounds field length so one write cannot grow the stored row without limit", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/hotspot/${TENANT_A.slug}/config`,
      headers: { authorization: `Bearer ${await tokenFor(TENANT_A)}` },
      payload: { brandName: "x".repeat(5000) },
    });
    expect(res.statusCode).toBe(422);
    expect(h.configRows.size).toBe(0);
  });

  it("keeps the matching GET public — the portal is read before any login exists", async () => {
    const res = await app.inject({ method: "GET", url: `/api/v1/hotspot/${TENANT_A.slug}/config` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});
