import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import { ConflictError, NotFoundError, ValidationError, successResponse } from "@mashupkgrid/shared";
import { normalizeWalledGardenHost } from "@mashupkgrid/network";
import { PAYMENT_GATEWAY_WALLED_GARDEN_HOSTS } from "@mashupkgrid/radius";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";

/**
 * The platform walled garden a super admin edits: hosts every hotspot customer on every router
 * may reach before paying. Platform-only (maintenance.manage, which no tenant role can hold)
 * because a single entry here opens a hole in every ISP's paywall at once.
 */

const preHandler = [authenticate, resolveTenant, checkMaintenance, requirePermission("maintenance.manage")] as const;

const createSchema = z.object({
  host: z.string().min(1).max(253),
  note: z.string().trim().max(200).optional(),
});

const idParams = z.object({ id: z.string().uuid() });

export async function platformWalledGardenRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { config: { audience: "platform" }, preHandler: [...preHandler] }, async (request, reply) => {
    const hosts = await prisma.platformWalledGardenHost.findMany({ orderBy: { createdAt: "asc" } });
    reply.send(
      successResponse(
        {
          hosts,
          // Shown so an admin does not re-add what every router already allows.
          builtIn: [...PAYMENT_GATEWAY_WALLED_GARDEN_HOSTS],
        },
        request.id
      )
    );
  });

  app.post("/", { config: { audience: "platform" }, preHandler: [...preHandler] }, async (request, reply) => {
    const body = createSchema.parse(request.body);
    const host = normalizeWalledGardenHost(body.host);
    if (!host) {
      throw new ValidationError(
        'Enter one hostname ("pay.example.com"), a wildcard under a domain ("*.example.com") or an IPv4 address. Bare wildcards like "*.com" are refused: they would open the paywall completely.'
      );
    }
    if (PAYMENT_GATEWAY_WALLED_GARDEN_HOSTS.includes(host as (typeof PAYMENT_GATEWAY_WALLED_GARDEN_HOSTS)[number])) {
      throw new ConflictError(`${host} is built into every router's walled garden already`);
    }
    const existing = await prisma.platformWalledGardenHost.findUnique({ where: { host } });
    if (existing) throw new ConflictError(`${host} is already allowed`);

    const row = await prisma.platformWalledGardenHost.create({
      data: { host, note: body.note || null, createdByUserId: request.user!.id },
    });
    await writeAuditLog({
      tenantId: null,
      actorUserId: request.user!.id,
      action: "platform.walled_garden.host_added",
      resourceType: "PlatformWalledGardenHost",
      resourceId: row.id,
      after: { host: row.host, note: row.note },
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });
    reply.status(201).send(successResponse(row, request.id));
  });

  app.delete("/:id", { config: { audience: "platform" }, preHandler: [...preHandler] }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const row = await prisma.platformWalledGardenHost.findUnique({ where: { id } });
    if (!row) throw new NotFoundError("Walled garden host");
    await prisma.platformWalledGardenHost.delete({ where: { id } });
    await writeAuditLog({
      tenantId: null,
      actorUserId: request.user!.id,
      action: "platform.walled_garden.host_removed",
      resourceType: "PlatformWalledGardenHost",
      resourceId: id,
      before: { host: row.host, note: row.note },
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });
    // Removal reaches routers only through their next setup script: the self-repair pass adds
    // missing entries but never deletes, since it cannot tell a platform entry from one the
    // operator added by hand on the router.
    reply.send(successResponse({ removed: true, note: "Routers already online keep this host until their setup script is re-applied." }, request.id));
  });
}
