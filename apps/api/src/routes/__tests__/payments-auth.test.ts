import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

/**
 * Route-level security for the payment gateway: who may call what, and whose data a route acts on.
 *
 * Only the data layer is faked (Prisma, Redis, and the payment services, which have their own
 * real-Postgres suite in packages/payments). The chain under test — authenticate → resolveTenant
 * → checkMaintenance → requirePermission → platform-user guard → handler — runs for real against
 * correctly signed access tokens.
 */

const h = vi.hoisted(() => {
  // Must exist before @mashupkgrid/config is first imported by the routes.
  process.env["MPESA_CALLBACK_TOKEN"] = "callback-secret-0123456789";
  return {
    prisma: {
      session: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
      tenant: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
      tenantPayout: { findUnique: vi.fn() },
      mpesaStkRequest: { findUnique: vi.fn(), findFirst: vi.fn() },
      paymentWebhookEvent: { findUnique: vi.fn() },
    },
    getCachedPermissions: vi.fn(),
    applySettlementResult: vi.fn(),
    payments: {
      getPlatformPaymentsOverview: vi.fn().mockResolvedValue({ ok: true }),
      approveSettlement: vi.fn(),
      getGatewayTransactionDetail: vi.fn().mockResolvedValue({ id: "t" }),
      listGatewayTransactions: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      setActiveDestination: vi.fn(),
      requestSettlement: vi.fn(),
      handleStkCallback: vi.fn().mockResolvedValue({ handled: false }),
      logWebhookReceived: vi.fn().mockResolvedValue("evt-1"),
      finishWebhookEvent: vi.fn().mockResolvedValue(undefined),
      tryCompleteOnboardingFeeCallback: vi.fn().mockResolvedValue(false),
      tryCompleteSubscriptionPaymentCallback: vi.fn().mockResolvedValue(false),
      tryCompleteDonationCallback: vi.fn().mockResolvedValue(false),
    },
  };
});

vi.mock("@mashupkgrid/database", () => ({ prisma: h.prisma }));
vi.mock("../../lib/redis.js", () => ({ redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }));
vi.mock("../../lib/permission-cache.js", () => ({ getCachedPermissions: h.getCachedPermissions }));
vi.mock("../../lib/maintenance-state.js", () => ({
  getCurrentMaintenanceState: vi.fn().mockResolvedValue({ enabled: false, level: 1, allowedIps: [], allowedRoles: [] }),
}));
vi.mock("../../lib/audit.js", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../lib/queue.js", () => ({
  enqueueSendPaymentConfirmationEmail: vi.fn(),
  enqueueSendWhatsappVoucher: vi.fn(),
}));
vi.mock("../../lib/webhooks.js", () => ({ emitWebhookEvent: vi.fn() }));
// The real module, with the service functions these tests observe replaced by spies.
vi.mock("@mashupkgrid/payments", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...h.payments,
  applySettlementResult: h.applySettlementResult,
}));

import { signAccessToken } from "@mashupkgrid/auth";
import { registerErrorHandler } from "../../plugins/error-handler.js";
import { platformPaymentRoutes } from "../platform-payments.js";
import { tenantPaymentRoutes } from "../tenant-payments.js";
import { mpesaRoutes } from "../mpesa.js";

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";
const SESSION_ID = "33333333-3333-3333-3333-333333333333";
const USER_ID = "44444444-4444-4444-4444-444444444444";
const SETTLEMENT_ID = "55555555-5555-5555-5555-555555555555";

const tenantUser = () => signAccessToken({ sub: USER_ID, tenantId: TENANT_A, sessionId: SESSION_ID, roles: [] });
const platformUser = () => signAccessToken({ sub: USER_ID, tenantId: null, sessionId: SESSION_ID, roles: [] });
const bearer = async (token: Promise<string>) => ({ authorization: `Bearer ${await token}` });

