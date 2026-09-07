import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getConnectionStatus, setConnectionStatus, clearPairingQr, getTestChatMessages, clearTestChat, pushTestChatMessage } from "@mashupkgrid/whatsapp";
import { successResponse } from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";
import { enqueueWhatsappConnect, enqueueWhatsappDisconnect, enqueueWhatsappTestMessage } from "../lib/queue.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

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
      const tenantId = request.user!.tenantId;
      reply.send(successResponse(await getConnectionStatus(tenantId), request.id));
    }
  );

  app.post(
    "/connection/connect",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("settings.manage")] },
    async (request, reply) => {
      const tenantId = request.user!.tenantId;

      try {
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
          resourceId: tenantId ?? "platform",
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        });

        reply.send(successResponse(await getConnectionStatus(tenantId), request.id));
      } catch (err) {
        request.log.error({ err, tenantId }, "Failed to initiate WhatsApp connection");
        throw err;
      }
    }
  );

  /** Phone-number pairing: WhatsApp shows an 8-character code to type under
   *  Linked Devices > Link with phone number, instead of scanning a QR. Useful when the operator
   *  cannot point a camera at the screen — a remote server console, or a phone that is the only
   *  device to hand. */
  app.post(
    "/connection/pair-phone",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("settings.manage")] },
    async (request, reply) => {
      const tenantId = request.user!.tenantId;
      const { phoneNumber } = z
        .object({
          // Digits only once normalised; WhatsApp rejects anything with separators. Validated
          // here so an obviously wrong number fails with a clear message rather than as an
          // opaque pairing failure minutes later in the worker.
          phoneNumber: z
            .string()
            .trim()
            .transform((v) => v.replace(/[^\d]/g, ""))
            .refine((v) => v.length >= 8 && v.length <= 15, "Enter the number in international format, e.g. +254712345678"),
        })
        .parse(request.body);

      try {
        await setConnectionStatus(tenantId, "CONNECTING", { lastError: null });
        // Clear any QR left from a previous attempt: WhatsApp issues a QR or a code, never both,
        // so a stale QR sitting in Redis would render alongside the code and be unusable.
        await clearPairingQr(tenantId);
        await enqueueWhatsappConnect({ tenantId, pairWithPhoneNumber: phoneNumber });

        await writeAuditLog({
          tenantId,
          actorUserId: request.user!.id,
          action: "whatsapp_connection.pair_phone_requested",
          resourceType: "WhatsappConnection",
          resourceId: tenantId ?? "platform",
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        });

        reply.send(successResponse(await getConnectionStatus(tenantId), request.id));
      } catch (err) {
        request.log.error({ err, tenantId }, "Failed to request WhatsApp pairing code");
        throw err;
      }
    }
  );

  app.post(
    "/connection/disconnect",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("settings.manage")] },
    async (request, reply) => {
      const tenantId = request.user!.tenantId;

      try {
        await enqueueWhatsappDisconnect({ tenantId });
        await clearPairingQr(tenantId);
        await setConnectionStatus(tenantId, "DISCONNECTED", { lastError: null });

        await writeAuditLog({
          tenantId,
          actorUserId: request.user!.id,
          action: "whatsapp_connection.disconnected",
          resourceType: "WhatsappConnection",
          resourceId: tenantId ?? "platform",
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        });

        reply.send(successResponse(await getConnectionStatus(tenantId), request.id));
      } catch (err) {
        request.log.error({ err, tenantId }, "Failed to disconnect WhatsApp");
        throw err;
      }
    }
  );

  // -------------------------------------------------------------------------
  // Bot-testing panel: send a message as-if from a customer, poll the replies.
  // -------------------------------------------------------------------------

  /** Send a test message from the tenant's WhatsApp to a phone number, simulating a customer
   *  reply so the bot responds and the operator can see it in the dashboard. */
  app.post(
    "/test-message",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("settings.manage")] },
    async (request, reply) => {
      const tenantId = request.user!.tenantId;
      const { phone, text } = z
        .object({
          phone: z
            .string()
            .trim()
            .transform((v) => v.replace(/[^\d]/g, ""))
            .refine((v) => v.length >= 8 && v.length <= 15, "Enter the number in international format, e.g. 254712345678"),
          text: z.string().trim().min(1).max(2000),
        })
        .parse(request.body);

      // Log the outbound message in Redis so the dashboard can render it.
      await pushTestChatMessage(tenantId, { direction: "out", text, phone });
      // Enqueue the job — the worker will send it via the tenant's socket.
      await enqueueWhatsappTestMessage({ tenantId, phone, text });

      reply.send(successResponse({ sent: true }, request.id));
    }
  );

  /** Poll the test chat log — the dashboard calls this every few seconds while the bot-testing
   *  panel is open. */
  app.get(
    "/test-messages",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("settings.manage")] },
    async (request, reply) => {
      const tenantId = request.user!.tenantId;
      reply.send(successResponse(await getTestChatMessages(tenantId), request.id));
    }
  );

  /** Clear the test chat log — a "New conversation" button in the dashboard. */
  app.delete(
    "/test-messages",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("settings.manage")] },
    async (request, reply) => {
      const tenantId = request.user!.tenantId;
      await clearTestChat(tenantId);
      reply.send(successResponse({ cleared: true }, request.id));
    }
  );
}
