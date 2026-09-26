import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

/** "Extend days" must actually keep the customer online: the billing date moves, every open
 *  invoice's due date moves with it (an OVERDUE invoice is what suspends someone), and a
 *  suspended line is reactivated. Tenant-scoped through getSubscriptionOrThrow. */

const h = vi.hoisted(() => ({
  prisma: {
    session: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    tenant: { findUnique: vi.fn() },
    $transaction: vi.fn(),
    customerService: { update: vi.fn() },
    invoice: { findMany: vi.fn(), update: vi.fn().mockResolvedValue({}) },
  },
  billing: {
    subscribeCustomerToPackage: vi.fn(),
    cancelSubscription: vi.fn(),
    suspendSubscription: vi.fn(),
    reactivateSubscription: vi.fn(),
    getSubscriptionOrThrow: vi.fn(),
  },
  getCachedPermissions: vi.fn(),
  auditEntries: [] as Array<Record<string, unknown>>,
}));

vi.mock("@mashupkgrid/database", () => ({ prisma: h.prisma }));
vi.mock("@mashupkgrid/billing", () => h.billing);
vi.mock("../../lib/redis.js", () => ({ redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }));
vi.mock("../../lib/permission-cache.js", () => ({ getCachedPermissions: h.getCachedPermissions }));
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
import { subscriptionRoutes } from "../subscriptions.js";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const SESSION_ID = "33333333-3333-3333-3333-333333333333";
const USER_ID = "44444444-4444-4444-4444-444444444444";
const SUB_ID = "66666666-6666-6666-6666-666666666666";
const DAY = 24 * 60 * 60_000;

const auth = async () => ({ authorization: `Bearer ${await signAccessToken({ sub: USER_ID, tenantId: TENANT_ID, sessionId: SESSION_ID, roles: [] })}` });

describe("POST /subscriptions/:id/extend", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    registerErrorHandler(app);
    await app.register(subscriptionRoutes, { prefix: "/api/v1/subscriptions" });
    await app.ready();
  });
  afterAll(() => app.close());

  beforeEach(() => {
    h.auditEntries.length = 0;
    vi.clearAllMocks();
    h.prisma.session.findUnique.mockResolvedValue({ id: SESSION_ID, userId: USER_ID, revokedAt: null, expiresAt: new Date(Date.now() + 60_000) });
    h.prisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, slug: "acme", name: "Acme", status: "ACTIVE", deletedAt: null, brandColor: null, logoUrl: null, disabledFeatures: [], trialEndsAt: null, subscription: null });
    h.getCachedPermissions.mockResolvedValue(new Set(["customer_services.manage"]));
    h.prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(h.prisma));
    h.prisma.customerService.update.mockImplementation(async ({ data }: { data: { nextBillingAt: Date } }) => ({ id: SUB_ID, status: "ACTIVE", nextBillingAt: data.nextBillingAt }));
  });

  it("moves the billing date and every open invoice forward, from today when already past", async () => {
    const past = new Date(Date.now() - 3 * DAY);
    h.billing.getSubscriptionOrThrow.mockResolvedValue({ id: SUB_ID, status: "ACTIVE", nextBillingAt: past });
    h.prisma.invoice.findMany.mockResolvedValue([{ id: "inv1", dueDate: past }]);

    const res = await app.inject({ method: "POST", url: `/api/v1/subscriptions/${SUB_ID}/extend`, headers: await auth(), payload: { days: 7, reason: "tower outage" } });
    expect(res.statusCode).toBe(200);
    const next = new Date(h.prisma.customerService.update.mock.calls[0]![0].data.nextBillingAt).getTime();
    expect(next).toBeGreaterThan(Date.now() + 6.9 * DAY);
    expect(next).toBeLessThan(Date.now() + 7.1 * DAY);
    const invoiceUpdate = h.prisma.invoice.update.mock.calls[0]![0];
    expect(invoiceUpdate.data.status).toBe("PENDING");
    expect(new Date(invoiceUpdate.data.dueDate).getTime()).toBeGreaterThan(Date.now() + 6.9 * DAY);
    expect(res.json().data).toMatchObject({ invoicesMoved: 1, reactivated: false });
    expect(h.billing.reactivateSubscription).not.toHaveBeenCalled();
    expect(h.auditEntries[0]).toMatchObject({ action: "subscription.extended", after: expect.objectContaining({ days: 7, reason: "tower outage", invoicesMoved: 1 }) });
  });

  it("adds to a future billing date rather than resetting it, and reactivates a suspended line", async () => {
    const future = new Date(Date.now() + 10 * DAY);
    h.billing.getSubscriptionOrThrow.mockResolvedValue({ id: SUB_ID, status: "SUSPENDED", nextBillingAt: future });
    h.billing.reactivateSubscription.mockResolvedValue({ id: SUB_ID, status: "ACTIVE", nextBillingAt: future });
    h.prisma.invoice.findMany.mockResolvedValue([]);

    const res = await app.inject({ method: "POST", url: `/api/v1/subscriptions/${SUB_ID}/extend`, headers: await auth(), payload: { days: 5 } });
    expect(res.statusCode).toBe(200);
    const next = new Date(h.prisma.customerService.update.mock.calls[0]![0].data.nextBillingAt).getTime();
    expect(Math.abs(next - (future.getTime() + 5 * DAY))).toBeLessThan(1000);
    expect(h.billing.reactivateSubscription).toHaveBeenCalledWith(TENANT_ID, SUB_ID);
    expect(res.json().data.reactivated).toBe(true);
  });

  it("refuses a cancelled subscription and an out-of-range day count", async () => {
    h.billing.getSubscriptionOrThrow.mockResolvedValue({ id: SUB_ID, status: "CANCELLED", nextBillingAt: new Date() });
    expect((await app.inject({ method: "POST", url: `/api/v1/subscriptions/${SUB_ID}/extend`, headers: await auth(), payload: { days: 3 } })).statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: `/api/v1/subscriptions/${SUB_ID}/extend`, headers: await auth(), payload: { days: 0 } })).statusCode).toBe(422);
    expect(h.prisma.customerService.update).not.toHaveBeenCalled();
  });
});
