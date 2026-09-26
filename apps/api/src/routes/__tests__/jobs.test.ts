import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

/** Technicians work only their own jobs, an installation closes only once signed, and uploads
 *  are limited to small images. */

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const SESSION_ID = "33333333-3333-3333-3333-333333333333";
const TECH_ID = "44444444-4444-4444-4444-444444444444";
const OTHER_TECH = "55555555-5555-5555-5555-555555555555";
const JOB_ID = "66666666-6666-6666-6666-666666666666";

const h = vi.hoisted(() => ({
  prisma: {
    session: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    tenant: { findUnique: vi.fn() },
    jobCard: { findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    jobCardAttachment: { count: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  },
  permissions: new Set<string>(["customers.read"]),
}));

vi.mock("@mashupkgrid/database", () => ({ prisma: h.prisma }));
vi.mock("@mashupkgrid/push", () => ({ pushToUser: vi.fn().mockResolvedValue(0) }));
vi.mock("../../lib/redis.js", () => ({ redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }));
vi.mock("../../lib/permission-cache.js", () => ({ getCachedPermissions: vi.fn(async () => h.permissions) }));
vi.mock("../../lib/maintenance-state.js", () => ({
  getCurrentMaintenanceState: vi.fn().mockResolvedValue({ enabled: false, level: 1, allowedIps: [], allowedRoles: [] }),
}));
vi.mock("../../lib/audit.js", () => ({ writeAuditLog: vi.fn() }));

import { signAccessToken } from "@mashupkgrid/auth";
import { registerErrorHandler } from "../../plugins/error-handler.js";
import { jobRoutes } from "../jobs.js";

const auth = async () => ({ authorization: `Bearer ${await signAccessToken({ sub: TECH_ID, tenantId: TENANT_ID, sessionId: SESSION_ID, roles: [] })}` });
const job = (over: Record<string, unknown> = {}) => ({ id: JOB_ID, tenantId: TENANT_ID, number: "JOB-00001", type: "INSTALLATION", status: "IN_PROGRESS", assignedToUserId: TECH_ID, startedAt: new Date(), latitude: null, longitude: null, ...over });

describe("job cards", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = Fastify();
    registerErrorHandler(app);
    await app.register(jobRoutes, { prefix: "/api/v1/jobs" });
    await app.ready();
  });
  afterAll(() => app.close());

  beforeEach(() => {
    h.permissions = new Set(["customers.read"]);
    for (const m of [h.prisma.jobCard.findFirst, h.prisma.jobCard.update, h.prisma.jobCard.findMany, h.prisma.jobCardAttachment.count, h.prisma.jobCardAttachment.create]) m.mockReset();
    h.prisma.session.findUnique.mockResolvedValue({ id: SESSION_ID, userId: TECH_ID, revokedAt: null, expiresAt: new Date(Date.now() + 60_000) });
    h.prisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, slug: "acme", name: "Acme", status: "ACTIVE", deletedAt: null, brandColor: null, logoUrl: null, disabledFeatures: [], trialEndsAt: null, subscription: null });
  });

  it("shows a technician only their own jobs", async () => {
    h.prisma.jobCard.findMany.mockResolvedValue([]);
    await app.inject({ method: "GET", url: "/api/v1/jobs", headers: await auth() });
    expect(h.prisma.jobCard.findMany.mock.calls[0]![0].where.assignedToUserId).toBe(TECH_ID);
  });

  it("refuses to let a technician close someone else's job", async () => {
    h.prisma.jobCard.findFirst.mockResolvedValue(job({ assignedToUserId: OTHER_TECH }));
    const res = await app.inject({ method: "POST", url: `/api/v1/jobs/${JOB_ID}/complete`, headers: await auth(), payload: {} });
    expect(res.statusCode).toBe(403);
    expect(h.prisma.jobCard.update).not.toHaveBeenCalled();
  });

  it("keeps an installation open until the customer signs", async () => {
    h.prisma.jobCard.findFirst.mockResolvedValue(job());
    h.prisma.jobCardAttachment.count.mockResolvedValueOnce(0);
    const unsigned = await app.inject({ method: "POST", url: `/api/v1/jobs/${JOB_ID}/complete`, headers: await auth(), payload: {} });
    expect(unsigned.statusCode).toBe(409);

    h.prisma.jobCardAttachment.count.mockResolvedValueOnce(1);
    h.prisma.jobCard.update.mockResolvedValueOnce(job({ status: "DONE" }));
    const signed = await app.inject({ method: "POST", url: `/api/v1/jobs/${JOB_ID}/complete`, headers: await auth(), payload: { equipment: "ONT HWTC1234" } });
    expect(signed.statusCode).toBe(200);
    expect(h.prisma.jobCard.update.mock.calls[0]![0].data).toMatchObject({ status: "DONE", equipment: "ONT HWTC1234" });
  });

  it("accepts only small images", async () => {
    h.prisma.jobCard.findFirst.mockResolvedValue(job());
    const pdf = await app.inject({ method: "POST", url: `/api/v1/jobs/${JOB_ID}/attachments`, headers: await auth(), payload: { kind: "PHOTO", mimeType: "application/pdf", dataBase64: "AAAA" } });
    expect(pdf.statusCode).toBe(422);
    h.prisma.jobCardAttachment.count.mockResolvedValueOnce(8);
    const ninth = await app.inject({ method: "POST", url: `/api/v1/jobs/${JOB_ID}/attachments`, headers: await auth(), payload: { kind: "PHOTO", mimeType: "image/jpeg", dataBase64: "/9j/4AAQ" } });
    expect(ninth.statusCode).toBe(409);
    expect(h.prisma.jobCardAttachment.create).not.toHaveBeenCalled();
  });
});
