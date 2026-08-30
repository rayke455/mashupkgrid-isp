import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  setAiAssistantConfig,
  getAiAssistantConfigStatus,
  getAiAssistantApiKey,
  runPackageAssistant,
} from "@mashupkgrid/ai";
import { successResponse, ConflictError, NotFoundError, ValidationError } from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { requireFeature } from "../plugins/require-feature.js";
import { writeAuditLog } from "../lib/audit.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) throw new ConflictError("The AI assistant is not available at the platform level");
  return tenantId;
}

const setConfigSchema = z.object({ apiKey: z.string().min(1) });

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .max(20)
    .optional(),
});

export async function aiAssistantRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/config",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("settings.manage"), requireFeature("AI_ASSISTANT")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      reply.send(successResponse(await getAiAssistantConfigStatus(tenantId), request.id));
    }
  );

  app.put(
    "/config",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("settings.manage"), requireFeature("AI_ASSISTANT")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const body = setConfigSchema.parse(request.body);
      await setAiAssistantConfig(tenantId, body);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "ai_assistant_config.updated",
        resourceType: "AiAssistantConfig",
        resourceId: tenantId,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(await getAiAssistantConfigStatus(tenantId), request.id));
    }
  );

  /** Every reply is logged with which packages it actually touched — the assistant only ever
   *  acts through the same hotspot-package service the dashboard's own UI uses (see
   *  packages/ai/src/package-assistant.service.ts), so this audit entry is a true record, not a
   *  guess at what a model "probably" did. */
  app.post(
    "/chat",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("radius.manage"), requireFeature("AI_ASSISTANT")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const body = chatSchema.parse(request.body);

      let apiKey: string;
      try {
        apiKey = await getAiAssistantApiKey(tenantId);
      } catch (err) {
        if (err instanceof NotFoundError || err instanceof ValidationError) {
          throw new ConflictError(
            "AI assistant isn't configured yet — add your Anthropic API key in Settings > Integrations > AI Assistant."
          );
        }
        throw err;
      }

      const result = await runPackageAssistant(tenantId, apiKey, body.message, body.history);

      if (result.actionsTaken.length > 0) {
        await writeAuditLog({
          tenantId,
          actorUserId: request.user!.id,
          action: "ai_assistant.packages_updated",
          resourceType: "HotspotPackage",
          after: { actionsTaken: result.actionsTaken, request: body.message },
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        });
      }

      reply.send(successResponse(result, request.id));
    }
  );
}
