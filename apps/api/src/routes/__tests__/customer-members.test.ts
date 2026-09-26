import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

/** Family and business accounts: a member sees the holder's account, pays only when allowed,
 *  and can't make holder-only changes. Invite links make a login once, then stop working. */

const h = vi.hoisted(() => ({
  prisma: {
    session: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    tenant: { findUnique: vi.fn() },
    customer: { findFirst: vi.fn() },
    customerMember: { findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    invoice: { findFirst: vi.fn() },
    customerService: { findFirst: vi.fn() },
    user: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
  },
  payments: { initiateStkPushForCustomer: vi.fn(), getStkRequestOrThrow: vi.fn(), queryAndReconcileStkRequest: vi.fn() },
  createSession: vi.fn(),
  assignDefaultCustomerRole: vi.fn(),
  auditEntries: [] as Array<Record<string, unknown>>,
}));

vi.mock("@mashupkgrid/database", () => ({ prisma: h.prisma }));
vi.mock("@mashupkgrid/payments", () => h.payments);
vi.mock("@mashupkgrid/billing", () => ({ getOrCreateWallet: vi.fn(), listWalletTransactions: vi.fn() }));
vi.mock("@mashupkgrid/radius", () => ({ getRadiusUserByCustomerServiceOrThrow: vi.fn(), getDecryptedRadiusPassword: vi.fn() }));
vi.mock("@mashupkgrid/sms", () => ({ sendTenantSms: vi.fn() }));
vi.mock("@mashupkgrid/auth", async (orig) => ({ ...(await orig<Record<string, unknown>>()), revokeAllSessionsForUser: vi.fn(), createSession: h.createSession }));
vi.mock("@mashupkgrid/support", () => ({ createTicket: vi.fn(), listTickets: vi.fn(), getCustomerVisibleMessages: vi.fn(), addTicketMessage: vi.fn() }));
vi.mock("../../services/auth.service.js", () => ({ assignDefaultCustomerRole: h.assignDefaultCustomerRole }));
vi.mock("../auth.js", () => ({ setRefreshCookie: vi.fn() }));
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
import { customerMemberRoutes } from "../customer-members.js";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const SESSION_ID = "33333333-3333-3333-3333-333333333333";
const USER_ID = "44444444-4444-4444-4444-444444444444";
const CUSTOMER_ID = "55555555-5555-5555-5555-555555555555";
const INVOICE_ID = "66666666-6666-6666-6666-666666666666";
const SUB_ID = "77777777-7777-7777-7777-777777777777";
const CODE = "AbCdEfGhIjKlMnOpQrSt";

const holderCustomer = { id: CUSTOMER_ID, tenantId: TENANT_ID, phone: "+254700000001", fullName: "Jane Wanjiku", deletedAt: null };
const auth = async () => ({ authorization: `Bearer ${await signAccessToken({ sub: USER_ID, tenantId: TENANT_ID, sessionId: SESSION_ID, roles: [] })}` });
const asMember = (canPay: boolean) => {
  h.prisma.customer.findFirst.mockResolvedValue(null);
  h.prisma.customerMember.findFirst.mockResolvedValue({ id: "m1", name: "Kevin", canPay, customer: holderCustomer });
};

describe("family and business accounts", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    registerErrorHandler(app);
    await app.register(meRoutes, { prefix: "/api/v1/me" });
    await app.register(customerMemberRoutes, { prefix: "/api/v1" });
    await app.ready();
  });
  afterAll(() => app.close());

  beforeEach(() => {
    vi.clearAllMocks();
    h.auditEntries.length = 0;
    h.prisma.session.findUnique.mockResolvedValue({ id: SESSION_ID, userId: USER_ID, revokedAt: null, expiresAt: new Date(Date.now() + 60_000) });
    h.prisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, slug: "acme", name: "Acme", status: "ACTIVE", deletedAt: null, brandColor: null, logoUrl: null, disabledFeatures: [], trialEndsAt: null, subscription: null });
    h.prisma.invoice.findFirst.mockResolvedValue({ id: INVOICE_ID, status: "PENDING", totalMinor: 150000, amountPaidMinor: 0 });
    h.payments.initiateStkPushForCustomer.mockResolvedValue({ id: "stk1", checkoutRequestId: "ws_CO_1" });
  });

  it("shows a member the holder's account and what they may do", async () => {
    asMember(false);
    const res = await app.inject({ method: "GET", url: "/api/v1/me/customer", headers: await auth() });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ id: CUSTOMER_ID, access: { role: "member", canPay: false, name: "Kevin" } });
  });

  it("refuses payment from a member who isn't allowed to pay", async () => {
    asMember(false);
    const res = await app.inject({ method: "POST", url: `/api/v1/me/invoices/${INVOICE_ID}/pay`, headers: await auth(), payload: {} });
    expect(res.statusCode).toBe(403);
    expect(h.payments.initiateStkPushForCustomer).not.toHaveBeenCalled();
  });

  it("lets an allowed member pay the account's bill", async () => {
    asMember(true);
    const res = await app.inject({ method: "POST", url: `/api/v1/me/invoices/${INVOICE_ID}/pay`, headers: await auth(), payload: {} });
    expect(res.statusCode).toBe(201);
    expect(h.payments.initiateStkPushForCustomer.mock.calls[0]![1]).toMatchObject({ customerId: CUSTOMER_ID, initiatedByUserId: USER_ID });
  });

  it("keeps the router password, pausing and members with the holder", async () => {
    asMember(true);
    const headers = await auth();
    for (const [method, url] of [
      ["POST", `/api/v1/me/subscriptions/${SUB_ID}/reveal-pppoe-password`],
      ["POST", `/api/v1/me/subscriptions/${SUB_ID}/resume`],
      ["GET", "/api/v1/me/members"],
    ] as const) {
      const res = await app.inject({ method, url, headers, payload: method === "POST" ? {} : undefined });
      expect(res.statusCode, url).toBe(403);
    }
  });

  it("turns an invite into a login linked to the member", async () => {
    h.prisma.customerMember.findUnique.mockResolvedValue({
      id: "m1", tenantId: TENANT_ID, userId: null, phone: "+254700000002", inviteExpiresAt: new Date(Date.now() + 60_000),
      customer: { id: CUSTOMER_ID, fullName: "Jane Wanjiku", deletedAt: null }, tenant: { name: "Acme", slug: "acme", status: "ACTIVE", deletedAt: null },
    });
    h.prisma.user.findFirst.mockResolvedValue(null);
    h.prisma.user.create.mockResolvedValue({ id: "u2" });
    h.prisma.customerMember.updateMany.mockResolvedValue({ count: 1 });
    h.createSession.mockResolvedValue({ accessToken: "tok", refreshToken: "ref", expiresInSeconds: 900 });

    const res = await app.inject({ method: "POST", url: `/api/v1/join/${CODE}`, payload: { email: "Kid@Example.com", password: "sunshine-2026" } });
    expect(res.statusCode).toBe(201);
    expect(h.prisma.user.create.mock.calls[0]![0].data).toMatchObject({ tenantId: TENANT_ID, email: "kid@example.com", status: "ACTIVE" });
    expect(h.assignDefaultCustomerRole).toHaveBeenCalledWith("u2", TENANT_ID);
    // Linking only succeeds while the invite is still unused, and spends the code.
    expect(h.prisma.customerMember.updateMany.mock.calls[0]![0]).toMatchObject({ where: { id: "m1", userId: null }, data: { userId: "u2", inviteCode: null } });
  });

  it("rejects a used or expired invite", async () => {
    h.prisma.customerMember.findUnique.mockResolvedValue({
      id: "m1", tenantId: TENANT_ID, userId: null, inviteExpiresAt: new Date(Date.now() - 1000),
      customer: { deletedAt: null }, tenant: { status: "ACTIVE", deletedAt: null },
    });
    expect((await app.inject({ method: "GET", url: `/api/v1/join/${CODE}` })).statusCode).toBe(404);
    h.prisma.customerMember.findUnique.mockResolvedValue({ id: "m1", userId: "u2", inviteExpiresAt: new Date(Date.now() + 60_000), customer: { deletedAt: null }, tenant: { status: "ACTIVE", deletedAt: null } });
    expect((await app.inject({ method: "POST", url: `/api/v1/join/${CODE}`, payload: { email: "a@b.co", password: "sunshine-2026" } })).statusCode).toBe(404);
  });
});
