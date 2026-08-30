import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import { env } from "@mashupkgrid/config";
import { successResponse, ConflictError, NotFoundError } from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { requireFeature } from "../plugins/require-feature.js";
import { writeAuditLog } from "../lib/audit.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

const updateSettingsSchema = z.object({
  name: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
  currency: z.string().length(3).optional(),
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "brandColor must be a 6-digit hex color, e.g. #2563eb")
    .nullable()
    .optional(),
  logoUrl: z.string().url().nullable().optional(),
});

const liveChatConfigSchema = z.object({
  isActive: z.boolean(),
  widgetId: z.string().trim().min(1).max(200).nullable(),
  showOnHotspotPortal: z.boolean(),
  showOnDashboard: z.boolean(),
});

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) {
    throw new ConflictError(
      "Platform administration has no tenant settings of its own — manage individual tenants from /tenants"
    );
  }
  return tenantId;
}

/** A tenant's own self-service settings (name/timezone/currency) — distinct from
 *  /platform/tenants, which is a super-admin route that can act on *any* tenant by id. This one
 *  only ever reads/writes `request.user.tenantId`, so there's no id to get wrong and no way for
 *  one tenant to reach another's settings. */
export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("settings.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw new NotFoundError("Tenant");
      // Same computed value as the super-admin Tenants list (apps/api's platform tenants
      // route) — the tenant's own slug doubles as its automatic platform subdomain, see the
      // multi-tenant-domains plan.
      reply.send(
        successResponse({ ...tenant, platformUrl: `https://${tenant.slug}.${env.PLATFORM_BASE_DOMAIN}` }, request.id)
      );
    }
  );

  app.patch(
    "/",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("settings.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const body = updateSettingsSchema.parse(request.body);
      const before = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!before) throw new NotFoundError("Tenant");

      const after = await prisma.tenant.update({ where: { id: tenantId }, data: body });

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "settings.updated",
        resourceType: "Tenant",
        resourceId: tenantId,
        before: {
          name: before.name,
          timezone: before.timezone,
          currency: before.currency,
          brandColor: before.brandColor,
          logoUrl: before.logoUrl,
        },
        after: {
          name: after.name,
          timezone: after.timezone,
          currency: after.currency,
          brandColor: after.brandColor,
          logoUrl: after.logoUrl,
        },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(after, request.id));
    }
  );

  // --- Live chat (Tawk.to) — a widgetId isn't a secret (it's meant to sit in client-side HTML),
  // so unlike the AI assistant's API key this is plain config, upserted the same simple way. ---

  /** Any authenticated staff member (not just settings.manage) needs to know whether to render
   *  the widget on the dashboard shell — same reduced, non-sensitive shape as the public hotspot
   *  version, just without the anonymous-caller restriction. */
  app.get(
    "/live-chat/widget",
    { config: { audience: "staff" }, preHandler: [...preHandler] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const config = await prisma.liveChatConfig.findUnique({ where: { tenantId } });
      const featureDisabled = request.tenantCtx?.disabledFeatures.includes("LIVE_CHAT") ?? false;
      const show = !!(config?.isActive && config.showOnDashboard && config.widgetId && !featureDisabled);
      reply.send(successResponse({ show, widgetId: show ? config!.widgetId : null }, request.id));
    }
  );

  app.get(
    "/live-chat",
    {
      config: { audience: "staff" },
      preHandler: [...preHandler, requirePermission("settings.manage"), requireFeature("LIVE_CHAT")],
    },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const config = await prisma.liveChatConfig.findUnique({ where: { tenantId } });
      reply.send(
        successResponse(
          config ?? { isActive: false, widgetId: null, showOnHotspotPortal: true, showOnDashboard: true },
          request.id
        )
      );
    }
  );

  app.put(
    "/live-chat",
    {
      config: { audience: "staff" },
      preHandler: [...preHandler, requirePermission("settings.manage"), requireFeature("LIVE_CHAT")],
    },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const body = liveChatConfigSchema.parse(request.body);

      const config = await prisma.liveChatConfig.upsert({
        where: { tenantId },
        create: { tenantId, ...body },
        update: body,
      });

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "live_chat_config.updated",
        resourceType: "LiveChatConfig",
        resourceId: config.id,
        after: { isActive: config.isActive, showOnHotspotPortal: config.showOnHotspotPortal, showOnDashboard: config.showOnDashboard },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(config, request.id));
    }
  );
}