describe("payment gateway route security", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    registerErrorHandler(app);
    await app.register(platformPaymentRoutes, { prefix: "/api/v1/platform/payments" });
    await app.register(tenantPaymentRoutes, { prefix: "/api/v1/tenant-payments" });
    await app.register(mpesaRoutes, { prefix: "/api/v1/payments/mpesa" });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    h.prisma.session.findUnique.mockResolvedValue({
      id: SESSION_ID,
      userId: USER_ID,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    h.prisma.tenant.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      [TENANT_A, TENANT_B].includes(where.id)
        ? { id: where.id, name: "ISP", slug: "isp", status: "ACTIVE", deletedAt: null, disabledFeatures: [], subscription: null, trialEndsAt: null }
        : null
    );
    h.payments.logWebhookReceived.mockResolvedValue("evt-1");
    h.payments.handleStkCallback.mockResolvedValue({ handled: false });
    for (const fn of [h.payments.tryCompleteOnboardingFeeCallback, h.payments.tryCompleteSubscriptionPaymentCallback, h.payments.tryCompleteDonationCallback]) {
      fn.mockResolvedValue(false);
    }
    h.payments.getPlatformPaymentsOverview.mockResolvedValue({ ok: true });
    h.payments.getGatewayTransactionDetail.mockResolvedValue({ id: "t" });
    h.payments.listGatewayTransactions.mockResolvedValue({ items: [], total: 0 });
  });

  // --- Super Admin routes ------------------------------------------------------------------------
  it("rejects an unauthenticated caller", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/platform/payments/overview" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a TENANT user from platform routes even if their role somehow held the permission", async () => {
    h.getCachedPermissions.mockResolvedValue(new Set(["platform_payments.read", "platform_payments.manage", "settlements.approve"]));
    const res = await app.inject({ method: "GET", url: "/api/v1/platform/payments/overview", headers: await bearer(tenantUser()) });
    expect(res.statusCode).toBe(403);
    expect(h.payments.getPlatformPaymentsOverview).not.toHaveBeenCalled();
  });

  it("rejects a platform user without the payments permission", async () => {
    h.getCachedPermissions.mockResolvedValue(new Set(["tenants.read"]));
    const res = await app.inject({ method: "GET", url: "/api/v1/platform/payments/overview", headers: await bearer(platformUser()) });
    expect(res.statusCode).toBe(403);
  });

  it("allows a platform user with platform_payments.read", async () => {
    h.getCachedPermissions.mockResolvedValue(new Set(["platform_payments.read"]));
    const res = await app.inject({ method: "GET", url: "/api/v1/platform/payments/overview", headers: await bearer(platformUser()) });
    expect(res.statusCode).toBe(200);
  });

  it("16. refuses a settlement approval from an admin who can only view payments", async () => {
    h.getCachedPermissions.mockResolvedValue(new Set(["platform_payments.read"]));
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/platform/payments/settlements/${SETTLEMENT_ID}/approve`,
      headers: await bearer(platformUser()),
    });
    expect(res.statusCode).toBe(403);
    expect(h.payments.approveSettlement).not.toHaveBeenCalled();
  });

  it("16b. refuses to mark a settlement settled without settlements.approve", async () => {
    h.getCachedPermissions.mockResolvedValue(new Set(["platform_payments.read", "platform_payments.manage"]));
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/platform/payments/settlements/${SETTLEMENT_ID}/resolve`,
      headers: await bearer(platformUser()),
      payload: { outcome: "SETTLED", reference: "X", notes: "done" },
    });
    expect(res.statusCode).toBe(403);
  });

  // --- Tenant routes -----------------------------------------------------------------------------
  it("6. scopes tenant reads to the caller's own tenant, ignoring any tenantId in the request", async () => {
    h.getCachedPermissions.mockResolvedValue(new Set(["payments.read"]));
    const txnId = "66666666-6666-6666-6666-666666666666";
    await app.inject({
      method: "GET",
      url: `/api/v1/tenant-payments/transactions/${txnId}?tenantId=${TENANT_B}`,
      headers: await bearer(tenantUser()),
    });
    expect(h.payments.getGatewayTransactionDetail).toHaveBeenCalledWith(txnId, TENANT_A);

    await app.inject({ method: "GET", url: `/api/v1/tenant-payments/transactions?tenantId=${TENANT_B}`, headers: await bearer(tenantUser()) });
    expect(h.payments.listGatewayTransactions).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT_A }));
  });

  it("17. only staff with settlement_destinations.manage can change where money goes", async () => {
    h.getCachedPermissions.mockResolvedValue(new Set(["payments.read", "settlements.request"]));
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/tenant-payments/destination",
      headers: await bearer(tenantUser()),
      payload: { type: "MPESA_PHONE", accountName: "Attacker", phone: "0799999999" },
    });
    expect(res.statusCode).toBe(403);
    expect(h.payments.setActiveDestination).not.toHaveBeenCalled();
  });

  it("rejects a malformed destination before it reaches the service", async () => {
    h.getCachedPermissions.mockResolvedValue(new Set(["settlement_destinations.manage"]));
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/tenant-payments/destination",
      headers: await bearer(tenantUser()),
      payload: { type: "WIRE_TRANSFER", accountName: "X" },
    });
    expect(res.statusCode).toBe(422);
    expect(h.payments.setActiveDestination).not.toHaveBeenCalled();
  });

  it("a platform user cannot act on tenant payment routes (no tenant on the token)", async () => {
    h.getCachedPermissions.mockResolvedValue(new Set(["payments.read", "settlements.request"]));
    const res = await app.inject({ method: "POST", url: "/api/v1/tenant-payments/settlements", headers: await bearer(platformUser()) });
    expect(res.statusCode).toBe(403);
    expect(h.payments.requestSettlement).not.toHaveBeenCalled();
  });

  // --- Webhooks ----------------------------------------------------------------------------------
  it("15. drops a callback without the shared token: acknowledged, logged as REJECTED, never processed", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/payments/mpesa/callback",
      payload: { Body: { stkCallback: { CheckoutRequestID: "ws_CO_x", ResultCode: 0 } } },
    });
    expect(res.statusCode).toBe(200);
    expect(h.payments.handleStkCallback).not.toHaveBeenCalled();
    expect(h.payments.finishWebhookEvent).toHaveBeenCalledWith("evt-1", expect.objectContaining({ status: "REJECTED" }));
  });

  it("15b. processes a callback carrying the right token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/payments/mpesa/callback?token=callback-secret-0123456789",
      payload: { Body: { stkCallback: { CheckoutRequestID: "ws_CO_x", ResultCode: 0 } } },
    });
    expect(res.statusCode).toBe(200);
    expect(h.payments.handleStkCallback).toHaveBeenCalledTimes(1);
  });

  it("15c. rejects a forged settlement result without the token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/payments/mpesa/payout/result",
      payload: { Result: { ResultCode: 0, OriginatorConversationID: "STL-anything", TransactionID: "FAKE" } },
    });
    expect(res.statusCode).toBe(200);
    expect(h.applySettlementResult).not.toHaveBeenCalled();
  });
});
