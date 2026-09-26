import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import {
  createTicket,
  listTickets,
  getTicketWithMessages,
  addTicketMessage,
  updateTicket,
} from "@mashupkgrid/support";
import { successResponse, ConflictError, resolveTenantPreferences } from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) throw new ConflictError("Ticket management is not available at the platform level");
  return tenantId;
}

const statusSchema = z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]);
const prioritySchema = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);

const listQuerySchema = z.object({
  status: statusSchema.optional(),
  customerId: z.string().uuid().optional(),
});

const createTicketSchema = z.object({
  customerId: z.string().uuid().optional(),
  contactName: z.string().max(120).optional(),
  contactPhone: z.string().max(32).optional(),
  contactEmail: z.string().email().optional(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  priority: prioritySchema.optional(),
});

const addMessageSchema = z.object({
  body: z.string().min(1).max(5000),
  isInternalNote: z.boolean().optional(),
});

const updateTicketSchema = z.object({
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
});

const idParamsSchema = z.object({ ticketId: z.string().uuid() });

export async function ticketRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("tickets.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const query = listQuerySchema.parse(request.query);
      const tickets = await listTickets(tenantId, query);
      // Response target: an open ticket with no staff reply inside the hours set for its
      // priority (Settings → Reminders and tickets) counts as overdue.
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { preferences: true } });
      const hours = resolveTenantPreferences(tenant?.preferences).tickets.responseHours;
      const openIds = tickets.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS").map((t) => t.id);
      const replies = openIds.length
        ? await prisma.ticketMessage.groupBy({ by: ["ticketId"], where: { ticketId: { in: openIds }, authorUserId: { not: null }, isInternalNote: false }, _min: { createdAt: true } })
        : [];
      const firstReply = new Map(replies.map((r) => [r.ticketId, r._min.createdAt]));
      const now = Date.now();
      const rows = tickets.map((t) => {
        const target = hours[t.priority as keyof typeof hours] ?? hours.NORMAL;
        const responseDueAt = new Date(t.createdAt.getTime() + target * 3_600_000);
        const isOpen = t.status === "OPEN" || t.status === "IN_PROGRESS";
        const replied = firstReply.get(t.id) ?? null;
        return { ...t, responseDueAt, firstRepliedAt: replied, responseOverdue: isOpen && !replied && responseDueAt.getTime() < now };
      });
      reply.send(successResponse(rows, request.id));
    }
  );

  app.post(
    "/",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("tickets.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const body = createTicketSchema.parse(request.body);
      const ticket = await createTicket(tenantId, {
        ...body,
        source: "STAFF",
        createdByUserId: request.user!.id,
      });

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "ticket.created",
        resourceType: "Ticket",
        resourceId: ticket.id,
        after: { subject: ticket.subject, status: ticket.status },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.status(201).send(successResponse(ticket, request.id));
    }
  );

  app.get(
    "/:ticketId",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("tickets.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { ticketId } = idParamsSchema.parse(request.params);
      const ticket = await getTicketWithMessages(tenantId, ticketId);
      reply.send(successResponse(ticket, request.id));
    }
  );

  app.post(
    "/:ticketId/messages",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("tickets.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { ticketId } = idParamsSchema.parse(request.params);
      const body = addMessageSchema.parse(request.body);
      const message = await addTicketMessage(tenantId, ticketId, {
        ...body,
        authorUserId: request.user!.id,
      });

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: body.isInternalNote ? "ticket.internal_note_added" : "ticket.replied",
        resourceType: "Ticket",
        resourceId: ticketId,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.status(201).send(successResponse(message, request.id));
    }
  );

  app.patch(
    "/:ticketId",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("tickets.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { ticketId } = idParamsSchema.parse(request.params);
      const body = updateTicketSchema.parse(request.body);
      const ticket = await updateTicket(tenantId, ticketId, body);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "ticket.updated",
        resourceType: "Ticket",
        resourceId: ticketId,
        after: { status: ticket.status, priority: ticket.priority, assignedToUserId: ticket.assignedToUserId },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(ticket, request.id));
    }
  );
}
