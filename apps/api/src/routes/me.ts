import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma, type Customer } from "@mashupkgrid/database";
import { getOrCreateWallet, listWalletTransactions } from "@mashupkgrid/billing";
import {
  getRadiusUserByCustomerServiceOrThrow,
  getDecryptedRadiusPassword,
} from "@mashupkgrid/radius";
import { revokeAllSessionsForUser } from "@mashupkgrid/auth";
import { createTicket, listTickets, getCustomerVisibleMessages, addTicketMessage } from "@mashupkgrid/support";
import {
  successResponse,
  ConflictError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  hashPassword,
  verifyPassword,
  isPasswordStrongEnough,
} from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { writeAuditLog } from "../lib/audit.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

const subscriptionIdParamsSchema = z.object({ subscriptionId: z.string().uuid() });
const ticketIdParamsSchema = z.object({ ticketId: z.string().uuid() });
const createMyTicketSchema = z.object({ subject: z.string().min(1).max(200), body: z.string().min(1).max(5000) });
const replyToMyTicketSchema = z.object({ body: z.string().min(1).max(5000) });

/**
 * Resolves the caller's own billing record by `userId`, never by a client-supplied id — that's
 * what makes every route in this file safe to expose to the CUSTOMER role with no extra
 * permission check: the scoping *is* the security boundary, not a permission flag. A user with
 * no linked Customer (self-registered but not yet onboarded by staff — see
 * linkCustomerToUserAccount) gets a clear, specific 404, not an empty list that looks like "you
 * have nothing" when the real answer is "you aren't linked to a billing account yet".
 */
async function resolveMyCustomerOrThrow(request: FastifyRequest): Promise<Customer> {
  const tenantId = request.user!.tenantId;
  if (tenantId === null) throw new ConflictError("Platform accounts have no customer record");

  const customer = await prisma.customer.findFirst({ where: { tenantId, userId: request.user!.id } });
  if (!customer) {
    // NotFoundError appends " was not found" itself — this reads as "A linked customer record
    // was not found", not a full sentence; the fuller "contact support" guidance lives in the
    // frontend's CustomerPortal component instead of here.
    throw new NotFoundError("A linked customer record");
  }
  return customer;
}

