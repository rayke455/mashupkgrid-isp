import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

/**
 * The permission split the spec draws in section 15, at the route layer where it actually exists.
 *
 * A support agent holds `vlans.read` + `provisioning.retry`: they must be able to see why a
 * customer is off-line and re-run the failed job, and must NOT be able to change VLAN
 * configuration. Those are separate permissions precisely so the second does not come free with
 * the first, and only a route-level test can prove the routes honour that.
 */

const h = vi.hoisted(() => ({
  prisma: {
    session: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    tenant: { findUnique: vi.fn() },
    provisioningJob: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    customerService: { findFirst: vi.fn() },
  },
  getCachedPermissions: vi.fn(),
  retryProvisioningJob: vi.fn(),
  enqueueProvisioningJob: vi.fn(),
}));

vi.mock("@mashupkgrid/database", () => ({ prisma: h.prisma }));
vi.mock("../../lib/redis.js", () => ({ redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }));
vi.mock("../../lib/permission-cache.js", () => ({ getCachedPermissions: h.getCachedPermissions }));
vi.mock("../../lib/maintenance-state.js", () => ({
  getCurrentMaintenanceState: vi
    .fn()
    .mockResolvedValue({ enabled: false, level: 1, allowedIps: [], allowedRoles: [] }),
}));
vi.mock("../../lib/audit.js", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@mashupkgrid/radius", () => ({
  retryProvisioningJob: h.retryProvisioningJob,
  enqueueProvisioningJob: h.enqueueProvisioningJob,
}));

import { signAccessToken } from "@mashupkgrid/auth";
import { registerErrorHandler } from "../../plugins/error-handler.js";
import { provisioningRoutes } from "../provisioning.js";

const TENANT = { id: "11111111-1111-1111-1111-111111111111", slug: "acme", name: "Acme" };
const SESSION_ID = "33333333-3333-3333-3333-333333333333";
const USER_ID = "44444444-4444-4444-4444-444444444444";
const JOB_ID = "55555555-5555-5555-5555-555555555555";
const SUB_ID = "66666666-6666-6666-6666-666666666666";

const auth = async () => ({
  authorization: `Bearer ${await signAccessToken({ sub: USER_ID, tenantId: TENANT.id, sessionId: SESSION_ID, roles: [] })}`,
});

/** What a support agent actually holds. */
const SUPPORT = new Set(["vlans.read", "provisioning.retry"]);

describe("provisioning routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    registerErrorHandler(app);
    await app.register(provisioningRoutes, { prefix: "/api/v1/provisioning" });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    h.prisma.session.findUnique.mockResolvedValue({
      id: SESSION_ID, userId: USER_ID, revokedAt: null, expiresAt: new Date(Date.now() + 60_000),
    });
    h.prisma.tenant.findUnique.mockResolvedValue({
      ...TENANT, status: "ACTIVE", deletedAt: null, brandColor: null, logoUrl: null,
      disabledFeatures: [] as string[], trialEndsAt: null, subscription: null,
    });
    h.prisma.provisioningJob.findMany.mockResolvedValue([]);
    h.prisma.provisioningJob.groupBy.mockResolvedValue([]);
    h.prisma.customerService.findFirst.mockResolvedValue({ id: SUB_ID, tenantId: TENANT.id });
    h.retryProvisioningJob.mockResolvedValue({ id: JOB_ID, operation: "PROVISION", customerServiceId: SUB_ID });
    h.enqueueProvisioningJob.mockResolvedValue({ job: { id: JOB_ID, operation: "PROVISION" }, deduplicated: false });
    h.getCachedPermissions.mockResolvedValue(SUPPORT);
  });

  it("refuses every route without a token", async () => {
    for (const [method, url] of [
      ["GET", "/api/v1/provisioning/jobs"],
      ["GET", "/api/v1/provisioning/jobs/summary"],
      ["POST", `/api/v1/provisioning/jobs/${JOB_ID}/retry`],
    ] as const) {
      const res = await app.inject({ method: method as "GET", url, payload: {} });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
    expect(h.retryProvisioningJob).not.toHaveBeenCalled();
  });

  it("lets a support agent SEE the queue", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/provisioning/jobs", headers: await auth() });
    expect(res.statusCode).toBe(200);
  });

  it("lets a support agent RETRY a failed job — the whole point of the split", async () => {
    const res = await app.inject({
      method: "POST", url: `/api/v1/provisioning/jobs/${JOB_ID}/retry`, headers: await auth(), payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(h.retryProvisioningJob).toHaveBeenCalledWith(TENANT.id, JOB_ID);
  });

  it("refuses retry to someone with vlans.read but NOT provisioning.retry", async () => {
    h.getCachedPermissions.mockResolvedValue(new Set(["vlans.read"]));
    const res = await app.inject({
      method: "POST", url: `/api/v1/provisioning/jobs/${JOB_ID}/retry`, headers: await auth(), payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(h.retryProvisioningJob).not.toHaveBeenCalled();
  });

  it("refuses the queue entirely to someone with neither permission", async () => {
    h.getCachedPermissions.mockResolvedValue(new Set(["customers.read"]));
    const res = await app.inject({ method: "GET", url: "/api/v1/provisioning/jobs", headers: await auth() });
    expect(res.statusCode).toBe(403);
  });

  it("always scopes the queue to the caller's own tenant", async () => {
    await app.inject({ method: "GET", url: "/api/v1/provisioning/jobs", headers: await auth() });
    expect(h.prisma.provisioningJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT.id }) })
    );
  });

  it("404s a job belonging to another tenant rather than leaking it", async () => {
    h.prisma.provisioningJob.findFirst.mockResolvedValue(null);
    const res = await app.inject({
      method: "GET", url: `/api/v1/provisioning/jobs/${JOB_ID}`, headers: await auth(),
    });
    expect(res.statusCode).toBe(404);
  });

  it("refuses to queue work for a subscription outside the tenant", async () => {
    h.prisma.customerService.findFirst.mockResolvedValue(null);
    const res = await app.inject({
      method: "POST", url: `/api/v1/provisioning/subscriptions/${SUB_ID}/reprovision`,
      headers: await auth(), payload: { operation: "PROVISION" },
    });
    expect(res.statusCode).toBe(404);
    expect(h.enqueueProvisioningJob).not.toHaveBeenCalled();
  });

  it("rejects an unknown operation instead of passing it to the engine", async () => {
    const res = await app.inject({
      method: "POST", url: `/api/v1/provisioning/subscriptions/${SUB_ID}/reprovision`,
      headers: await auth(), payload: { operation: "DELETE_EVERYTHING" },
    });
    expect(res.statusCode).toBe(422);
    expect(h.enqueueProvisioningJob).not.toHaveBeenCalled();
  });

  it("refuses a platform admin, who has no network of their own", async () => {
    h.prisma.tenant.findUnique.mockResolvedValue(null);
    const token = await signAccessToken({ sub: USER_ID, tenantId: null, sessionId: SESSION_ID, roles: [] });
    const res = await app.inject({
      method: "GET", url: "/api/v1/provisioning/jobs", headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(409);
  });
});
