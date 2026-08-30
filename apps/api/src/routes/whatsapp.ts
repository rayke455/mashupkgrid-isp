import type { FastifyInstance } from "fastify";
import { getConnectionStatus, setConnectionStatus, clearPairingQr } from "@mashupkgrid/whatsapp";
import { successResponse, ConflictError } from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";
import { enqueueWhatsappConnect, enqueueWhatsappDisconnect } from "../lib/queue.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) throw new ConflictError("WhatsApp is not available at the platform level");
  return tenantId;
}

/**
 * Tenant-facing control surface for that ISP's own WhatsApp link. The API never holds the socket
 * itself — pairing lives entirely in the worker (the only process with a WhatsApp connection), so
 * connect/disconnect are enqueued as jobs and this route only ever reads the resulting state.
 */
export async function whatsappRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/connection",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("settings.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      reply.send(successResponse(await getConnectionStatus(tenantId), request.id));
    }
  );

  app.post(
    "/connection/connect",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("settings.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);

      // Flip to CONNECTING immediately rather than waiting for the worker to pick the job up, so
      // the dashboard shows "waiting for QR" the moment the button is pressed instead of looking
      // like nothing happened.
      await setConnectionStatus(tenantId, "CONNECTING", { lastError: null });
      await enqueueWhatsappConnect({ tenantId });

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "whatsapp_connection.connect_requested",
        resourceType: "WhatsappConnection",
        resourceId: tenantId,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(await getConnectionStatus(tenantId), request.id));
    }
  );

  app.post(
    "/connection/disconnect",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("settings.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);

      await enqueueWhatsappDisconnect({ tenantId });
      await clearPairingQr(tenantId);
      await setConnectionStatus(tenantId, "DISCONNECTED", { lastError: null });

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "whatsapp_connection.disconnected",
        resourceType: "WhatsappConnection",
        resourceId: tenantId,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(await getConnectionStatus(tenantId), request.id));
    }
  );
}
