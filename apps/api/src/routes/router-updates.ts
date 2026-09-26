import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, type Prisma } from "@mashupkgrid/database";
import { successResponse, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@mashupkgrid/shared";
import { OTA_ACTIONS, findOtaAction } from "@mashupkgrid/network";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { getCachedPermissions } from "../lib/permission-cache.js";
import { writeAuditLog } from "../lib/audit.js";

/**
 * Over-the-air router updates: pick an action and the routers, optionally a time, and the worker
 * applies it one router at a time, first router alone by default. Running a custom RouterOS script
 * needs settings.manage on top of routers.manage, since a script can change anything on a router.
 */

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

const createSchema = z.object({
  action: z.string(),
  routerIds: z.array(z.string().uuid()).min(1).max(500),
  canaryFirst: z.boolean().default(true),
  scheduledFor: z.string().datetime().nullable().optional(),
  script: z.string().max(20_000).optional(),
});

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) throw new ConflictError("Router updates belong to an ISP account");
  return tenantId;
}

export async function routerUpdateRoutes(app: FastifyInstance): Promise<void> {
  app.get("/actions", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.read")] }, async (request, reply) => {
    reply.send(successResponse(OTA_ACTIONS, request.id));
  });

  /** Every router with what the last version check saw. */
  app.get("/fleet", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.read")] }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const routers = await prisma.router.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, vendor: true, status: true, host: true, siteName: true, routerOsVersion: true, boardName: true, firmwareVersion: true, versionCheckedAt: true, lastSeenAt: true },
    });
    reply.send(successResponse(routers.map(({ host, ...r }) => ({ ...r, linked: Boolean(host) })), request.id));
  });

  app.get("/", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.read")] }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const rollouts = await prisma.routerRollout.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 50 });
    const counts = rollouts.length
      ? await prisma.routerRolloutTarget.groupBy({ by: ["rolloutId", "status"], where: { rolloutId: { in: rollouts.map((r) => r.id) } }, _count: true })
      : [];
    reply.send(
      successResponse(
        rollouts.map(({ params, ...r }) => ({
          ...r,
          hasScript: Boolean((params as { script?: string } | null)?.script),
          automatic: Boolean((params as { automatic?: boolean } | null)?.automatic),
          counts: Object.fromEntries(counts.filter((c) => c.rolloutId === r.id).map((c) => [c.status, c._count])),
        })),
        request.id
      )
    );
  });

  app.get("/:rolloutId", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.read")] }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const { rolloutId } = z.object({ rolloutId: z.string().uuid() }).parse(request.params);
    const rollout = await prisma.routerRollout.findFirst({
      where: { id: rolloutId, tenantId },
      include: { targets: { orderBy: { position: "asc" }, select: { id: true, routerId: true, routerName: true, position: true, status: true, message: true, startedAt: true, finishedAt: true } } },
    });
    if (!rollout) throw new NotFoundError("Router update");
    reply.send(successResponse(rollout, request.id));
  });

  app.post("/", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.manage")] }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const body = createSchema.parse(request.body);
    const action = findOtaAction(body.action);
    if (!action) throw new ValidationError("Unknown router update");
    if (action.needsScript) {
      const permissions = await getCachedPermissions(request.user!.id, request.user!.tenantId);
      if (!permissions.has("settings.manage")) throw new ForbiddenError("Only the account owner can run custom scripts on routers");
      if (!body.script?.trim()) throw new ValidationError("Write the RouterOS script to run");
    }
    const ids = [...new Set(body.routerIds)];
    const routers = await prisma.router.findMany({ where: { tenantId, deletedAt: null, id: { in: ids } }, select: { id: true, name: true } });
    if (routers.length !== ids.length) throw new NotFoundError("Router");
    const order = new Map(ids.map((id, i) => [id, i]));
    routers.sort((a, b) => order.get(a.id)! - order.get(b.id)!);

    const scheduledFor = body.scheduledFor ? new Date(body.scheduledFor) : null;
    const later = scheduledFor !== null && scheduledFor.getTime() > Date.now() + 60_000;
    const rollout = await prisma.routerRollout.create({
      data: {
        tenantId,
        action: action.key,
        params: action.needsScript ? ({ script: body.script!.trim() } as Prisma.InputJsonValue) : undefined,
        canaryFirst: routers.length > 1 && body.canaryFirst,
        status: later ? "SCHEDULED" : "RUNNING",
        scheduledFor: later ? scheduledFor : null,
        createdByUserId: request.user!.id,
        targets: { create: routers.map((r, position) => ({ routerId: r.id, routerName: r.name, position })) },
      },
    });
    await writeAuditLog({
      tenantId,
      actorUserId: request.user!.id,
      action: "router.ota_rollout_created",
      resourceType: "RouterRollout",
      resourceId: rollout.id,
      after: { action: action.key, routers: routers.map((r) => r.name), scheduledFor: rollout.scheduledFor, ...(action.needsScript ? { script: body.script } : {}) },
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });
    reply.status(201).send(successResponse(rollout, request.id));
  });

  /** Stops a rollout: routers not yet updated are left alone. One already being updated finishes. */
  app.post("/:rolloutId/cancel", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.manage")] }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const { rolloutId } = z.object({ rolloutId: z.string().uuid() }).parse(request.params);
    const rollout = await prisma.routerRollout.findFirst({ where: { id: rolloutId, tenantId } });
    if (!rollout) throw new NotFoundError("Router update");
    if (rollout.status === "COMPLETED" || rollout.status === "CANCELLED") throw new ConflictError("This update has already finished");
    await prisma.routerRolloutTarget.updateMany({ where: { rolloutId, status: "PENDING" }, data: { status: "SKIPPED", message: "Cancelled", finishedAt: new Date() } });
    const updated = await prisma.routerRollout.update({ where: { id: rolloutId }, data: { status: "CANCELLED", finishedAt: new Date() } });
    await writeAuditLog({ tenantId, actorUserId: request.user!.id, action: "router.ota_rollout_cancelled", resourceType: "RouterRollout", resourceId: rolloutId, ipAddress: request.ip, userAgent: request.headers["user-agent"] ?? null });
    reply.send(successResponse(updated, request.id));
  });
}
