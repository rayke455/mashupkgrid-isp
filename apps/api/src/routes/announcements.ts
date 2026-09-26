import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import { successResponse, NotFoundError, ConflictError } from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";
import { isPushConfigured, pushToDevices } from "@mashupkgrid/push";

/** Sends an announcement to the phones and computers of the ISP staff it is addressed to, on
 *  the devices where they turned alerts on. A push failure never undoes the announcement. */
async function pushAnnouncement(a: { id: string; tenantId: string | null; title: string; body: string }): Promise<number> {
  if (!isPushConfigured()) return 0;
  try {
    return await pushToDevices(
      { user: { status: "ACTIVE", deletedAt: null, tenantId: a.tenantId ?? { not: null } } },
      { title: a.title, body: a.body.length > 240 ? `${a.body.slice(0, 237)}...` : a.body, url: "/notifications", tag: `announcement-${a.id}` }
    );
  } catch (err) {
    console.error(`[announcements] push for ${a.id} failed`, err);
    return 0;
  }
}

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

const createSchema = z.object({
  tenantId: z.string().uuid().nullable(), // null = platform-wide, every tenant sees it
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]).default("INFO"),
  expiresAt: z.string().datetime().nullable().optional(),
  /** Also send it as a push alert to staff devices that turned alerts on. */
  push: z.boolean().optional().default(false),
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
        include: { tenant: { select: { id: true, name: true } }, _count: { select: { dismissals: true } } },
      });
      // readCount: how many people have opened it, which is what a sender actually wants to know.
      reply.send(
        successResponse(
          announcements.map(({ _count, ...a }) => ({ ...a, readCount: _count.dismissals })),
          request.id
        )
      );
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
        after: { title: announcement.title, severity: announcement.severity, tenantId: body.tenantId, push: body.push },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      const pushed = body.push ? await pushAnnouncement(announcement) : null;
      reply.status(201).send(successResponse({ ...announcement, pushed }, request.id));
    }
  );

  /** Sends an announcement that already exists as a push alert, e.g. a reminder on the day. */
  app.post(
    "/:announcementId/push",
    { config: { audience: "platform" }, preHandler: [...preHandler, requirePermission("tenants.update")] },
    async (request, reply) => {
      const { announcementId } = idParamsSchema.parse(request.params);
      const announcement = await prisma.platformAnnouncement.findUnique({ where: { id: announcementId } });
      if (!announcement) throw new NotFoundError("Announcement");
      if (!isPushConfigured()) throw new ConflictError("Push alerts are not set up on this server yet");
      const pushed = await pushAnnouncement(announcement);
      await writeAuditLog({
        tenantId: announcement.tenantId,
        actorUserId: request.user!.id,
        action: "announcement.pushed",
        resourceType: "PlatformAnnouncement",
        resourceId: announcementId,
        after: { devices: pushed },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });
      reply.send(successResponse({ pushed }, request.id));
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

  /** The notification centre: everything addressed to this user's tenant (or to every tenant),
   *  read or not, newest first. Reading is the same record as dismissing a banner. */
  app.get(
    "/inbox",
    { config: { audience: "staff" }, preHandler: [...preHandler] },
    async (request, reply) => {
      const tenantId = request.user!.tenantId;
      const userId = request.user!.id;
      const now = new Date();
      const rows = await prisma.platformAnnouncement.findMany({
        where: {
          OR: [{ tenantId: null }, { tenantId }],
          AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { dismissals: { where: { userId }, select: { dismissedAt: true } } },
      });
      const items = rows.map(({ dismissals, ...a }) => ({ ...a, readAt: dismissals[0]?.dismissedAt ?? null }));
      reply.send(successResponse({ items, unreadCount: items.filter((i) => !i.readAt).length }, request.id));
    }
  );

  app.post(
    "/read-all",
    { config: { audience: "staff" }, preHandler: [...preHandler] },
    async (request, reply) => {
      const tenantId = request.user!.tenantId;
      const userId = request.user!.id;
      const unread = await prisma.platformAnnouncement.findMany({
        where: { OR: [{ tenantId: null }, { tenantId }], dismissals: { none: { userId } } },
        select: { id: true },
      });
      if (unread.length > 0) {
        await prisma.announcementDismissal.createMany({
          data: unread.map((a) => ({ announcementId: a.id, userId })),
          skipDuplicates: true,
        });
      }
      reply.send(successResponse({ marked: unread.length }, request.id));
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
