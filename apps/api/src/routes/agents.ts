import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma, type Agent } from "@mashupkgrid/database";
import { env } from "@mashupkgrid/config";
import { successResponse, ConflictError, ForbiddenError, NotFoundError, ValidationError, generateAlnumSecret } from "@mashupkgrid/shared";
import { createSession, hashPassword, isPasswordStrongEnough } from "@mashupkgrid/auth";
import {
  agentBalance,
  agentStatement,
  agentStock,
  collectAgentPayment,
  findCustomerForAgent,
  issueAgentVouchers,
  listAgentsWithTotals,
  recordAgentRemittance,
  sellAgentVoucher,
} from "@mashupkgrid/billing";
import { sendTenantSms } from "@mashupkgrid/sms";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { authRateLimitConfig } from "../plugins/rate-limit.js";
import { writeAuditLog } from "../lib/audit.js";
import { assignAgentRole } from "../services/auth.service.js";
import { setRefreshCookie } from "./auth.js";

/**
 * Agents: shops that sell hotspot vouchers and take customers' bill payments for a commission.
 * Staff manage them under /api/v1/agents; an agent works from /api/v1/agent (their own record
 * only, found by their user id); an invite link lets them set up their login.
 */

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;
const INVITE_DAYS = 14;
const agentParams = z.object({ agentId: z.string().uuid() });
const monthQuery = z.object({
  year: z.coerce.number().int().min(2020).max(2100).default(new Date().getUTCFullYear()),
  month: z.coerce.number().int().min(1).max(12).default(new Date().getUTCMonth() + 1),
});
const agentSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(9).max(15),
  location: z.string().trim().max(120).optional().nullable(),
  voucherCommissionPercent: z.number().int().min(0).max(50).default(10),
  collectionCommissionPercent: z.number().int().min(0).max(20).default(2),
});

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) throw new ConflictError("Agents belong to an ISP account");
  return tenantId;
}

const inviteUrl = (code: string) => `${env.APP_WEB_URL.replace(/\/$/, "")}/agent/join/${code}`;
const money = (minor: number) => `KES ${Math.round(minor / 100).toLocaleString("en-KE")}`;

async function sendInvite(tenantId: string, agent: Agent): Promise<boolean> {
  if (!agent.inviteCode) return false;
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true } });
  return sendTenantSms(tenantId, agent.phone, `${tenant.name}: you are now an agent. Set up your login to sell vouchers and take payments: ${inviteUrl(agent.inviteCode)}`)
    .then((r) => r.delivered)
    .catch(() => false);
}

