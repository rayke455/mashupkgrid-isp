import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listTrackedSessions } from "@mashupkgrid/radius";
import { successResponse, ConflictError } from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";

/** Who is online right now (and who was, recently), hotspot and PPPoE alike, with the
 *  customer and last payment behind each session. Read-only; gated on customers.read since it
 *  exposes names, phones and MAC addresses. */

const preHandler = [authenticate, resolveTenant, checkMaintenance, requirePermission("customers.read")] as const;

const querySchema = z.object({
  scope: z.enum(["active", "recent"]).default("active"),
  type: z.enum(["PPPOE", "HOTSPOT", "STATIC_IP", "IPTV"]).optional(),
  search: z.string().trim().max(100).optional(),
  days: z.coerce.number().int().min(1).max(90).default(7),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function radiusSessionRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { config: { audience: "staff" }, preHandler: [...preHandler] }, async (request, reply) => {
    const tenantId = request.user!.tenantId;
    if (tenantId === null) throw new ConflictError("Session tracking is per ISP; sign in to a tenant to see its sessions");
    const query = querySchema.parse(request.query);
    const result = await listTrackedSessions(tenantId, query);
    const filtered = query.type ? result.items.filter((s) => s.type === query.type) : result.items;
    reply.send(
      successResponse(
        {
          items: filtered,
          summary: result.summary,
          pagination: { page: query.page, limit: query.limit, total: result.total, totalPages: Math.max(1, Math.ceil(result.total / query.limit)) },
        },
        request.id
      )
    );
  });
}
