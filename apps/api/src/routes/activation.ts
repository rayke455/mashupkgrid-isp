import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import { env } from "@mashupkgrid/config";
import { successResponse, ConflictError, NotFoundError, ValidationError, generateAlnumSecret } from "@mashupkgrid/shared";
import { createSession, hashPassword, isPasswordStrongEnough } from "@mashupkgrid/auth";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { authRateLimitConfig } from "../plugins/rate-limit.js";
import { writeAuditLog } from "../lib/audit.js";
import { assignDefaultCustomerRole } from "../services/auth.service.js";
import { setRefreshCookie } from "./auth.js";

/**
 * Self-install cards. Staff print a card for a customer; its QR opens /activate/<code>, where the
 * customer creates their own app login (linked to their account) and sees how to connect their
 * router. Holding the card is the proof of identity, so the code is long, random, single-account
 * and expires after 30 days.
 */

const CODE_DAYS = 30;
const codeParams = z.object({ code: z.string().regex(/^[A-Za-z0-9]{16}$/) });

async function customerForCode(code: string) {
  const customer = await prisma.customer.findUnique({
    where: { installCode: code },
    include: {
      tenant: { select: { id: true, name: true, slug: true, status: true, deletedAt: true } },
      services: { where: { status: { in: ["ACTIVE", "PENDING", "SUSPENDED"] } }, include: { package: { select: { name: true, downloadKbps: true } }, radiusUser: { select: { username: true } } }, take: 3 },
    },
  });
  if (!customer || customer.deletedAt || !customer.installCodeExpiresAt || customer.installCodeExpiresAt < new Date() || customer.tenant.deletedAt || customer.tenant.status !== "ACTIVE") {
    throw new NotFoundError("Install card");
  }
  return customer;
}

export async function activationRoutes(app: FastifyInstance): Promise<void> {
  /** Staff: the card for a customer. Keeps a valid code; makes a new one if there is none. */
  app.post(
    "/customers/:customerId/install-card",
    { config: { audience: "staff" }, preHandler: [authenticate, resolveTenant, checkMaintenance, requirePermission("customers.update")] },
    async (request, reply) => {
      const tenantId = request.user!.tenantId;
      if (!tenantId) throw new ConflictError("Install cards belong to an ISP account");
      const { customerId } = z.object({ customerId: z.string().uuid() }).parse(request.params);
      const { renew } = z.object({ renew: z.boolean().default(false) }).parse(request.body ?? {});
      let customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId, deletedAt: null } });
      if (!customer) throw new NotFoundError("Customer");
      if (renew || !customer.installCode || !customer.installCodeExpiresAt || customer.installCodeExpiresAt < new Date()) {
        customer = await prisma.customer.update({
          where: { id: customerId },
          data: { installCode: generateAlnumSecret(16), installCodeExpiresAt: new Date(Date.now() + CODE_DAYS * 86_400_000) },
        });
        await writeAuditLog({ tenantId, actorUserId: request.user!.id, action: "customer.install_card_issued", resourceType: "Customer", resourceId: customerId, ipAddress: request.ip, userAgent: request.headers["user-agent"] ?? null });
      }
      const [tenant, services] = await Promise.all([
        prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true } }),
        prisma.customerService.findMany({ where: { customerId, status: { in: ["ACTIVE", "PENDING", "SUSPENDED"] } }, include: { package: { select: { name: true } }, radiusUser: { select: { username: true } } } }),
      ]);
      reply.send(
        successResponse(
          {
            code: customer.installCode,
            url: `${env.APP_WEB_URL.replace(/\/$/, "")}/activate/${customer.installCode}`,
            expiresAt: customer.installCodeExpiresAt,
            activatedAt: customer.installActivatedAt,
            hasLogin: Boolean(customer.userId),
            isp: tenant.name,
            customer: { fullName: customer.fullName, customerNumber: customer.customerNumber, phone: customer.phone },
            connections: services.map((s) => ({ plan: s.package.name, pppoeUsername: s.radiusUser?.username ?? null })),
          },
          request.id
        )
      );
    }
  );

  /** Public: what the card is for, without anything a stranger could use. */
  app.get("/activate/:code", { config: { audience: "public", rateLimit: authRateLimitConfig } }, async (request, reply) => {
    const { code } = codeParams.parse(request.params);
    const c = await customerForCode(code);
    reply.send(
      successResponse(
        {
          isp: c.tenant.name,
          tenantSlug: c.tenant.slug,
          firstName: c.fullName.split(/\s+/)[0] ?? c.fullName,
          customerNumber: c.customerNumber,
          hasLogin: Boolean(c.userId),
          suggestedEmail: c.email,
          plans: c.services.map((s) => ({ name: s.package.name, mbps: Math.round(s.package.downloadKbps / 1000), pppoe: Boolean(s.radiusUser) })),
        },
        request.id
      )
    );
  });

  /** Public: creates the customer's app login from the card and signs them in. */
  app.post("/activate/:code", { config: { audience: "public", rateLimit: authRateLimitConfig } }, async (request, reply) => {
    const { code } = codeParams.parse(request.params);
    const body = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(10).max(200) }).parse(request.body);
    const c = await customerForCode(code);
    if (c.userId) throw new ConflictError("This account already has a login. Sign in instead.");
    if (!isPasswordStrongEnough(body.password)) throw new ValidationError("Password must be at least 10 characters and include a letter plus a digit or symbol");
    if (await prisma.user.findFirst({ where: { tenantId: c.tenantId, email: body.email } })) throw new ConflictError("That email already has an account with this provider. Sign in instead.");

    const user = await prisma.user.create({
      data: { tenantId: c.tenantId, email: body.email, phone: c.phone, passwordHash: await hashPassword(body.password), status: "ACTIVE", emailVerifiedAt: new Date() },
    });
    await assignDefaultCustomerRole(user.id, c.tenantId);
    const linked = await prisma.customer.updateMany({ where: { id: c.id, userId: null }, data: { userId: user.id, installActivatedAt: new Date(), ...(c.email ? {} : { email: body.email }) } });
    if (linked.count === 0) {
      await prisma.user.delete({ where: { id: user.id } });
      throw new ConflictError("This account already has a login. Sign in instead.");
    }
    const session = await createSession(user.id, c.tenantId, { ipAddress: request.ip, userAgent: request.headers["user-agent"] ?? null });
    setRefreshCookie(reply, session.refreshToken);
    await writeAuditLog({ tenantId: c.tenantId, actorUserId: user.id, action: "customer.self_activated", resourceType: "Customer", resourceId: c.id, ipAddress: request.ip, userAgent: request.headers["user-agent"] ?? null });
    reply.status(201).send(successResponse({ accessToken: session.accessToken, expiresInSeconds: session.expiresInSeconds }, request.id));
  });
}
