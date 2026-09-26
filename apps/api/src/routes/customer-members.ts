import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma, type CustomerMember } from "@mashupkgrid/database";
import { env } from "@mashupkgrid/config";
import { successResponse, ConflictError, NotFoundError, ValidationError, generateAlnumSecret } from "@mashupkgrid/shared";
import { createSession, hashPassword, isPasswordStrongEnough, revokeAllSessionsForUser } from "@mashupkgrid/auth";
import { sendTenantSms } from "@mashupkgrid/sms";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { authRateLimitConfig } from "../plugins/rate-limit.js";
import { writeAuditLog } from "../lib/audit.js";
import { resolveAccountHolderOrThrow } from "../lib/my-account.js";
import { assignDefaultCustomerRole } from "../services/auth.service.js";
import { setRefreshCookie } from "./auth.js";

/**
 * Family and business accounts: extra logins on one customer account. Staff manage them from the
 * customer page, and the account holder from the app. Each member gets an invite link (sent by SMS
 * when a phone is given) where they choose their own email and password.
 */

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;
const MAX_MEMBERS = 10;
const INVITE_DAYS = 14;

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(9).max(15).optional().or(z.literal("").transform(() => undefined)),
  canPay: z.boolean().default(false),
});
const updateSchema = z.object({ name: z.string().trim().min(1).max(100).optional(), canPay: z.boolean().optional() });
const memberParams = z.object({ memberId: z.string().uuid() });
const codeParams = z.object({ code: z.string().regex(/^[A-Za-z0-9]{20}$/) });

const inviteUrl = (code: string) => `${env.APP_WEB_URL.replace(/\/$/, "")}/join/${code}`;

function view(m: CustomerMember) {
  return {
    id: m.id,
    name: m.name,
    phone: m.phone,
    canPay: m.canPay,
    status: m.userId ? "active" : m.inviteExpiresAt && m.inviteExpiresAt > new Date() ? "invited" : "expired",
    email: undefined as string | undefined,
    acceptedAt: m.acceptedAt,
    inviteUrl: !m.userId && m.inviteCode && m.inviteExpiresAt && m.inviteExpiresAt > new Date() ? inviteUrl(m.inviteCode) : null,
    createdAt: m.createdAt,
  };
}

async function listMembers(customerId: string) {
  const members = await prisma.customerMember.findMany({ where: { customerId }, include: { user: { select: { email: true } } }, orderBy: { createdAt: "asc" } });
  return members.map((m) => ({ ...view(m), email: m.user?.email }));
}

async function sendInvite(tenantId: string, customerId: string, member: CustomerMember): Promise<boolean> {
  if (!member.phone || !member.inviteCode) return false;
  const [customer, tenant] = await Promise.all([
    prisma.customer.findUniqueOrThrow({ where: { id: customerId }, select: { fullName: true } }),
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true } }),
  ]);
  const holder = customer.fullName.split(/\s+/)[0] ?? customer.fullName;
  const text = `Hi ${member.name.split(/\s+/)[0]}, ${holder} added you to their ${tenant.name} internet account. Set up your login here: ${inviteUrl(member.inviteCode)}`;
  return sendTenantSms(tenantId, member.phone, text)
    .then((r) => r.delivered)
    .catch(() => false);
}

/** The shared handlers; `scope` resolves the customer the caller may manage. */
function memberHandlers(scope: (request: FastifyRequest) => Promise<{ tenantId: string; customerId: string }>) {
  const audit = (request: FastifyRequest, tenantId: string, action: string, memberId: string, after?: object) =>
    writeAuditLog({ tenantId, actorUserId: request.user!.id, action, resourceType: "CustomerMember", resourceId: memberId, after, ipAddress: request.ip, userAgent: request.headers["user-agent"] ?? null });

  async function findMember(request: FastifyRequest) {
    const { tenantId, customerId } = await scope(request);
    const { memberId } = memberParams.parse(request.params);
    const member = await prisma.customerMember.findFirst({ where: { id: memberId, customerId, tenantId } });
    if (!member) throw new NotFoundError("Member");
    return { tenantId, customerId, member };
  }

  return {
    list: async (request: FastifyRequest, reply: FastifyReply) => {
      const { customerId } = await scope(request);
      reply.send(successResponse(await listMembers(customerId), request.id));
    },
    create: async (request: FastifyRequest, reply: FastifyReply) => {
      const { tenantId, customerId } = await scope(request);
      const body = createSchema.parse(request.body);
      if ((await prisma.customerMember.count({ where: { customerId } })) >= MAX_MEMBERS) throw new ConflictError(`An account can have up to ${MAX_MEMBERS} members`);
      const member = await prisma.customerMember.create({
        data: { tenantId, customerId, name: body.name, phone: body.phone ?? null, canPay: body.canPay, inviteCode: generateAlnumSecret(20), inviteExpiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) },
      });
      const smsSent = await sendInvite(tenantId, customerId, member);
      await audit(request, tenantId, "customer_member.invited", member.id, { name: member.name, canPay: member.canPay, smsSent });
      reply.status(201).send(successResponse({ ...view(member), smsSent }, request.id));
    },
    update: async (request: FastifyRequest, reply: FastifyReply) => {
      const { tenantId, member } = await findMember(request);
      const body = updateSchema.parse(request.body);
      const updated = await prisma.customerMember.update({ where: { id: member.id }, data: body });
      await audit(request, tenantId, "customer_member.updated", member.id, body);
      reply.send(successResponse(view(updated), request.id));
    },
    reinvite: async (request: FastifyRequest, reply: FastifyReply) => {
      const { tenantId, customerId, member } = await findMember(request);
      if (member.userId) throw new ConflictError("This member has already set up their login");
      const updated = await prisma.customerMember.update({
        where: { id: member.id },
        data: { inviteCode: generateAlnumSecret(20), inviteExpiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) },
      });
      const smsSent = await sendInvite(tenantId, customerId, updated);
      await audit(request, tenantId, "customer_member.reinvited", member.id, { smsSent });
      reply.send(successResponse({ ...view(updated), smsSent }, request.id));
    },
    remove: async (request: FastifyRequest, reply: FastifyReply) => {
      const { tenantId, member } = await findMember(request);
      await prisma.customerMember.delete({ where: { id: member.id } });
      if (member.userId) {
        // The login only ever opened this account, so it is switched off with it.
        await prisma.user.update({ where: { id: member.userId }, data: { status: "SUSPENDED" } });
        await revokeAllSessionsForUser(member.userId, "customer_member_removed");
      }
      await audit(request, tenantId, "customer_member.removed", member.id, { name: member.name });
      reply.send(successResponse({ removed: true }, request.id));
    },
  };
}

