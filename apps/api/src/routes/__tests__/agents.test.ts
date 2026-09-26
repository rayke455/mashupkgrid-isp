import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

/** An agent only ever works on their own record, and a suspended agent can't sell or collect. */

const h = vi.hoisted(() => ({
  prisma: {
    session: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    tenant: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    agent: { findFirst: vi.fn() },
    payment: { findFirst: vi.fn() },
    customer: { findUniqueOrThrow: vi.fn() },
  },
  billing: {
    sellAgentVoucher: vi.fn(),
    collectAgentPayment: vi.fn(),
    agentStock: vi.fn().mockResolvedValue([]),
    agentBalance: vi.fn().mockResolvedValue(0),
    agentStatement: vi.fn(),
    findCustomerForAgent: vi.fn(),
    issueAgentVouchers: vi.fn(),
    listAgentsWithTotals: vi.fn(),
    recordAgentRemittance: vi.fn(),
  },
  sms: vi.fn().mockResolvedValue({ delivered: true }),
}));

vi.mock("@mashupkgrid/database", () => ({ prisma: h.prisma }));
vi.mock("@mashupkgrid/billing", () => h.billing);
vi.mock("@mashupkgrid/sms", () => ({ sendTenantSms: h.sms }));
vi.mock("../../services/auth.service.js", () => ({ assignAgentRole: vi.fn() }));
vi.mock("../auth.js", () => ({ setRefreshCookie: vi.fn() }));
vi.mock("../../lib/redis.js", () => ({ redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }));
vi.mock("../../lib/maintenance-state.js", () => ({
  getCurrentMaintenanceState: vi.fn().mockResolvedValue({ enabled: false, level: 1, allowedIps: [], allowedRoles: [] }),
}));
vi.mock("../../lib/audit.js", () => ({ writeAuditLog: vi.fn() }));

import { signAccessToken } from "@mashupkgrid/auth";
import { registerErrorHandler } from "../../plugins/error-handler.js";
import { agentRoutes } from "../agents.js";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const SESSION_ID = "33333333-3333-3333-3333-333333333333";
const USER_ID = "44444444-4444-4444-4444-444444444444";
const AGENT_ID = "55555555-5555-5555-5555-555555555555";
const PKG_ID = "66666666-6666-6666-6666-666666666666";
const CUSTOMER_ID = "77777777-7777-7777-7777-777777777777";
const REQ_ID = "88888888-8888-4888-8888-888888888888";

const auth = async () => ({ authorization: `Bearer ${await signAccessToken({ sub: USER_ID, tenantId: TENANT_ID, sessionId: SESSION_ID, roles: [] })}` });
const agent = (status: "ACTIVE" | "SUSPENDED") => ({ id: AGENT_ID, tenantId: TENANT_ID, userId: USER_ID, name: "Mama Njeri Shop", status });

describe("agent routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    registerErrorHandler(app);
    await app.register(agentRoutes, { prefix: "/api/v1" });
    await app.ready();
  });
  afterAll(() => app.close());

  beforeEach(() => {
    vi.clearAllMocks();
    h.prisma.session.findUnique.mockResolvedValue({ id: SESSION_ID, userId: USER_ID, revokedAt: null, expiresAt: new Date(Date.now() + 60_000) });
    h.prisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, slug: "acme", name: "Acme", status: "ACTIVE", deletedAt: null, brandColor: null, logoUrl: null, disabledFeatures: [], trialEndsAt: null, subscription: null });
    h.prisma.tenant.findUniqueOrThrow.mockResolvedValue({ name: "Acme" });
    h.prisma.customer.findUniqueOrThrow.mockResolvedValue({ phone: "+254700000001" });
    h.prisma.payment.findFirst.mockResolvedValue(null);
  });

  it("sells from the signed-in agent's own stock and texts the code to the buyer", async () => {
    h.prisma.agent.findFirst.mockResolvedValue(agent("ACTIVE"));
    h.billing.sellAgentVoucher.mockResolvedValue({ sale: { id: "s1", commissionMinor: 500 }, code: "ABCD1234", package: { name: "Daily", priceMinor: 5000 } });
    const res = await app.inject({ method: "POST", url: "/api/v1/agent/vouchers/sell", headers: await auth(), payload: { hotspotPackageId: PKG_ID, buyerPhone: "0711000000" } });
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ code: "ABCD1234", commissionMinor: 500, smsSent: true });
    // The agent is looked up by the caller's own user id, never a client-supplied one.
    expect(h.prisma.agent.findFirst.mock.calls[0]![0].where).toEqual({ tenantId: TENANT_ID, userId: USER_ID });
    expect(h.billing.sellAgentVoucher).toHaveBeenCalledWith(TENANT_ID, AGENT_ID, PKG_ID, "0711000000");
    expect(h.sms.mock.calls[0]![2]).toContain("ABCD1234");
  });

  it("stops a suspended agent selling or collecting, but still shows their statement", async () => {
    h.prisma.agent.findFirst.mockResolvedValue(agent("SUSPENDED"));
    const headers = await auth();
    expect((await app.inject({ method: "POST", url: "/api/v1/agent/vouchers/sell", headers, payload: { hotspotPackageId: PKG_ID } })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/api/v1/agent/collections", headers, payload: { customerId: CUSTOMER_ID, amountMinor: 100000, requestId: REQ_ID } })).statusCode).toBe(403);
    h.billing.agentStatement.mockResolvedValue({ closingBalanceMinor: 0 });
    expect((await app.inject({ method: "GET", url: "/api/v1/agent/statement", headers })).statusCode).toBe(200);
    expect(h.billing.sellAgentVoucher).not.toHaveBeenCalled();
    expect(h.billing.collectAgentPayment).not.toHaveBeenCalled();
  });

  it("refuses to record the same collection twice", async () => {
    h.prisma.agent.findFirst.mockResolvedValue(agent("ACTIVE"));
    h.prisma.payment.findFirst.mockResolvedValue({ id: "p1" });
    const res = await app.inject({ method: "POST", url: "/api/v1/agent/collections", headers: await auth(), payload: { customerId: CUSTOMER_ID, amountMinor: 100000, requestId: REQ_ID } });
    expect(res.statusCode).toBe(409);
    expect(h.billing.collectAgentPayment).not.toHaveBeenCalled();
  });

  it("is a 404 for a login that isn't an agent", async () => {
    h.prisma.agent.findFirst.mockResolvedValue(null);
    expect((await app.inject({ method: "GET", url: "/api/v1/agent/me", headers: await auth() })).statusCode).toBe(404);
  });
});
