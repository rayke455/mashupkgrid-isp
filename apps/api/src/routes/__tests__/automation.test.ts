import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

/**
 * Route-level tests for the automation page's API.
 *
 * The boundary under test: every scheduled job runs across all tenants at once, so its counters
 * ("suspended=12") describe the whole platform. A tenant operator may see whether their billing
 * is running and when, never those counters, and may never start a run. As in the other route
 * tests, only the data layer (Prisma, Redis, the queue) is faked; authenticate -> resolveTenant
 * -> checkMaintenance -> the route's own audience check run for real against a signed token.
 */

const h = vi.hoisted(() => ({
  prisma: {
    session: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    tenant: { findUnique: vi.fn() },
  },
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    mget: vi.fn(),
    lrange: vi.fn().mockResolvedValue([]),
  },
  getCachedPermissions: vi.fn(),
  enqueueAutomationRunNow: vi.fn().mockResolvedValue("manual-generate-invoices-1"),
  auditEntries: [] as Array<Record<string, unknown>>,
}));

vi.mock("@mashupkgrid/database", () => ({ prisma: h.prisma }));
vi.mock("../../lib/redis.js", () => ({ redis: h.redis }));
vi.mock("../../lib/permission-cache.js", () => ({ getCachedPermissions: h.getCachedPermissions }));
vi.mock("../../lib/queue.js", () => ({ enqueueAutomationRunNow: h.enqueueAutomationRunNow }));
vi.mock("../../lib/maintenance-state.js", () => ({
  getCurrentMaintenanceState: vi.fn().mockResolvedValue({ enabled: false, level: 1, allowedIps: [], allowedRoles: [] }),
}));
vi.mock("../../lib/audit.js", () => ({
  writeAuditLog: vi.fn(async (entry: Record<string, unknown>) => {
    h.auditEntries.push(entry);
  }),
}));

import { signAccessToken } from "@mashupkgrid/auth";
import { AUTOMATION_JOBS, AUTOMATION_KEYS, JOB_NAMES, type AutomationRunRecord } from "@mashupkgrid/shared";
import { registerErrorHandler } from "../../plugins/error-handler.js";
import { automationRoutes } from "../automation.js";

const TENANT = { id: "11111111-1111-1111-1111-111111111111", slug: "acme", name: "Acme Fibre" };
const SESSION_ID = "33333333-3333-3333-3333-333333333333";
const STAFF_ID = "44444444-4444-4444-4444-444444444444";
const ADMIN_ID = "55555555-5555-5555-5555-555555555555";

const staffAuth = async () => ({
  authorization: `Bearer ${await signAccessToken({ sub: STAFF_ID, tenantId: TENANT.id, sessionId: SESSION_ID, roles: [] })}`,
});
const adminAuth = async () => ({
  authorization: `Bearer ${await signAccessToken({ sub: ADMIN_ID, tenantId: null, sessionId: SESSION_ID, roles: [] })}`,
});

const RUN: AutomationRunRecord = {
  job: JOB_NAMES.suspendOverdueCustomers,
  trigger: "schedule",
  startedAt: new Date(Date.now() - 60_000).toISOString(),
  finishedAt: new Date(Date.now() - 59_000).toISOString(),
  durationMs: 1000,
  ok: false,
  summary: { suspended: 12 },
  error: "router 10.0.0.1 timed out",
};

