import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

/** A staff member manages only their own devices, and nothing is stored when the server has
 *  no push keys to send with. */

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const SESSION_ID = "33333333-3333-3333-3333-333333333333";
const USER_ID = "44444444-4444-4444-4444-444444444444";
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc123";

const h = vi.hoisted(() => ({
  prisma: {
    session: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    tenant: { findUnique: vi.fn() },
    pushSubscription: { upsert: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
  },
  configured: true,
  pushToUser: vi.fn(),
}));

vi.mock("@mashupkgrid/database", () => ({ prisma: h.prisma }));
vi.mock("@mashupkgrid/push", () => ({
  isPushConfigured: () => h.configured,
  vapidPublicKey: () => (h.configured ? "BPUBLIC" : null),
  pushToUser: h.pushToUser,
}));
vi.mock("../../lib/redis.js", () => ({ redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }));
vi.mock("../../lib/permission-cache.js", () => ({ getCachedPermissions: vi.fn().mockResolvedValue(new Set()) }));
vi.mock("../../lib/maintenance-state.js", () => ({
  getCurrentMaintenanceState: vi.fn().mockResolvedValue({ enabled: false, level: 1, allowedIps: [], allowedRoles: [] }),
}));

import { signAccessToken } from "@mashupkgrid/auth";
import { registerErrorHandler } from "../../plugins/error-handler.js";
import { pushRoutes } from "../push.js";

const auth = async () => ({ authorization: `Bearer ${await signAccessToken({ sub: USER_ID, tenantId: TENANT_ID, sessionId: SESSION_ID, roles: [] })}` });
const keys = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };

describe("push routes", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = Fastify();
    registerErrorHandler(app);
    await app.register(pushRoutes, { prefix: "/api/v1/push" });
    await app.ready();
  });
  afterAll(() => app.close());

  beforeEach(() => {
    h.configured = true;
    for (const m of [h.prisma.pushSubscription.upsert, h.prisma.pushSubscription.deleteMany, h.pushToUser]) m.mockReset();
    h.prisma.session.findUnique.mockResolvedValue({ id: SESSION_ID, userId: USER_ID, revokedAt: null, expiresAt: new Date(Date.now() + 60_000) });
    h.prisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, slug: "acme", name: "Acme", status: "ACTIVE", deletedAt: null, brandColor: null, logoUrl: null, disabledFeatures: [], trialEndsAt: null, subscription: null });
  });

  it("stores the device against the signed-in user", async () => {
    h.prisma.pushSubscription.upsert.mockResolvedValueOnce({});
    const res = await app.inject({ method: "POST", url: "/api/v1/push/subscriptions", headers: await auth(), payload: { endpoint: ENDPOINT, keys } });
    expect(res.statusCode).toBe(201);
    const call = h.prisma.pushSubscription.upsert.mock.calls[0]![0];
    expect(call.where).toEqual({ endpoint: ENDPOINT });
    expect(call.create).toMatchObject({ userId: USER_ID, tenantId: TENANT_ID });
  });

  it("refuses a non-https endpoint", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/push/subscriptions", headers: await auth(), payload: { endpoint: "http://evil.local/x", keys } });
    expect(res.statusCode).toBe(422);
    expect(h.prisma.pushSubscription.upsert).not.toHaveBeenCalled();
  });

  it("stores nothing when the server has no push keys", async () => {
    h.configured = false;
    const res = await app.inject({ method: "POST", url: "/api/v1/push/subscriptions", headers: await auth(), payload: { endpoint: ENDPOINT, keys } });
    expect(res.statusCode).toBe(409);
    expect(h.prisma.pushSubscription.upsert).not.toHaveBeenCalled();
  });

  it("removes only the caller's own device", async () => {
    h.prisma.pushSubscription.deleteMany.mockResolvedValueOnce({ count: 1 });
    const res = await app.inject({ method: "DELETE", url: "/api/v1/push/subscriptions", headers: await auth(), payload: { endpoint: ENDPOINT } });
    expect(res.statusCode).toBe(200);
    expect(h.prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { endpoint: ENDPOINT, userId: USER_ID } });
  });
});
