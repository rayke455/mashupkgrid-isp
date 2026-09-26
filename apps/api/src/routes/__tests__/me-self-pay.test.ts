import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

/** A subscriber paying their own bill: the amount is the invoice's balance (never the request's),
 *  the invoice must be theirs, and they can only watch their own prompts. */

const h = vi.hoisted(() => ({
  prisma: {
    session: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    tenant: { findUnique: vi.fn() },
    customer: { findFirst: vi.fn() },
    invoice: { findFirst: vi.fn() },
  },
  payments: {
    initiateStkPushForCustomer: vi.fn(),
    getStkRequestOrThrow: vi.fn(),
    queryAndReconcileStkRequest: vi.fn(),
  },
  activatePaidAddOns: vi.fn().mockResolvedValue([]),
  auditEntries: [] as Array<Record<string, unknown>>,
}));

vi.mock("@mashupkgrid/database", () => ({ prisma: h.prisma }));
vi.mock("@mashupkgrid/payments", () => h.payments);
vi.mock("@mashupkgrid/billing", () => ({ getOrCreateWallet: vi.fn(), listWalletTransactions: vi.fn(), activatePaidAddOns: h.activatePaidAddOns }));
vi.mock("@mashupkgrid/auth", async (orig) => ({ ...(await orig<Record<string, unknown>>()), revokeAllSessionsForUser: vi.fn() }));
vi.mock("@mashupkgrid/support", () => ({ createTicket: vi.fn(), listTickets: vi.fn(), getCustomerVisibleMessages: vi.fn(), addTicketMessage: vi.fn() }));
vi.mock("../../lib/redis.js", () => ({ redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }));
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
import { meRoutes } from "../me.js";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const SESSION_ID = "33333333-3333-3333-3333-333333333333";
const USER_ID = "44444444-4444-4444-4444-444444444444";
const CUSTOMER_ID = "55555555-5555-5555-5555-555555555555";
const INVOICE_ID = "66666666-6666-6666-6666-666666666666";

const auth = async () => ({ authorization: `Bearer ${await signAccessToken({ sub: USER_ID, tenantId: TENANT_ID, sessionId: SESSION_ID, roles: [] })}` });

describe("customer self-pay", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    registerErrorHandler(app);
    await app.register(meRoutes, { prefix: "/api/v1/me" });
    await app.ready();
  });
  afterAll(() => app.close());

  beforeEach(() => {
    vi.clearAllMocks();
    h.auditEntries.length = 0;
    h.prisma.session.findUnique.mockResolvedValue({ id: SESSION_ID, userId: USER_ID, revokedAt: null, expiresAt: new Date(Date.now() + 60_000) });
    h.prisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, slug: "acme", name: "Acme", status: "ACTIVE", deletedAt: null, brandColor: null, logoUrl: null, disabledFeatures: [], trialEndsAt: null, subscription: null });
    h.prisma.customer.findFirst.mockResolvedValue({ id: CUSTOMER_ID, tenantId: TENANT_ID, phone: "+254700000001" });
    h.prisma.invoice.findFirst.mockResolvedValue({ id: INVOICE_ID, status: "OVERDUE", totalMinor: 150000, amountPaidMinor: 50000 });
    h.payments.initiateStkPushForCustomer.mockResolvedValue({ id: "stk1", checkoutRequestId: "ws_CO_1" });
  });

  it("prompts the customer's own phone for exactly the remaining balance", async () => {
    const res = await app.inject({ method: "POST", url: `/api/v1/me/invoices/${INVOICE_ID}/pay`, headers: await auth(), payload: {} });
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toEqual({ checkoutRequestId: "ws_CO_1", amountMinor: 100000 });
    expect(h.payments.initiateStkPushForCustomer).toHaveBeenCalledWith(TENANT_ID, {
      customerId: CUSTOMER_ID,
      invoiceId: INVOICE_ID,
      phone: "+254700000001",
      amountMinor: 100000,
      initiatedByUserId: USER_ID,
    });
    // The invoice lookup is pinned to the caller's customer id, never the request's.
    expect(h.prisma.invoice.findFirst.mock.calls[0]![0].where).toMatchObject({ id: INVOICE_ID, customerId: CUSTOMER_ID });
    expect(h.auditEntries[0]).toMatchObject({ action: "mpesa.stk_push_initiated", after: expect.objectContaining({ selfService: true }) });
  });

  it("lets them choose a different phone, and refuses a paid invoice", async () => {
    await app.inject({ method: "POST", url: `/api/v1/me/invoices/${INVOICE_ID}/pay`, headers: await auth(), payload: { phone: "0711222333" } });
    expect(h.payments.initiateStkPushForCustomer.mock.calls[0]![1].phone).toBe("0711222333");

    h.prisma.invoice.findFirst.mockResolvedValue({ id: INVOICE_ID, status: "PAID", totalMinor: 1000, amountPaidMinor: 1000 });
    const res = await app.inject({ method: "POST", url: `/api/v1/me/invoices/${INVOICE_ID}/pay`, headers: await auth(), payload: {} });
    expect(res.statusCode).toBe(409);
  });

  it("only shows the customer their own prompt", async () => {
    h.payments.getStkRequestOrThrow.mockResolvedValue({ customerId: "someone-else", status: "COMPLETED" });
    const res = await app.inject({ method: "GET", url: "/api/v1/me/payments/ws_CO_1", headers: await auth() });
    expect(res.statusCode).toBe(404);

    h.payments.getStkRequestOrThrow.mockResolvedValue({ customerId: CUSTOMER_ID, status: "COMPLETED", resultDesc: "ok", mpesaReceiptNumber: "QWE123", amountMinor: 100000 });
    const ok = await app.inject({ method: "GET", url: "/api/v1/me/payments/ws_CO_1", headers: await auth() });
    expect(ok.json().data).toMatchObject({ status: "COMPLETED", mpesaReceiptNumber: "QWE123" });
    expect(h.payments.queryAndReconcileStkRequest).not.toHaveBeenCalled();
    // A completed payment starts any add-on it paid for straight away.
    expect(h.activatePaidAddOns).toHaveBeenCalledWith({ customerId: CUSTOMER_ID });
  });
});
