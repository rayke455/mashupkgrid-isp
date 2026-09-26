import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import { successResponse, ConflictError, NotFoundError, ValidationError } from "@mashupkgrid/shared";
import { listMaintenanceRecipients, maintenanceCancelledSms } from "@mashupkgrid/billing";
import { sendTenantSms } from "@mashupkgrid/sms";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";

/** Planned work on the ISP's network, and the texts that tell affected customers about it. */

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

const audienceSchema = z.object({
  scope: z.enum(["ALL", "ROUTERS", "BRANCH"]),
  routerIds: z.array(z.string().uuid()).max(200).default([]),
  branchId: z.string().uuid().nullable().default(null),
});
const createSchema = audienceSchema.extend({
  title: z.string().trim().min(3).max(120),
  message: z.string().trim().max(200).nullable().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  notifyHoursBefore: z.number().int().min(1).max(168).default(24),
});

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) throw new ConflictError("Network maintenance belongs to an ISP account");
  return tenantId;
}

async function assertAudienceInTenant(tenantId: string, a: z.infer<typeof audienceSchema>): Promise<void> {
  if (a.scope === "ROUTERS") {
    if (!a.routerIds.length) throw new ValidationError("Choose at least one router");
    const count = await prisma.router.count({ where: { tenantId, id: { in: a.routerIds } } });
    if (count !== new Set(a.routerIds).size) throw new NotFoundError("Router");
  }
  if (a.scope === "BRANCH") {
    if (!a.branchId) throw new ValidationError("Choose a branch");
    if (!(await prisma.branch.findFirst({ where: { id: a.branchId, tenantId } }))) throw new NotFoundError("Branch");
  }
}

export async function networkMaintenanceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.read")] }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const rows = await prisma.networkMaintenance.findMany({ where: { tenantId }, orderBy: { startsAt: "desc" }, take: 100 });
    reply.send(successResponse(rows, request.id));
  });

  /** How many customers a notice would reach, before it is scheduled. */
  app.post("/preview", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.read")] }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const audience = audienceSchema.parse(request.body);
    await assertAudienceInTenant(tenantId, audience);
    const recipients = await listMaintenanceRecipients(tenantId, audience);
    reply.send(successResponse({ customers: recipients.length }, request.id));
  });

  app.post("/", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.manage")] }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const body = createSchema.parse(request.body);
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    if (endsAt <= startsAt) throw new ValidationError("The end must be after the start");
    if (endsAt <= new Date()) throw new ValidationError("That time has already passed");
    await assertAudienceInTenant(tenantId, body);
    const row = await prisma.networkMaintenance.create({
      data: {
        tenantId,
        title: body.title,
        message: body.message || null,
        startsAt,
        endsAt,
        scope: body.scope,
        routerIds: body.scope === "ROUTERS" ? body.routerIds : [],
        branchId: body.scope === "BRANCH" ? body.branchId : null,
        notifyHoursBefore: body.notifyHoursBefore,
        createdByUserId: request.user!.id,
      },
    });
    await writeAuditLog({ tenantId, actorUserId: request.user!.id, action: "network_maintenance.scheduled", resourceType: "NetworkMaintenance", resourceId: row.id, after: { title: row.title, startsAt: row.startsAt, scope: row.scope }, ipAddress: request.ip, userAgent: request.headers["user-agent"] ?? null });
    reply.status(201).send(successResponse(row, request.id));
  });

  /** Cancels it. Customers who were already told about it get a text saying it is off. */
  app.post("/:id/cancel", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.manage")] }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const row = await prisma.networkMaintenance.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError("Maintenance");
    if (row.status === "CANCELLED") throw new ConflictError("Already cancelled");
    if (row.startsAt <= new Date()) throw new ConflictError("It has already started");
    const updated = await prisma.networkMaintenance.update({ where: { id }, data: { status: "CANCELLED" } });
    let texted = 0;
    if (row.beforeSentAt) {
      const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, timezone: true } });
      const text = maintenanceCancelledSms(row, tenant.name, tenant.timezone || "Africa/Nairobi");
      for (const r of await listMaintenanceRecipients(tenantId, row)) {
        const ok = await sendTenantSms(tenantId, r.phone, text).then((x) => x.delivered).catch(() => false);
        if (ok) texted += 1;
      }
    }
    await writeAuditLog({ tenantId, actorUserId: request.user!.id, action: "network_maintenance.cancelled", resourceType: "NetworkMaintenance", resourceId: id, after: { texted }, ipAddress: request.ip, userAgent: request.headers["user-agent"] ?? null });
    reply.send(successResponse({ ...updated, texted }, request.id));
  });
}
