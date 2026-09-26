import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

/**
 * A self-registered ISP is PENDING_APPROVAL until a super admin decides. What is pinned here:
 * approval flips the status and automatically tells the owner (email always, WhatsApp when a
 * phone is on file) with the "approved" copy; rejection cancels and tells them why; neither
 * can be applied twice or to a tenant in any other state; and both are audited.
 */

const h = vi.hoisted(() => ({
  prisma: {
    session: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    tenant: { findUnique: vi.fn(), update: vi.fn() },
    user: { findFirst: vi.fn() },
  },
  getCachedPermissions: vi.fn(),
  email: vi.fn().mockResolvedValue(undefined),
  whatsapp: vi.fn().mockResolvedValue(undefined),
  auditEntries: [] as Array<Record<string, unknown>>,
}));

vi.mock("@mashupkgrid/database", () => ({ prisma: h.prisma }));
vi.mock("@mashupkgrid/payments", () => ({
  initiateOnboardingFeeStkPush: vi.fn(),
  getOnboardingFeeStatus: vi.fn(),
  getActiveDestination: vi.fn(),
  setActiveDestination: vi.fn(),
  presentDestination: vi.fn(),
}));
vi.mock("../../lib/redis.js", () => ({ redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }));
vi.mock("../../lib/permission-cache.js", () => ({ getCachedPermissions: h.getCachedPermissions }));
vi.mock("../../lib/queue.js", () => ({
  enqueueSendTenantWelcomeEmail: h.email,
  enqueueSendWhatsappTenantWelcome: h.whatsapp,
}));
vi.mock("../../lib/whatsapp-otp.js", () => ({ normalizePhoneForOtp: (p: string) => p }));
vi.mock("../../lib/maintenance-state.js", () => ({
  getCurrentMaintenanceState: vi.fn().mockResolvedValue({ enabled: false, level: 1, allowedIps: [], allowedRoles: [] }),
}));
vi.mock("../../lib/audit.js", () => ({
  writeAuditLog: vi.fn(async (entry: Record<string, unknown>) => {
    h.auditEntries.push(entry);
  }),
}));

import { signAccessToken } from "@mashupkgrid/auth";
import { registerErrorHandler } from "../../plugins/error-handler.js";
import { tenantRoutes } from "../tenants.js";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const SESSION_ID = "33333333-3333-3333-3333-333333333333";
const ADMIN_ID = "55555555-5555-5555-5555-555555555555";

const pendingTenant = {
  id: TENANT_ID,
  name: "Acme Fibre",
  slug: "acme",
  status: "PENDING_APPROVAL",
  deletedAt: null,
  customDomain: null,
};

const adminAuth = async () => ({
  authorization: `Bearer ${await signAccessToken({ sub: ADMIN_ID, tenantId: null, sessionId: SESSION_ID, roles: [] })}`,
});

describe("tenant approval", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    registerErrorHandler(app);
    await app.register(tenantRoutes, { prefix: "/api/v1/platform/tenants" });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    h.auditEntries.length = 0;
    h.email.mockClear();
    h.whatsapp.mockClear();
    h.prisma.tenant.update.mockClear();
    h.prisma.session.findUnique.mockResolvedValue({ id: SESSION_ID, userId: ADMIN_ID, revokedAt: null, expiresAt: new Date(Date.now() + 60_000) });
    h.getCachedPermissions.mockResolvedValue(new Set(["tenants.update"]));
    h.prisma.tenant.findUnique.mockResolvedValue(pendingTenant);
    h.prisma.tenant.update.mockImplementation(async ({ data }: { data: { status: string } }) => ({ ...pendingTenant, ...data }));
    h.prisma.user.findFirst.mockResolvedValue({ email: "owner@acme.co.ke", phone: "+254700000000" });
  });

  it("approves a pending tenant and sends the owner their sign-in details on both channels", async () => {
    const res = await app.inject({ method: "POST", url: `/api/v1/platform/tenants/${TENANT_ID}/approve`, headers: await adminAuth() });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ status: "ACTIVE", notified: { email: true, whatsapp: true } });
    expect(h.prisma.tenant.update).toHaveBeenCalledWith({ where: { id: TENANT_ID }, data: { status: "ACTIVE" } });
    expect(h.email).toHaveBeenCalledWith(expect.objectContaining({ email: "owner@acme.co.ke", stage: "approved", subdomain: "acme" }));
    expect(h.whatsapp).toHaveBeenCalledWith(expect.objectContaining({ phone: "+254700000000", stage: "approved", username: "owner@acme.co.ke" }));
    expect(h.auditEntries).toEqual([expect.objectContaining({ action: "tenant.approved", actorUserId: ADMIN_ID, resourceId: TENANT_ID })]);
  });

  it("skips WhatsApp when the owner registered without a phone", async () => {
    h.prisma.user.findFirst.mockResolvedValue({ email: "owner@acme.co.ke", phone: null });
    const res = await app.inject({ method: "POST", url: `/api/v1/platform/tenants/${TENANT_ID}/approve`, headers: await adminAuth() });
    expect(res.json().data.notified).toEqual({ email: true, whatsapp: false });
    expect(h.whatsapp).not.toHaveBeenCalled();
  });

  it("refuses to approve a tenant that is not awaiting approval, and sends nothing", async () => {
    h.prisma.tenant.findUnique.mockResolvedValue({ ...pendingTenant, status: "ACTIVE" });
    const res = await app.inject({ method: "POST", url: `/api/v1/platform/tenants/${TENANT_ID}/approve`, headers: await adminAuth() });
    expect(res.statusCode).toBe(409);
    expect(h.email).not.toHaveBeenCalled();
    expect(h.prisma.tenant.update).not.toHaveBeenCalled();
  });

  it("rejects with a reason the applicant is told, and cancels rather than deletes", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/platform/tenants/${TENANT_ID}/reject`,
      headers: await adminAuth(),
      payload: { reason: "No CA licence number provided" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("CANCELLED");
    expect(h.email).toHaveBeenCalledWith(expect.objectContaining({ stage: "rejected", reason: "No CA licence number provided" }));
    expect(h.auditEntries[0]).toMatchObject({ action: "tenant.rejected", after: { status: "CANCELLED", reason: "No CA licence number provided" } });
  });

  it("needs tenants.update", async () => {
    h.getCachedPermissions.mockResolvedValue(new Set(["tenants.read"]));
    const res = await app.inject({ method: "POST", url: `/api/v1/platform/tenants/${TENANT_ID}/approve`, headers: await adminAuth() });
    expect(res.statusCode).toBe(403);
  });
});
