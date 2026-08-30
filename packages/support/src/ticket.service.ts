import { prisma, type Ticket, type TicketMessage, type TicketStatus, type TicketPriority } from "@mashupkgrid/database";
import { NotFoundError, ValidationError } from "@mashupkgrid/shared";

export interface CreateTicketInput {
  customerId?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  subject: string;
  body: string;
  source?: string;
  createdByUserId?: string | null;
  priority?: TicketPriority;
}

export interface TicketWithFirstMessage extends Ticket {
  messages: TicketMessage[];
}

/** Every ticket starts with its opening message already in the thread — a ticket with no
 *  message would just be a subject line staff can't act on. */
export async function createTicket(tenantId: string, input: CreateTicketInput): Promise<TicketWithFirstMessage> {
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject) throw new ValidationError("Subject is required");
  if (!body) throw new ValidationError("Please describe the issue");
  if (!input.customerId && !input.contactName && !input.contactPhone && !input.contactEmail) {
    throw new ValidationError("A ticket needs either a linked customer or a way to contact whoever raised it");
  }

  return prisma.ticket.create({
    data: {
      tenantId,
      customerId: input.customerId ?? null,
      contactName: input.contactName?.trim() || null,
      contactPhone: input.contactPhone?.trim() || null,
      contactEmail: input.contactEmail?.trim() || null,
      subject,
      priority: input.priority ?? "NORMAL",
      source: input.source ?? "STAFF",
      createdByUserId: input.createdByUserId ?? null,
      messages: {
        create: {
          body,
          authorUserId: input.createdByUserId ?? null,
          authorLabel: input.createdByUserId ? null : input.contactName?.trim() || null,
        },
      },
    },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

export interface ListTicketsFilter {
  status?: TicketStatus;
  customerId?: string;
}

export async function listTickets(tenantId: string, filter: ListTicketsFilter = {}): Promise<Ticket[]> {
  return prisma.ticket.findMany({
    where: {
      tenantId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.customerId ? { customerId: filter.customerId } : {}),
    },
    include: { customer: { select: { id: true, fullName: true, phone: true } }, assignedToUser: { select: { id: true, email: true } } },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
}

export async function getTicketOrThrow(tenantId: string, ticketId: string): Promise<Ticket> {
  const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, tenantId } });
  if (!ticket) throw new NotFoundError("Ticket");
  return ticket;
}

/** Staff-facing thread — includes internal notes. Customer-facing callers must use
 *  getCustomerVisibleMessages instead; the filtering is the security boundary, not a UI choice. */
export async function getTicketWithMessages(
  tenantId: string,
  ticketId: string
): Promise<Ticket & { messages: TicketMessage[] }> {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, tenantId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!ticket) throw new NotFoundError("Ticket");
  return ticket;
}

export async function getCustomerVisibleMessages(tenantId: string, ticketId: string, customerId: string) {
  const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, tenantId, customerId } });
  if (!ticket) throw new NotFoundError("Ticket");
  const messages = await prisma.ticketMessage.findMany({
    where: { ticketId, isInternalNote: false },
    orderBy: { createdAt: "asc" },
  });
  return { ticket, messages };
}

export interface AddMessageInput {
  body: string;
  authorUserId?: string | null;
  authorLabel?: string | null;
  isInternalNote?: boolean;
}

/** A reply reopens a RESOLVED/CLOSED ticket back to IN_PROGRESS automatically — a customer
 *  following up on a "resolved" ticket means it wasn't, and staff replying to a closed one is
 *  clearly still working it; an internal note never changes status, since it isn't a reply to
 *  anyone. */
export async function addTicketMessage(
  tenantId: string,
  ticketId: string,
  input: AddMessageInput
): Promise<TicketMessage> {
  const ticket = await getTicketOrThrow(tenantId, ticketId);
  const body = input.body.trim();
  if (!body) throw new ValidationError("Message body is required");

  const message = await prisma.ticketMessage.create({
    data: {
      ticketId,
      body,
      authorUserId: input.authorUserId ?? null,
      authorLabel: input.authorLabel?.trim() || null,
      isInternalNote: input.isInternalNote ?? false,
    },
  });

  if (!input.isInternalNote && (ticket.status === "RESOLVED" || ticket.status === "CLOSED")) {
    await prisma.ticket.update({ where: { id: ticketId }, data: { status: "IN_PROGRESS", resolvedAt: null } });
  } else {
    await prisma.ticket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
  }

  return message;
}

export interface UpdateTicketInput {
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedToUserId?: string | null;
}

export async function updateTicket(tenantId: string, ticketId: string, input: UpdateTicketInput): Promise<Ticket> {
  await getTicketOrThrow(tenantId, ticketId);
  return prisma.ticket.update({
    where: { id: ticketId },
    data: {
      ...(input.status !== undefined
        ? {
            status: input.status,
            resolvedAt: input.status === "RESOLVED" || input.status === "CLOSED" ? new Date() : null,
          }
        : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.assignedToUserId !== undefined ? { assignedToUserId: input.assignedToUserId } : {}),
    },
  });
}