async function memberForCode(code: string) {
  const member = await prisma.customerMember.findUnique({
    where: { inviteCode: code },
    include: { customer: { select: { id: true, fullName: true, deletedAt: true } }, tenant: { select: { name: true, slug: true, status: true, deletedAt: true } } },
  });
  if (!member || member.userId || !member.inviteExpiresAt || member.inviteExpiresAt < new Date() || member.customer.deletedAt || member.tenant.deletedAt || member.tenant.status !== "ACTIVE") {
    throw new NotFoundError("Invite");
  }
  return member;
}

export async function customerMemberRoutes(app: FastifyInstance): Promise<void> {
  // --- Staff, from the customer page.
  const staff = memberHandlers(async (request) => {
    const tenantId = request.user!.tenantId;
    if (!tenantId) throw new ConflictError("Members belong to an ISP account");
    const { customerId } = z.object({ customerId: z.string().uuid() }).parse(request.params);
    if (!(await prisma.customer.findFirst({ where: { id: customerId, tenantId, deletedAt: null }, select: { id: true } }))) throw new NotFoundError("Customer");
    return { tenantId, customerId };
  });
  const read = { config: { audience: "staff" as const }, preHandler: [...preHandler, requirePermission("customers.read")] };
  const write = { config: { audience: "staff" as const }, preHandler: [...preHandler, requirePermission("customers.update")] };
  app.get("/customers/:customerId/members", read, staff.list);
  app.post("/customers/:customerId/members", write, staff.create);
  app.patch("/customers/:customerId/members/:memberId", write, staff.update);
  app.post("/customers/:customerId/members/:memberId/invite", write, staff.reinvite);
  app.delete("/customers/:customerId/members/:memberId", write, staff.remove);

  // --- The account holder, from the app.
  const holder = memberHandlers(async (request) => {
    const customer = await resolveAccountHolderOrThrow(request);
    return { tenantId: customer.tenantId, customerId: customer.id };
  });
  const own = { config: { audience: "customer" as const }, preHandler: [...preHandler] };
  app.get("/me/members", own, holder.list);
  app.post("/me/members", own, holder.create);
  app.patch("/me/members/:memberId", own, holder.update);
  app.post("/me/members/:memberId/invite", own, holder.reinvite);
  app.delete("/me/members/:memberId", own, holder.remove);

  // --- Public: the invite link.
  app.get("/join/:code", { config: { audience: "public", rateLimit: authRateLimitConfig } }, async (request, reply) => {
    const { code } = codeParams.parse(request.params);
    const m = await memberForCode(code);
    reply.send(
      successResponse({ isp: m.tenant.name, tenantSlug: m.tenant.slug, name: m.name, holder: m.customer.fullName.split(/\s+/)[0] ?? m.customer.fullName, canPay: m.canPay }, request.id)
    );
  });

  app.post("/join/:code", { config: { audience: "public", rateLimit: authRateLimitConfig } }, async (request, reply) => {
    const { code } = codeParams.parse(request.params);
    const body = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(10).max(200) }).parse(request.body);
    const m = await memberForCode(code);
    if (!isPasswordStrongEnough(body.password)) throw new ValidationError("Password must be at least 10 characters and include a letter plus a digit or symbol");
    if (await prisma.user.findFirst({ where: { tenantId: m.tenantId, email: body.email } })) throw new ConflictError("That email already has an account with this provider. Use a different email.");

    const user = await prisma.user.create({
      data: { tenantId: m.tenantId, email: body.email, phone: m.phone, passwordHash: await hashPassword(body.password), status: "ACTIVE", emailVerifiedAt: new Date() },
    });
    await assignDefaultCustomerRole(user.id, m.tenantId);
    const linked = await prisma.customerMember.updateMany({ where: { id: m.id, userId: null }, data: { userId: user.id, acceptedAt: new Date(), inviteCode: null, inviteExpiresAt: null } });
    if (linked.count === 0) {
      await prisma.user.delete({ where: { id: user.id } });
      throw new ConflictError("This invite has already been used");
    }
    const session = await createSession(user.id, m.tenantId, { ipAddress: request.ip, userAgent: request.headers["user-agent"] ?? null });
    setRefreshCookie(reply, session.refreshToken);
    await writeAuditLog({ tenantId: m.tenantId, actorUserId: user.id, action: "customer_member.joined", resourceType: "CustomerMember", resourceId: m.id, ipAddress: request.ip, userAgent: request.headers["user-agent"] ?? null });
    reply.status(201).send(successResponse({ accessToken: session.accessToken, expiresInSeconds: session.expiresInSeconds }, request.id));
  });
}
