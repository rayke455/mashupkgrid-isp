import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import { successResponse, NotFoundError } from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

const createSchema = z.object({
  tenantId: z.string().uuid().nullable(), // null = platform-wide, every tenant sees it
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]).default("INFO"),
  expiresAt: z.string().datetime().nullable().optional(),
});

const idParamsSchema = z.object({ announcementId: z.string().uuid() });

export async function announcementRoutes(app: FastifyInstance): Promise<void> {
  // --- Super admin: manage announcements ------------------------------------------------

  app.get(
    "/",
    { config: { audience: "platform" }, preHandler: [...preHandler, requirePermission("tenants.read")] },
    async (request, reply) => {
      const announcements = await prisma.platformAnnouncement.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { tenant: { select: { id: true, name: true } } },
      });
      reply.send(successResponse(announcements, request.id));
    }
  );

  app.post(
    "/",
    { config: { audience: "platform" }, preHandler: [...preHandler, requirePermission("tenants.update")] },
    async (request, reply) => {
      const body = createSchema.parse(request.body);
      const announcement = await prisma.platformAnnouncement.create({
        data: {
          tenantId: body.tenantId,
          title: body.title,
          body: body.body,
          severity: body.severity,
          createdByUserId: request.user!.id,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        },
      });

      await writeAuditLog({
        tenantId: body.tenantId,
        actorUserId: request.user!.id,
        action: "announcement.created",
        resourceType: "PlatformAnnouncement",
        resourceId: announcement.id,
        after: { title: announcement.title, severity: announcement.severity, tenantId: body.tenantId },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.status(201).send(successResponse(announcement, request.id));
    }
  );

  app.delete(
    "/:announcementId",
    { config: { audience: "platform" }, preHandler: [...preHandler, requirePermission("tenants.update")] },
    async (request, reply) => {
      const { announcementId } = idParamsSchema.parse(request.params);
      const existing = await prisma.platformAnnouncement.findUnique({ where: { id: announcementId } });
      if (!existing) throw new NotFoundError("Announcement");

      await prisma.platformAnnouncement.delete({ where: { id: announcementId } });

      await writeAuditLog({
        tenantId: existing.tenantId,
        actorUserId: request.user!.id,
        action: "announcement.deleted",
        resourceType: "PlatformAnnouncement",
        resourceId: announcementId,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse({ success: true }, request.id));
    }
  );

  // --- Staff: see + dismiss whatever's targeted at their own tenant (or platform-wide) ----

  app.get(
    "/mine",
    { config: { audience: "staff" }, preHandler: [...preHandler] },
    async (request, reply) => {
      const tenantId = request.user!.tenantId;
      const userId = request.user!.id;
      const now = new Date();

      const announcements = await prisma.platformAnnouncement.findMany({
        where: {
          OR: [{ tenantId: null }, { tenantId }],
          AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
          dismissals: { none: { userId } },
        },
        orderBy: { createdAt: "desc" },
      });

      reply.send(successResponse(announcements, request.id));
    }
  );

  app.post(
    "/:announcementId/dismiss",
    { config: { audience: "staff" }, preHandler: [...preHandler] },
    async (request, reply) => {
      const { announcementId } = idParamsSchema.parse(request.params);
      await prisma.announcementDismissal.upsert({
        where: { announcementId_userId: { announcementId, userId: request.user!.id } },
        create: { announcementId, userId: request.user!.id },
        update: {},
      });
      reply.send(successResponse({ dismissed: true }, request.id));
    }
  );
}
