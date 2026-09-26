import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

/** Branches group routers, customers and staff. Every write must stay inside the caller's own
 *  tenant: another ISP's branch id is "not found", and bulk assignment is always tenant-scoped. */

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_TENANT = "99999999-9999-9999-9999-999999999999";
const BRANCH_ID = "22222222-2222-2222-2222-222222222222";
const SESSION_ID = "33333333-3333-3333-3333-333333333333";
const USER_ID = "44444444-4444-4444-4444-444444444444";

const h = vi.hoisted(() => ({
  prisma: {
    session: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    tenant: { findUnique: vi.fn() },
    branch: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    router: { updateMany: vi.fn() },
    customer: { updateMany: vi.fn() },
    user: { updateMany: vi.fn() },
  },
  getCachedPermissions: vi.fn(),
  audit: [] as Array<Record<string, unknown>>,
}));

vi.mock("@mashupkgrid/database", () => ({ prisma: h.prisma }));
vi.mock("../../lib/redis.js", () => ({ redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }));
vi.mock("../../lib/permission-cache.js", () => ({ getCachedPermissions: h.getCachedPermissions }));
vi.mock("../../lib/maintenance-state.js", () => ({
  getCurrentMaintenanceState: vi.fn().mockResolvedValue({ enabled: false, level: 1, allowedIps: [], allowedRoles: [] }),
}));
vi.mock("../../lib/audit.js", () => ({ writeAuditLog: vi.fn(async (e: Record<string, unknown>) => void h.audit.push(e)) }));

import { signAccessToken } from "@mashupkgrid/auth";
import { registerErrorHandler } from "../../plugins/error-handler.js";
import { branchRoutes } from "../branches.js";

const auth = async () => ({ authorization: `Bearer ${await signAccessToken({ sub: USER_ID, tenantId: TENANT_ID, sessionId: SESSION_ID, roles: [] })}` });

describe("branches", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = Fastify();
    registerErrorHandler(app);
    await app.register(branchRoutes, { prefix: "/api/v1/branches" });
    await app.ready();
  });
  afterAll(() => app.close());

  beforeEach(() => {
    h.audit.length = 0;
    for (const m of [h.prisma.branch.findFirst, h.prisma.branch.findUnique, h.prisma.branch.create, h.prisma.router.updateMany, h.prisma.customer.updateMany, h.prisma.user.updateMany]) m.mockReset();
    h.prisma.session.findUnique.mockResolvedValue({ id: SESSION_ID, userId: USER_ID, revokedAt: null, expiresAt: new Date(Date.now() + 60_000) });
    h.prisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, slug: "acme", name: "Acme", status: "ACTIVE", deletedAt: null, brandColor: null, logoUrl: null, disabledFeatures: [], trialEndsAt: null, subscription: null });
    h.getCachedPermissions.mockResolvedValue(new Set(["settings.manage", "customers.read"]));
  });

  it("creates a branch and refuses a duplicate name", async () => {
    h.prisma.branch.findUnique.mockResolvedValueOnce(null);
    h.prisma.branch.create.mockResolvedValueOnce({ id: BRANCH_ID, tenantId: TENANT_ID, name: "Nyeri", location: null });
    const ok = await app.inject({ method: "POST", url: "/api/v1/branches", headers: await auth(), payload: { name: "Nyeri" } });
    expect(ok.statusCode).toBe(201);
    expect(h.prisma.branch.create).toHaveBeenCalledWith({ data: { tenantId: TENANT_ID, name: "Nyeri", location: null } });

    h.prisma.branch.findUnique.mockResolvedValueOnce({ id: BRANCH_ID });
    const dup = await app.inject({ method: "POST", url: "/api/v1/branches", headers: await auth(), payload: { name: "Nyeri" } });
    expect(dup.statusCode).toBe(409);
  });

  it("assigns only this tenant's records to this tenant's branch", async () => {
    h.prisma.branch.findFirst.mockResolvedValueOnce({ id: BRANCH_ID, tenantId: TENANT_ID });
    h.prisma.router.updateMany.mockResolvedValueOnce({ count: 2 });
    const ids = ["55555555-5555-5555-5555-555555555555", "66666666-6666-6666-6666-666666666666"];
    const res = await app.inject({ method: "POST", url: "/api/v1/branches/assign", headers: await auth(), payload: { kind: "router", ids, branchId: BRANCH_ID } });
    expect(res.statusCode).toBe(200);
    expect(h.prisma.branch.findFirst).toHaveBeenCalledWith({ where: { id: BRANCH_ID, tenantId: TENANT_ID } });
    expect(h.prisma.router.updateMany).toHaveBeenCalledWith({ where: { tenantId: TENANT_ID, id: { in: ids } }, data: { branchId: BRANCH_ID } });
  });

  it("refuses a branch that belongs to another ISP", async () => {
    h.prisma.branch.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/branches/assign",
      headers: await auth(),
      payload: { kind: "customer", ids: ["55555555-5555-5555-5555-555555555555"], branchId: OTHER_TENANT },
    });
    expect(res.statusCode).toBe(404);
    expect(h.prisma.customer.updateMany).not.toHaveBeenCalled();
  });

  it("needs settings.manage to change branches", async () => {
    h.getCachedPermissions.mockResolvedValue(new Set(["customers.read"]));
    const res = await app.inject({ method: "POST", url: "/api/v1/branches", headers: await auth(), payload: { name: "Nyeri" } });
    expect(res.statusCode).toBe(403);
    expect(h.prisma.branch.create).not.toHaveBeenCalled();
  });
});
