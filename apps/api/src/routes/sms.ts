import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { setSmsConfig, getSmsConfigStatus, sendTenantSms } from "@mashupkgrid/sms";
import { successResponse, ConflictError } from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) throw new ConflictError("SMS gateway is not available at the platform level");
  return tenantId;
}

const setConfigSchema = z.object({
  apiKey: z.string().min(1),
  username: z.string().min(1),
  senderId: z.string().optional(),
  environment: z.enum(["sandbox", "production"]),
});

const sendTestSchema = z.object({ phone: z.string().min(9), message: z.string().min(1).max(459) });

export async function smsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/config",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("settings.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      reply.send(successResponse(await getSmsConfigStatus(tenantId), request.id));
    }
  );

  app.put(
    "/config",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("settings.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const body = setConfigSchema.parse(request.body);
      await setSmsConfig(tenantId, body);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "sms_config.updated",
        resourceType: "SmsProviderConfig",
        resourceId: tenantId,
        after: { username: body.username, senderId: body.senderId ?? null, environment: body.environment },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(await getSmsConfigStatus(tenantId), request.id));
    }
  );

  app.post(
    "/send-test",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("settings.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { phone, message } = sendTestSchema.parse(request.body);
      const result = await sendTenantSms(tenantId, phone, message);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "sms.test_sent",
        resourceType: "SmsProviderConfig",
        resourceId: tenantId,
        after: { delivered: result.delivered },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(result, request.id));
    }
  );
}
