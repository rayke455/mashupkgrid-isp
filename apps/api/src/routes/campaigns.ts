import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import { successResponse, ConflictError, NotFoundError, campaignAudienceSchema } from "@mashupkgrid/shared";
import { campaignStats, personalizeMessage, resolveCampaignAudience, smsParts } from "@mashupkgrid/billing";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";

/** Campaigns: one SMS or WhatsApp message to a group of customers, sent by the worker, with the
 *  payments that followed counted as the result. */

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;
const idParams = z.object({ campaignId: z.string().uuid() });
const messageSchema = z.string().trim().min(1).max(1000);

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) throw new ConflictError("Campaigns belong to an ISP account");
  return tenantId;
}

export async function campaignRoutes(app: FastifyInstance): Promise<void> {
  const read = { config: { audience: "staff" as const }, preHandler: [...preHandler, requirePermission("customers.read")] };
  const write = { config: { audience: "staff" as const }, preHandler: [...preHandler, requirePermission("customers.update")] };

  app.get("/", read, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const campaigns = await prisma.campaign.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 100 });
    const stats = await campaignStats(campaigns.map((c) => c.id));
    reply.send(
      successResponse(
        campaigns.map((c) => {
          const s = stats.get(c.id) ?? { recipients: 0, sent: 0, failed: 0, paid: 0, paidMinor: 0 };
          return { ...c, ...s, conversionPercent: s.sent ? Math.round((s.paid / s.sent) * 100) : null };
        }),
        request.id
      )
    );
  });

  /** Who a draft would reach right now, and how the message reads for a few of them. */
  app.post("/preview", read, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const body = z.object({ audience: campaignAudienceSchema, message: z.string().max(1000).default("") }).parse(request.body);
    const [members, tenant] = await Promise.all([
      resolveCampaignAudience(tenantId, body.audience),
      prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { currency: true } }),
    ]);
    const samples = members.slice(0, 3).map((m) => ({ name: m.fullName, text: personalizeMessage(body.message, m, tenant.currency) }));
    const longest = members.reduce((max, m) => Math.max(max, personalizeMessage(body.message, m, tenant.currency).length), body.message.length);
    reply.send(successResponse({ count: members.length, samples, smsPartsPerMessage: smsParts("x".repeat(longest)) }, request.id));
  });

  app.post("/", write, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const body = z
      .object({
        name: z.string().trim().min(1).max(100),
        message: messageSchema,
        channel: z.enum(["SMS", "WHATSAPP", "BOTH"]),
        audience: campaignAudienceSchema,
        scheduledAt: z.coerce.date().optional(),
        trackDays: z.number().int().min(1).max(30).default(7),
      })
      .parse(request.body);
    const campaign = await prisma.campaign.create({
      data: {
        tenantId,
        name: body.name,
        message: body.message,
        channel: body.channel,
        audience: body.audience,
        scheduledAt: body.scheduledAt && body.scheduledAt > new Date() ? body.scheduledAt : new Date(),
        trackDays: body.trackDays,
        createdByUserId: request.user!.id,
      },
    });
    await writeAuditLog({
      tenantId,
      actorUserId: request.user!.id,
      action: "campaign.created",
      resourceType: "Campaign",
      resourceId: campaign.id,
      after: { name: body.name, channel: body.channel, audience: body.audience, scheduledAt: campaign.scheduledAt },
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });
    reply.status(201).send(successResponse(campaign, request.id));
  });

  /** Stops a campaign that hasn't finished. Messages already sent stay sent. */
  app.post("/:campaignId/cancel", write, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const { campaignId } = idParams.parse(request.params);
    const res = await prisma.campaign.updateMany({ where: { id: campaignId, tenantId, status: { in: ["SCHEDULED", "SENDING"] } }, data: { status: "CANCELLED", finishedAt: new Date() } });
    if (res.count === 0) throw new ConflictError("Only a campaign that hasn't finished can be stopped");
    await writeAuditLog({ tenantId, actorUserId: request.user!.id, action: "campaign.cancelled", resourceType: "Campaign", resourceId: campaignId, ipAddress: request.ip, userAgent: request.headers["user-agent"] ?? null });
    reply.send(successResponse({ cancelled: true }, request.id));
  });

  app.get("/:campaignId/recipients", read, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const { campaignId } = idParams.parse(request.params);
    if (!(await prisma.campaign.findFirst({ where: { id: campaignId, tenantId }, select: { id: true } }))) throw new NotFoundError("Campaign");
    const recipients = await prisma.campaignRecipient.findMany({
      where: { campaignId },
      include: { customer: { select: { id: true, fullName: true, customerNumber: true } } },
      orderBy: [{ paidMinor: { sort: "desc", nulls: "last" } }, { sentAt: "asc" }],
      take: 500,
    });
    reply.send(successResponse(recipients, request.id));
  });
}
