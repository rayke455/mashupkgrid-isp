import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

/**
 * Deleting payment records is the one place where "clean up the noise" and "hide the money"
 * are a single permission apart, so the rules are pinned: never a COMPLETED payment, never one a
 * gateway transaction hangs off, always tenant-scoped, always audited, and it takes
 * payments.refund — the same trust as reversing money.
 */

const h = vi.hoisted(() => ({
  prisma: {
    session: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    tenant: { findUnique: vi.fn() },
    payment: { findFirst: vi.fn(), delete: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({ count: 4 }) },
  },
  getCachedPermissions: vi.fn(),
  purge: vi.fn().mockResolvedValue({ mpesa: 12, gateway: 3 }),
  deleteAttempt: vi.fn().mockResolvedValue(true),
  auditEntries: [] as Array<Record<string, unknown>>,
}));

vi.mock("@mashupkgrid/database", () => ({ prisma: h.prisma }));
vi.mock("@mashupkgrid/billing", () => ({ recordPaymentForInvoice: vi.fn(), topUpWallet: vi.fn(), refundPaymentWithDb: vi.fn(), getStampedPaymentReceipt: vi.fn() }));
vi.mock("@mashupkgrid/payments", () => ({
  listPurchaseAttempts: vi.fn(),
  summarisePurchaseAttempts: vi.fn(),
  reverseGatewayTransactionForPayment: vi.fn(),
  purgePurchaseAttempts: h.purge,
  deletePurchaseAttempt: h.deleteAttempt,
}));
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
import { paymentRoutes } from "../payments.js";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const SESSION_ID = "33333333-3333-3333-3333-333333333333";
const USER_ID = "44444444-4444-4444-4444-444444444444";
const PAYMENT_ID = "77777777-7777-7777-7777-777777777777";

const auth = async () => ({ authorization: `Bearer ${await signAccessToken({ sub: USER_ID, tenantId: TENANT_ID, sessionId: SESSION_ID, roles: [] })}` });

describe("payment housekeeping", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    registerErrorHandler(app);
    await app.register(paymentRoutes, { prefix: "/api/v1/payments" });
    await app.ready();
  });
  afterAll(() => app.close());

  beforeEach(() => {
    h.auditEntries.length = 0;
    h.prisma.payment.delete.mockClear();
    h.prisma.payment.deleteMany.mockClear();
    h.prisma.session.findUnique.mockResolvedValue({ id: SESSION_ID, userId: USER_ID, revokedAt: null, expiresAt: new Date(Date.now() + 60_000) });
    h.prisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, slug: "acme", name: "Acme", status: "ACTIVE", deletedAt: null, brandColor: null, logoUrl: null, disabledFeatures: [], trialEndsAt: null, subscription: null });
    h.getCachedPermissions.mockResolvedValue(new Set(["payments.read", "payments.refund"]));
  });

  it("deletes a failed payment and records what it was", async () => {
    h.prisma.payment.findFirst.mockResolvedValue({ id: PAYMENT_ID, status: "FAILED", amountMinor: 5000, method: "MPESA", reference: "ws_CO_1", createdAt: new Date(), gatewayTransaction: null });
    const res = await app.inject({ method: "DELETE", url: `/api/v1/payments/${PAYMENT_ID}`, headers: await auth() });
    expect(res.statusCode).toBe(200);
    expect(h.prisma.payment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: PAYMENT_ID, tenantId: TENANT_ID } }));
    expect(h.prisma.payment.delete).toHaveBeenCalledWith({ where: { id: PAYMENT_ID } });
    expect(h.auditEntries[0]).toMatchObject({ action: "payment.deleted", before: { status: "FAILED", amountMinor: 5000 } });
  });

  it("refuses to delete a completed payment — that is a refund, not a deletion", async () => {
    h.prisma.payment.findFirst.mockResolvedValue({ id: PAYMENT_ID, status: "COMPLETED", gatewayTransaction: null });
    const res = await app.inject({ method: "DELETE", url: `/api/v1/payments/${PAYMENT_ID}`, headers: await auth() });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toMatch(/refund/i);
    expect(h.prisma.payment.delete).not.toHaveBeenCalled();
  });

  it("refuses a failed payment that a gateway transaction hangs off", async () => {
    h.prisma.payment.findFirst.mockResolvedValue({ id: PAYMENT_ID, status: "FAILED", gatewayTransaction: { id: "g1" } });
    const res = await app.inject({ method: "DELETE", url: `/api/v1/payments/${PAYMENT_ID}`, headers: await auth() });
    expect(res.statusCode).toBe(409);
    expect(h.prisma.payment.delete).not.toHaveBeenCalled();
  });

  it("bulk-purges only failed/pending payments older than the cut-off, without gateway links", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/payments/cleanup", headers: await auth(), payload: { olderThanDays: 30 } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.deleted).toBe(4);
    const where = h.prisma.payment.deleteMany.mock.calls[0]![0].where;
    expect(where.tenantId).toBe(TENANT_ID);
    expect(where.status.in).toEqual(["FAILED", "PENDING"]);
    expect(where.gatewayTransaction).toBeNull();
    expect(h.auditEntries[0]).toMatchObject({ action: "payments.failed_purged", after: { olderThanDays: 30, deleted: 4 } });
  });

  it("purges purchase attempts through the service and reports both sources", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/payments/purchase-attempts/cleanup", headers: await auth(), payload: { olderThanDays: 7 } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ deleted: 15, mpesa: 12, gateway: 3 });
    expect(h.purge).toHaveBeenCalledWith(TENANT_ID, expect.objectContaining({ olderThanDays: 7 }));
  });

  it("needs payments.refund, not just payments.read", async () => {
    h.getCachedPermissions.mockResolvedValue(new Set(["payments.read"]));
    const res = await app.inject({ method: "POST", url: "/api/v1/payments/cleanup", headers: await auth(), payload: {} });
    expect(res.statusCode).toBe(403);
    expect(h.prisma.payment.deleteMany).not.toHaveBeenCalled();
  });
});
