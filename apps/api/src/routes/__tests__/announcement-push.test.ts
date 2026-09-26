import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

/** A super admin can send a notification as a push alert too: to one ISP's staff, or to staff of
 *  every ISP (never to other platform admins), and only with permission to message ISPs. */

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const SESSION_ID = "33333333-3333-3333-3333-333333333333";
const ADMIN_ID = "44444444-4444-4444-4444-444444444444";
const ANN_ID = "55555555-5555-5555-5555-555555555555";

const h = vi.hoisted(() => ({
  prisma: {
    session: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    tenant: { findUnique: vi.fn() },
    platformAnnouncement: { create: vi.fn(), findUnique: vi.fn() },
  },
  permissions: new Set<string>(["tenants.update"]),
  pushToDevices: vi.fn(),
}));

vi.mock("@mashupkgrid/database", () => ({ prisma: h.prisma }));
vi.mock("@mashupkgrid/push", () => ({ isPushConfigured: () => true, pushToDevices: h.pushToDevices }));
vi.mock("../../lib/redis.js", () => ({ redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }));
vi.mock("../../lib/permission-cache.js", () => ({ getCachedPermissions: vi.fn(async () => h.permissions) }));
vi.mock("../../lib/maintenance-state.js", () => ({
  getCurrentMaintenanceState: vi.fn().mockResolvedValue({ enabled: false, level: 1, allowedIps: [], allowedRoles: [] }),
}));
vi.mock("../../lib/audit.js", () => ({ writeAuditLog: vi.fn() }));

import { signAccessToken } from "@mashupkgrid/auth";
import { registerErrorHandler } from "../../plugins/error-handler.js";
import { announcementRoutes } from "../announcements.js";

const auth = async () => ({ authorization: `Bearer ${await signAccessToken({ sub: ADMIN_ID, tenantId: null, sessionId: SESSION_ID, roles: ["SUPER_ADMIN"] })}` });

describe("announcement push alerts", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = Fastify();
    registerErrorHandler(app);
    await app.register(announcementRoutes, { prefix: "/api/v1/announcements" });
    await app.ready();
  });
  afterAll(() => app.close());

  beforeEach(() => {
    h.permissions = new Set(["tenants.update"]);
    h.pushToDevices.mockReset().mockResolvedValue(3);
    h.prisma.platformAnnouncement.create.mockReset();
    h.prisma.platformAnnouncement.findUnique.mockReset();
    h.prisma.session.findUnique.mockResolvedValue({ id: SESSION_ID, userId: ADMIN_ID, revokedAt: null, expiresAt: new Date(Date.now() + 60_000) });
  });

  it("pushes a new notification to every ISP's staff when asked", async () => {
    h.prisma.platformAnnouncement.create.mockResolvedValueOnce({ id: ANN_ID, tenantId: null, title: "Maintenance", body: "Sunday 2am", severity: "WARNING" });
    const res = await app.inject({ method: "POST", url: "/api/v1/announcements", headers: await auth(), payload: { tenantId: null, title: "Maintenance", body: "Sunday 2am", severity: "WARNING", push: true } });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.pushed).toBe(3);
    const [where, payload] = h.pushToDevices.mock.calls[0]!;
    expect(where).toEqual({ user: { status: "ACTIVE", deletedAt: null, tenantId: { not: null } } });
    expect(payload).toMatchObject({ title: "Maintenance", body: "Sunday 2am", url: "/notifications" });
  });

  it("does not push unless asked", async () => {
    h.prisma.platformAnnouncement.create.mockResolvedValueOnce({ id: ANN_ID, tenantId: TENANT_ID, title: "Hi", body: "There", severity: "INFO" });
    const res = await app.inject({ method: "POST", url: "/api/v1/announcements", headers: await auth(), payload: { tenantId: TENANT_ID, title: "Hi", body: "There" } });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.pushed).toBeNull();
    expect(h.pushToDevices).not.toHaveBeenCalled();
  });

  it("re-sends an existing notification to its own ISP only", async () => {
    h.prisma.platformAnnouncement.findUnique.mockResolvedValueOnce({ id: ANN_ID, tenantId: TENANT_ID, title: "Hi", body: "There" });
    const res = await app.inject({ method: "POST", url: `/api/v1/announcements/${ANN_ID}/push`, headers: await auth() });
    expect(res.statusCode).toBe(200);
    expect(h.pushToDevices.mock.calls[0]![0]).toEqual({ user: { status: "ACTIVE", deletedAt: null, tenantId: TENANT_ID } });
  });

  it("needs permission to message ISPs", async () => {
    h.permissions = new Set();
    const res = await app.inject({ method: "POST", url: `/api/v1/announcements/${ANN_ID}/push`, headers: await auth() });
    expect(res.statusCode).toBe(403);
    expect(h.pushToDevices).not.toHaveBeenCalled();
  });
});