/** The signed-in agent's own record. Suspended agents can still see their statement. */
async function resolveMyAgentOrThrow(request: FastifyRequest, forWriting: boolean): Promise<Agent> {
  const tenantId = requireTenant(request.user!.tenantId);
  const agent = await prisma.agent.findFirst({ where: { tenantId, userId: request.user!.id } });
  if (!agent) throw new NotFoundError("Agent account");
  if (forWriting && agent.status !== "ACTIVE") throw new ForbiddenError("Your agent account is suspended. Contact the ISP.");
  return agent;
}

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  const audit = (request: FastifyRequest, tenantId: string, action: string, resourceId: string, after?: object) =>
    writeAuditLog({ tenantId, actorUserId: request.user!.id, action, resourceType: "Agent", resourceId, after, ipAddress: request.ip, userAgent: request.headers["user-agent"] ?? null });

  // ---------------------------------------------------------------- Staff: /api/v1/agents
  const view = { config: { audience: "staff" as const }, preHandler: [...preHandler, requirePermission("payments.read")] };
  const manage = { config: { audience: "staff" as const }, preHandler: [...preHandler, requirePermission("staff.manage")] };

  app.get("/agents", view, async (request, reply) => {
    reply.send(successResponse(await listAgentsWithTotals(requireTenant(request.user!.tenantId)), request.id));
  });

  app.post("/agents", manage, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const body = agentSchema.parse(request.body);
    const agent = await prisma.agent.create({
      data: { tenantId, ...body, location: body.location ?? null, inviteCode: generateAlnumSecret(20), inviteExpiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) },
    });
    const smsSent = await sendInvite(tenantId, agent);
    await audit(request, tenantId, "agent.created", agent.id, { ...body, smsSent });
    reply.status(201).send(successResponse({ id: agent.id, inviteUrl: inviteUrl(agent.inviteCode!), smsSent }, request.id));
  });

  app.patch("/agents/:agentId", manage, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const { agentId } = agentParams.parse(request.params);
    const body = agentSchema.partial().extend({ status: z.enum(["ACTIVE", "SUSPENDED"]).optional() }).parse(request.body);
    const res = await prisma.agent.updateMany({ where: { id: agentId, tenantId }, data: body });
    if (res.count === 0) throw new NotFoundError("Agent");
    await audit(request, tenantId, "agent.updated", agentId, body);
    reply.send(successResponse({ updated: true }, request.id));
  });

  app.post("/agents/:agentId/invite", manage, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const { agentId } = agentParams.parse(request.params);
    const existing = await prisma.agent.findFirst({ where: { id: agentId, tenantId } });
    if (!existing) throw new NotFoundError("Agent");
    if (existing.userId) throw new ConflictError("This agent has already set up their login");
    const agent = await prisma.agent.update({ where: { id: agentId }, data: { inviteCode: generateAlnumSecret(20), inviteExpiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) } });
    const smsSent = await sendInvite(tenantId, agent);
    await audit(request, tenantId, "agent.reinvited", agentId, { smsSent });
    reply.send(successResponse({ inviteUrl: inviteUrl(agent.inviteCode!), smsSent }, request.id));
  });

  /** Makes new vouchers and puts them in the agent's stock. */
  app.post("/agents/:agentId/vouchers", { config: { audience: "staff" as const }, preHandler: [...preHandler, requirePermission("radius.manage")] }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const { agentId } = agentParams.parse(request.params);
    const body = z.object({ hotspotPackageId: z.string().uuid(), count: z.number().int().min(1).max(500) }).parse(request.body);
    const issued = await issueAgentVouchers(tenantId, agentId, body.hotspotPackageId, body.count, request.user!.id);
    await audit(request, tenantId, "agent.vouchers_issued", agentId, body);
    reply.status(201).send(successResponse({ issued, stock: await agentStock(agentId) }, request.id));
  });

  /** Money the agent handed over to the ISP. */
  app.post("/agents/:agentId/remittances", { config: { audience: "staff" as const }, preHandler: [...preHandler, requirePermission("payments.create")] }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const { agentId } = agentParams.parse(request.params);
    const body = z
      .object({ amountMinor: z.number().int().min(1), method: z.enum(["CASH", "MPESA", "BANK"]), reference: z.string().trim().max(100).optional(), note: z.string().trim().max(300).optional() })
      .parse(request.body);
    const remittance = await recordAgentRemittance(tenantId, agentId, body, request.user!.id);
    await audit(request, tenantId, "agent.remittance_recorded", agentId, body);
    reply.status(201).send(successResponse({ remittance, balanceMinor: await agentBalance(agentId) }, request.id));
  });

  app.get("/agents/:agentId/statement", view, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const { agentId } = agentParams.parse(request.params);
    const { year, month } = monthQuery.parse(request.query);
    const agent = await prisma.agent.findFirst({ where: { id: agentId, tenantId }, select: { id: true, name: true, phone: true, location: true, voucherCommissionPercent: true, collectionCommissionPercent: true } });
    if (!agent) throw new NotFoundError("Agent");
    reply.send(successResponse({ agent, stock: await agentStock(agentId), ...(await agentStatement(agentId, year, month)) }, request.id));
  });

  // ---------------------------------------------------------------- Agent: /api/v1/agent
  const own = { config: { audience: "customer" as const }, preHandler: [...preHandler] };

  app.get("/agent/me", own, async (request, reply) => {
    const agent = await resolveMyAgentOrThrow(request, false);
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: agent.tenantId }, select: { name: true } });
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const today = await prisma.agentSale.aggregate({ where: { agentId: agent.id, createdAt: { gte: dayStart } }, _sum: { amountMinor: true, commissionMinor: true }, _count: { _all: true } });
    reply.send(
      successResponse(
        {
          id: agent.id,
          name: agent.name,
          isp: tenant.name,
          status: agent.status,
          voucherCommissionPercent: agent.voucherCommissionPercent,
          collectionCommissionPercent: agent.collectionCommissionPercent,
          stock: await agentStock(agent.id),
          balanceMinor: await agentBalance(agent.id),
          today: { sales: today._count._all, takenMinor: today._sum.amountMinor ?? 0, commissionMinor: today._sum.commissionMinor ?? 0 },
        },
        request.id
      )
    );
  });

  app.post("/agent/vouchers/sell", { ...own, config: { audience: "customer" as const, maintenanceCategory: "payment" } }, async (request, reply) => {
    const agent = await resolveMyAgentOrThrow(request, true);
    const body = z.object({ hotspotPackageId: z.string().uuid(), buyerPhone: z.string().trim().min(9).max(15).optional().or(z.literal("").transform(() => undefined)) }).parse(request.body);
    const result = await sellAgentVoucher(agent.tenantId, agent.id, body.hotspotPackageId, body.buyerPhone ?? null);
    let smsSent = false;
    if (body.buyerPhone) {
      const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: agent.tenantId }, select: { name: true } });
      smsSent = await sendTenantSms(agent.tenantId, body.buyerPhone, `${tenant.name} WiFi voucher: ${result.code} (${result.package.name}). Connect to the WiFi and enter this code.`)
        .then((r) => r.delivered)
        .catch(() => false);
    }
    await audit(request, agent.tenantId, "agent.voucher_sold", agent.id, { saleId: result.sale.id, package: result.package.name, smsSent });
    reply.status(201).send(successResponse({ code: result.code, package: result.package, commissionMinor: result.sale.commissionMinor, smsSent }, request.id));
  });

  app.get("/agent/customers/:accountNumber", own, async (request, reply) => {
    const agent = await resolveMyAgentOrThrow(request, true);
    const { accountNumber } = z.object({ accountNumber: z.string().trim().min(3).max(30) }).parse(request.params);
    reply.send(successResponse(await findCustomerForAgent(agent.tenantId, accountNumber), request.id));
  });

  app.post("/agent/collections", { ...own, config: { audience: "customer" as const, maintenanceCategory: "payment" } }, async (request, reply) => {
    const agent = await resolveMyAgentOrThrow(request, true);
    const body = z.object({ customerId: z.string().uuid(), amountMinor: z.number().int().min(100).max(10_000_000), requestId: z.string().uuid() }).parse(request.body);
    const already = await prisma.payment.findFirst({ where: { idempotencyKey: { startsWith: `agent:${body.requestId}:` } }, select: { id: true } });
    if (already) throw new ConflictError("This payment was already recorded");
    const result = await collectAgentPayment(agent.tenantId, agent.id, request.user!.id, body.customerId, body.amountMinor, body.requestId);
    // The customer hears about it straight away, so a payment that never reached the ISP shows up.
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: body.customerId }, select: { phone: true } });
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: agent.tenantId }, select: { name: true } });
    void sendTenantSms(agent.tenantId, customer.phone, `${tenant.name}: ${money(body.amountMinor)} received for account ${result.customer.customerNumber} at ${agent.name}. Thank you.`).catch(() => null);
    await audit(request, agent.tenantId, "agent.payment_collected", agent.id, { saleId: result.sale.id, customerId: body.customerId, amountMinor: body.amountMinor });
    reply.status(201).send(successResponse({ customer: result.customer, amountMinor: body.amountMinor, commissionMinor: result.sale.commissionMinor }, request.id));
  });

  app.get("/agent/statement", own, async (request, reply) => {
    const agent = await resolveMyAgentOrThrow(request, false);
    const { year, month } = monthQuery.parse(request.query);
    reply.send(successResponse(await agentStatement(agent.id, year, month), request.id));
  });

  // ---------------------------------------------------------------- Public: the invite link
  const codeParams = z.object({ code: z.string().regex(/^[A-Za-z0-9]{20}$/) });
  async function agentForCode(code: string) {
    const agent = await prisma.agent.findUnique({ where: { inviteCode: code }, include: { tenant: { select: { name: true, slug: true, status: true, deletedAt: true } } } });
    if (!agent || agent.userId || !agent.inviteExpiresAt || agent.inviteExpiresAt < new Date() || agent.tenant.deletedAt || agent.tenant.status !== "ACTIVE") throw new NotFoundError("Invite");
    return agent;
  }

  app.get("/agent-invite/:code", { config: { audience: "public", rateLimit: authRateLimitConfig } }, async (request, reply) => {
    const { code } = codeParams.parse(request.params);
    const a = await agentForCode(code);
    reply.send(successResponse({ isp: a.tenant.name, tenantSlug: a.tenant.slug, name: a.name }, request.id));
  });

  app.post("/agent-invite/:code", { config: { audience: "public", rateLimit: authRateLimitConfig } }, async (request, reply) => {
    const { code } = codeParams.parse(request.params);
    const body = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(10).max(200) }).parse(request.body);
    const a = await agentForCode(code);
    if (!isPasswordStrongEnough(body.password)) throw new ValidationError("Password must be at least 10 characters and include a letter plus a digit or symbol");
    if (await prisma.user.findFirst({ where: { tenantId: a.tenantId, email: body.email } })) throw new ConflictError("That email already has an account with this provider. Use a different email.");
    const user = await prisma.user.create({
      data: { tenantId: a.tenantId, email: body.email, phone: a.phone, passwordHash: await hashPassword(body.password), status: "ACTIVE", emailVerifiedAt: new Date() },
    });
    await assignAgentRole(user.id, a.tenantId);
    const linked = await prisma.agent.updateMany({ where: { id: a.id, userId: null }, data: { userId: user.id, inviteCode: null, inviteExpiresAt: null } });
    if (linked.count === 0) {
      await prisma.user.delete({ where: { id: user.id } });
      throw new ConflictError("This invite has already been used");
    }
    const session = await createSession(user.id, a.tenantId, { ipAddress: request.ip, userAgent: request.headers["user-agent"] ?? null });
    setRefreshCookie(reply, session.refreshToken);
    await writeAuditLog({ tenantId: a.tenantId, actorUserId: user.id, action: "agent.joined", resourceType: "Agent", resourceId: a.id, ipAddress: request.ip, userAgent: request.headers["user-agent"] ?? null });
    reply.status(201).send(successResponse({ accessToken: session.accessToken, expiresInSeconds: session.expiresInSeconds }, request.id));
  });
}