export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get("/customer", { config: { audience: "customer" }, preHandler: [...preHandler] }, async (request, reply) => {
    const customer = await resolveMyCustomerOrThrow(request);
    reply.send(successResponse(customer, request.id));
  });

  app.get("/subscriptions", { config: { audience: "customer" }, preHandler: [...preHandler] }, async (request, reply) => {
    const customer = await resolveMyCustomerOrThrow(request);
    const subscriptions = await prisma.customerService.findMany({
      where: { customerId: customer.id },
      include: { package: true },
      orderBy: { createdAt: "desc" },
    });
    reply.send(successResponse(subscriptions, request.id));
  });

  app.get("/invoices", { config: { audience: "customer" }, preHandler: [...preHandler] }, async (request, reply) => {
    const customer = await resolveMyCustomerOrThrow(request);
    const invoices = await prisma.invoice.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    reply.send(successResponse(invoices, request.id));
  });

  app.get("/wallet", { config: { audience: "customer" }, preHandler: [...preHandler] }, async (request, reply) => {
    const customer = await resolveMyCustomerOrThrow(request);
    const [wallet, transactions] = await Promise.all([
      getOrCreateWallet(prisma, customer.id),
      listWalletTransactions(customer.id),
    ]);
    reply.send(successResponse({ wallet, transactions }, request.id));
  });

  /** Same one-time-reveal, audit-logged pattern as the staff route
   *  (/api/v1/radius/users/:id/reveal-password) — just scoped to a subscription the caller
   *  actually owns instead of any subscription in the tenant. */
  app.post(
    "/subscriptions/:subscriptionId/reveal-pppoe-password",
    { config: { audience: "customer" }, preHandler: [...preHandler] },
    async (request, reply) => {
      const customer = await resolveMyCustomerOrThrow(request);
      const { subscriptionId } = subscriptionIdParamsSchema.parse(request.params);

      const subscription = await prisma.customerService.findFirst({
        where: { id: subscriptionId, customerId: customer.id },
      });
      if (!subscription) throw new NotFoundError("Subscription");

      const radiusUser = await getRadiusUserByCustomerServiceOrThrow(
        request.user!.tenantId!,
        subscriptionId
      );
      const plaintextPassword = await getDecryptedRadiusPassword(radiusUser);

      await writeAuditLog({
        tenantId: request.user!.tenantId!,
        actorUserId: request.user!.id,
        action: "radius_user.password_revealed_self_service",
        resourceType: "RadiusUser",
        resourceId: radiusUser.id,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse({ username: radiusUser.username, password: plaintextPassword }, request.id));
    }
  );

  app.get("/profile", { config: { audience: "customer" }, preHandler: [...preHandler] }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user!.id },
      select: { id: true, email: true, phone: true, createdAt: true },
    });
    if (!user) throw new NotFoundError("User");
    reply.send(successResponse(user, request.id));
  });

  /** Requires the current password (not just an active session) before setting a new one — the
   *  same "prove you still are who you say you are" bar as any other credential change. Every
   *  session (including the one making this request) is revoked afterward, same as a token-based
   *  reset: a stolen access token that got the attacker this far should not keep working once the
   *  real owner regains control. */
  app.post(
    "/change-password",
    { config: { audience: "customer" }, preHandler: [...preHandler] },
    async (request, reply) => {
      const body = z
        .object({ currentPassword: z.string().min(1), newPassword: z.string().min(1) })
        .parse(request.body);

      const user = await prisma.user.findUnique({ where: { id: request.user!.id } });
      if (!user) throw new NotFoundError("User");

      const currentValid = await verifyPassword(user.passwordHash, body.currentPassword);
      if (!currentValid) throw new UnauthorizedError("Current password is incorrect");

      if (!isPasswordStrongEnough(body.newPassword)) {
        throw new ValidationError("New password must be at least 10 characters and include a letter and a digit or symbol");
      }

      const newHash = await hashPassword(body.newPassword);
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });
      await revokeAllSessionsForUser(user.id, "password_changed_self_service");

      await writeAuditLog({
        tenantId: request.user!.tenantId,
        actorUserId: user.id,
        action: "user.password_changed_self_service",
        resourceType: "User",
        resourceId: user.id,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse({ loggedOutEverywhere: true }, request.id));
    }
  );

  // --- Support tickets: same scoping-is-the-security-boundary pattern as every other route in
  // this file — a customer only ever sees tickets tied to *their own* customerId, resolved from
  // the caller's own user id, never a client-supplied one.

  app.get("/tickets", { config: { audience: "customer" }, preHandler: [...preHandler] }, async (request, reply) => {
    const customer = await resolveMyCustomerOrThrow(request);
    const tickets = await listTickets(request.user!.tenantId!, { customerId: customer.id });
    reply.send(successResponse(tickets, request.id));
  });

  app.post("/tickets", { config: { audience: "customer" }, preHandler: [...preHandler] }, async (request, reply) => {
    const customer = await resolveMyCustomerOrThrow(request);
    const body = createMyTicketSchema.parse(request.body);
    const ticket = await createTicket(request.user!.tenantId!, {
      ...body,
      customerId: customer.id,
      source: "CUSTOMER_PORTAL",
      createdByUserId: request.user!.id,
    });
    reply.status(201).send(successResponse(ticket, request.id));
  });

  app.get(
    "/tickets/:ticketId",
    { config: { audience: "customer" }, preHandler: [...preHandler] },
    async (request, reply) => {
      const customer = await resolveMyCustomerOrThrow(request);
      const { ticketId } = ticketIdParamsSchema.parse(request.params);
      const { ticket, messages } = await getCustomerVisibleMessages(request.user!.tenantId!, ticketId, customer.id);
      reply.send(successResponse({ ...ticket, messages }, request.id));
    }
  );

  app.post(
    "/tickets/:ticketId/messages",
    { config: { audience: "customer" }, preHandler: [...preHandler] },
    async (request, reply) => {
      const customer = await resolveMyCustomerOrThrow(request);
      const { ticketId } = ticketIdParamsSchema.parse(request.params);
      const body = replyToMyTicketSchema.parse(request.body);
      // getCustomerVisibleMessages throws NotFoundError unless this ticket is actually the
      // caller's own — that ownership check is what makes it safe to let them post to it at all.
      await getCustomerVisibleMessages(request.user!.tenantId!, ticketId, customer.id);
      const message = await addTicketMessage(request.user!.tenantId!, ticketId, {
        ...body,
        authorUserId: request.user!.id,
      });
      reply.status(201).send(successResponse(message, request.id));
    }
  );
}