describe("automation routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    registerErrorHandler(app);
    await app.register(automationRoutes, { prefix: "/api/v1/automation" });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    h.auditEntries.length = 0;
    h.enqueueAutomationRunNow.mockClear();
    h.prisma.session.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      userId: STAFF_ID,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    }));
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
    // The heartbeat is fresh; every job's last run is the one failed suspension run above.
    h.redis.get.mockImplementation(async (key: string) => (key === AUTOMATION_KEYS.heartbeat ? new Date().toISOString() : null));
    h.redis.mget.mockImplementation(async (...keys: string[]) => keys.map(() => JSON.stringify(RUN)));
  });

  it("refuses an unauthenticated caller", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/automation/jobs" });
    expect(res.statusCode).toBe(401);
  });

  it("refuses tenant staff without settings.manage", async () => {
    h.getCachedPermissions.mockResolvedValue(new Set(["customers.read"]));
    const res = await app.inject({ method: "GET", url: "/api/v1/automation/jobs", headers: await staffAuth() });
    expect(res.statusCode).toBe(403);
  });

  it("shows a tenant operator schedule and health, but never platform-wide counters or errors", async () => {
    h.getCachedPermissions.mockResolvedValue(new Set(["settings.manage"]));
    const res = await app.inject({ method: "GET", url: "/api/v1/automation/jobs", headers: await staffAuth() });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.audience).toBe("tenant");
    expect(body.worker.online).toBe(true);
    // Platform-only jobs (settlements, trial expiry) are not listed for a tenant at all.
    const names = body.jobs.map((j: { name: string }) => j.name);
    expect(names).toContain(JOB_NAMES.suspendOverdueCustomers);
    expect(names).not.toContain(JOB_NAMES.runTenantPayouts);
    expect(names).not.toContain(JOB_NAMES.expireTrials);
    const suspend = body.jobs.find((j: { name: string }) => j.name === JOB_NAMES.suspendOverdueCustomers);
    expect(suspend.status).toBe("failed");
    expect(suspend.lastRun).toEqual({ trigger: "schedule", startedAt: RUN.startedAt, finishedAt: RUN.finishedAt, durationMs: 1000, ok: false });
    expect(JSON.stringify(body)).not.toContain('"summary"');
    expect(JSON.stringify(body)).not.toContain("timed out");
    expect(JSON.stringify(body)).not.toContain('"counters"');
  });

  it("gives a platform admin the full record for every job", async () => {
    h.getCachedPermissions.mockResolvedValue(new Set(["maintenance.manage"]));
    const res = await app.inject({ method: "GET", url: "/api/v1/automation/jobs", headers: await adminAuth() });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.audience).toBe("platform");
    expect(body.jobs).toHaveLength(AUTOMATION_JOBS.length);
    const suspend = body.jobs.find((j: { name: string }) => j.name === JOB_NAMES.suspendOverdueCustomers);
    expect(suspend.lastRun.summary).toEqual({ suspended: 12 });
    expect(suspend.lastRun.error).toBe("router 10.0.0.1 timed out");
    expect(suspend.counters.suspended).toBe("Customers suspended");
  });

  it("reports the worker offline when the heartbeat is stale, and a job as never run", async () => {
    h.getCachedPermissions.mockResolvedValue(new Set(["maintenance.manage"]));
    h.redis.get.mockResolvedValue(new Date(Date.now() - 10 * 60_000).toISOString());
    h.redis.mget.mockImplementation(async (...keys: string[]) => keys.map(() => null));
    const res = await app.inject({ method: "GET", url: "/api/v1/automation/jobs", headers: await adminAuth() });
    const body = res.json().data;
    expect(body.worker.online).toBe(false);
    expect(body.jobs.every((j: { status: string }) => j.status === "never")).toBe(true);
  });

  it("refuses a tenant operator trying to run a job now", async () => {
    h.getCachedPermissions.mockResolvedValue(new Set(["settings.manage"]));
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/automation/jobs/${JOB_NAMES.generateInvoices}/run`,
      headers: await staffAuth(),
    });
    expect(res.statusCode).toBe(403);
    expect(h.enqueueAutomationRunNow).not.toHaveBeenCalled();
  });

  it("queues a run for a platform admin and audits who asked", async () => {
    h.getCachedPermissions.mockResolvedValue(new Set(["maintenance.manage"]));
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/automation/jobs/${JOB_NAMES.generateInvoices}/run`,
      headers: await adminAuth(),
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().data).toMatchObject({ queued: true, workerOnline: true });
    expect(h.enqueueAutomationRunNow).toHaveBeenCalledWith(expect.objectContaining({ name: JOB_NAMES.generateInvoices }), ADMIN_ID);
    expect(h.auditEntries).toEqual([
      expect.objectContaining({ action: "automation.run_now", resourceId: JOB_NAMES.generateInvoices, actorUserId: ADMIN_ID }),
    ]);
  });

  it("404s an unknown job name instead of queueing garbage", async () => {
    h.getCachedPermissions.mockResolvedValue(new Set(["maintenance.manage"]));
    const res = await app.inject({ method: "POST", url: "/api/v1/automation/jobs/drop-all-tables/run", headers: await adminAuth() });
    expect(res.statusCode).toBe(404);
    expect(h.enqueueAutomationRunNow).not.toHaveBeenCalled();
  });
});
