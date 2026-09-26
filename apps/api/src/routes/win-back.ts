import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import { successResponse, ConflictError, NotFoundError } from "@mashupkgrid/shared";
import { createWinBackOffer, markWinBackOfferFailed, winBackCandidates, winBackReport } from "@mashupkgrid/billing";
import { sendTenantSms } from "@mashupkgrid/sms";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";

/** Win-back offers: how they are doing, who could get one next, and sending one by hand. The
 *  automatic sending is the worker's win-back job, switched on in the ISP's preferences. */

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) throw new ConflictError("Win-back offers belong to an ISP account");
  return tenantId;
}

export async function winBackRoutes(app: FastifyInstance): Promise<void> {
  const read = { config: { audience: "staff" as const }, preHandler: [...preHandler, requirePermission("customers.read")] };

  app.get("/", read, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const { days } = z.object({ days: z.coerce.number().int().min(7).max(365).default(90) }).parse(request.query);
    reply.send(successResponse(await winBackReport(tenantId, days), request.id));
  });

  app.get("/candidates", read, async (request, reply) => {
    reply.send(successResponse(await winBackCandidates(requireTenant(request.user!.tenantId), 100), request.id));
  });

  /** Sends one offer now, to a customer staff picked. */
  app.post(
    "/send",
    { config: { audience: "staff" as const }, preHandler: [...preHandler, requirePermission("customers.update")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { customerId } = z.object({ customerId: z.string().uuid() }).parse(request.body);
      const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId, deletedAt: null } });
      if (!customer) throw new NotFoundError("Customer");
      if (await prisma.winBackOffer.findFirst({ where: { customerId, status: "SENT" } })) throw new ConflictError("This customer already has an offer waiting");
      const owed = await prisma.invoice.aggregate({
        where: { customerId, status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] } },
        _sum: { totalMinor: true, amountPaidMinor: true },
      });
      const candidate = (await winBackCandidates(tenantId, 500)).find((c) => c.customerId === customerId);
      const offer = await createWinBackOffer(
        tenantId,
        {
          customerId,
          fullName: customer.fullName,
          phone: customer.phone,
          customerNumber: customer.customerNumber,
          reason: candidate?.reason ?? "Sent by staff",
          owedMinor: (owed._sum.totalMinor ?? 0) - (owed._sum.amountPaidMinor ?? 0),
        },
        request.user!.id
      );
      const delivered = await sendTenantSms(tenantId, customer.phone, offer.message)
        .then((r) => r.delivered)
        .catch(() => false);
      if (!delivered) await markWinBackOfferFailed(offer.id);
      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "win_back.offer_sent",
        resourceType: "WinBackOffer",
        resourceId: offer.id,
        after: { customerId, delivered, discountPercent: offer.discountPercent },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });
      reply.status(201).send(successResponse({ ...offer, status: delivered ? offer.status : "FAILED", delivered }, request.id));
    }
  );
}
