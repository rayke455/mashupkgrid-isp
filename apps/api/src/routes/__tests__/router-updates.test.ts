import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

/** Only the account owner may run scripts on routers, and only this ISP's routers can be picked. */

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const SESSION_ID = "33333333-3333-3333-3333-333333333333";
const USER_ID = "44444444-4444-4444-4444-444444444444";
const R1 = "55555555-5555-5555-5555-555555555555";
const R2 = "66666666-6666-6666-6666-666666666666";

const h = vi.hoisted(() => ({
  prisma: {
    session: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    tenant: { findUnique: vi.fn() },
    router: { findMany: vi.fn() },
    routerRollout: { create: vi.fn() },
  },
  permissions: new Set<string>(["routers.manage"]),
}));

vi.mock("@mashupkgrid/database", () => ({ prisma: h.prisma }));
vi.mock("../../lib/redis.js", () => ({ redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }));
vi.mock("../../lib/permission-cache.js", () => ({ getCachedPermissions: vi.fn(async () => h.permissions) }));
vi.mock("../../lib/maintenance-state.js", () => ({
  getCurrentMaintenanceState: vi.fn().mockResolvedValue({ enabled: false, level: 1, allowedIps: [], allowedRoles: [] }),
}));
vi.mock("../../lib/audit.js", () => ({ writeAuditLog: vi.fn() }));

import { signAccessToken } from "@mashupkgrid/auth";
import { registerErrorHandler } from "../../plugins/error-handler.js";
import { routerUpdateRoutes } from "../router-updates.js";

const auth = async () => ({ authorization: `Bearer ${await signAccessToken({ sub: USER_ID, tenantId: TENANT_ID, sessionId: SESSION_ID, roles: [] })}` });

describe("router updates", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = Fastify();
    registerErrorHandler(app);
    await app.register(routerUpdateRoutes, { prefix: "/api/v1/router-updates" });
    await app.ready();
  });
  afterAll(() => app.close());

  beforeEach(() => {
    h.permissions = new Set(["routers.manage"]);
    h.prisma.router.findMany.mockReset();
    h.prisma.routerRollout.create.mockReset().mockImplementation(async ({ data }: { data: object }) => ({ id: "ro1", ...data }));
    h.prisma.session.findUnique.mockResolvedValue({ id: SESSION_ID, userId: USER_ID, revokedAt: null, expiresAt: new Date(Date.now() + 60_000) });
    h.prisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, slug: "acme", name: "Acme", status: "ACTIVE", deletedAt: null, brandColor: null, logoUrl: null, disabledFeatures: [], trialEndsAt: null, subscription: null });
  });

  it("refuses a custom script from someone who is not the owner", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/router-updates", headers: await auth(), payload: { action: "custom-script", routerIds: [R1], script: "/system reboot" } });
    expect(res.statusCode).toBe(403);
    expect(h.prisma.routerRollout.create).not.toHaveBeenCalled();
  });

  it("refuses a router that is not this ISP's", async () => {
    h.prisma.router.findMany.mockResolvedValue([{ id: R1, name: "Mine" }]);
    const res = await app.inject({ method: "POST", url: "/api/v1/router-updates", headers: await auth(), payload: { action: "reboot", routerIds: [R1, R2] } });
    expect(res.statusCode).toBe(404);
    expect(h.prisma.router.findMany.mock.calls[0]![0].where.tenantId).toBe(TENANT_ID);
  });

  it("queues the owner's script for their routers, first router alone", async () => {
    h.permissions = new Set(["routers.manage", "settings.manage"]);
    h.prisma.router.findMany.mockResolvedValue([{ id: R2, name: "B" }, { id: R1, name: "A" }]);
    const res = await app.inject({ method: "POST", url: "/api/v1/router-updates", headers: await auth(), payload: { action: "custom-script", routerIds: [R1, R2], script: " /system ntp client set enabled=yes " } });
    expect(res.statusCode).toBe(201);
    const data = h.prisma.routerRollout.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({ tenantId: TENANT_ID, action: "custom-script", status: "RUNNING", canaryFirst: true, params: { script: "/system ntp client set enabled=yes" } });
    expect(data.targets.create.map((t: { routerName: string }) => t.routerName)).toEqual(["A", "B"]);
  });
});
