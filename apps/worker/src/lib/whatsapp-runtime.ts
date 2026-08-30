import * as fs from "node:fs";
import path from "node:path";
import { env } from "@mashupkgrid/config";
import {
  WhatsAppSessionManager,
  publishPairingQr,
  clearPairingQr,
  setConnectionStatus,
  listTenantsToRestore,
  type WASocket,
} from "@mashupkgrid/whatsapp";
import { handleIncomingWhatsAppMessage } from "./whatsapp-bot.js";

/**
 * Owns every WhatsApp session this worker holds, and is the only place the rest of the worker
 * asks "which socket do I send this on".
 *
 * Two kinds of session live here:
 *  - One per tenant, linked by that ISP from their own dashboard. Everything customer-facing goes
 *    out on these, so each ISP's messages come from its own number.
 *  - A single "platform" session, for the handful of messages that belong to no tenant yet —
 *    an ISP-registration OTP and the welcome that follows are both sent *before* the tenant has
 *    had any chance to link an account of their own.
 */

/** Reserved session id for the platform's own line. Not a tenant id — real ones are UUIDs, so
 *  this can never collide with a tenant's directory. */
export const PLATFORM_SESSION_ID = "platform";

/** The session manager keys the platform line by PLATFORM_SESSION_ID; the connection service
 *  keys it by a null tenantId, matching the database row. This maps between the two. */
function toScope(sessionId: string): string | null {
  return sessionId === PLATFORM_SESSION_ID ? null : sessionId;
}

/**
 * The platform session originally lived directly in WHATSAPP_AUTH_STATE_PATH, before sessions
 * were per-tenant subdirectories. Moving those files into the "platform" subdirectory on first
 * boot keeps an already-paired line working instead of silently demanding a fresh QR scan for a
 * connection the operator had already set up.
 */
function migrateLegacyPlatformSession(basePath: string): void {
  const legacyCreds = path.join(basePath, "creds.json");
  const targetDir = path.join(basePath, PLATFORM_SESSION_ID);
  if (!fs.existsSync(legacyCreds) || fs.existsSync(path.join(targetDir, "creds.json"))) return;

  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(basePath, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    fs.renameSync(path.join(basePath, entry.name), path.join(targetDir, entry.name));
  }
  console.log(`[whatsapp] migrated existing platform session into ${targetDir}`);
}

let manager: WhatsAppSessionManager | null = null;

export function getManager(): WhatsAppSessionManager | null {
  return manager;
}

/**
 * Resolves the socket a message should go out on. A null tenantId means "platform-level". A
 * tenant that has not linked its own account falls back to the platform line rather than failing
 * outright — an ISP that has not finished setup should still get its customers' vouchers
 * delivered, from whatever line is available.
 */
export function resolveSocket(tenantId: string | null): WASocket | null {
  if (!manager) return null;
  if (tenantId) {
    const tenantSocket = manager.get(tenantId);
    if (tenantSocket) return tenantSocket;
  }
  return manager.get(PLATFORM_SESSION_ID);
}

export async function startWhatsAppRuntime(): Promise<WhatsAppSessionManager> {
  const basePath = env.WHATSAPP_AUTH_STATE_PATH;
  fs.mkdirSync(basePath, { recursive: true });
  migrateLegacyPlatformSession(basePath);

  manager = new WhatsAppSessionManager(basePath, {
    onQr: (sessionId, qr) => {
      // The platform QR is now published exactly like a tenant's, so the super-admin page can
      // render it. It used to be suppressed here, which left the connect script over SSH as the
      // only way to pair the platform line -- nobody without shell access could restore it.
      void publishPairingQr(toScope(sessionId), qr).catch((err) =>
        console.error(`[whatsapp] failed to publish QR for ${sessionId}:`, err)
      );
    },

    onReady: (sessionId, phoneNumber) => {
      console.log(`[whatsapp] connected: ${sessionId}${phoneNumber ? ` (${phoneNumber})` : ""}`);
      const scope = toScope(sessionId);
      void clearPairingQr(scope).catch(() => {});
      void setConnectionStatus(scope, "CONNECTED", { phoneNumber }).catch((err) =>
        console.error(`[whatsapp] failed to record CONNECTED for ${sessionId}:`, err)
      );
    },

    onDisconnected: (sessionId, reason) => {
      console.log(`[whatsapp] ${sessionId} disconnected (${reason})`);
      // A transient drop keeps the row CONNECTING (the manager is already reconnecting behind
      // it); a logout is terminal until someone re-pairs, and says so.
      const status = reason === "logged_out" ? "LOGGED_OUT" : "CONNECTING";
      const lastError =
        reason === "logged_out"
          ? "This device was unlinked from WhatsApp - pair it again to reconnect."
          : null;
      void setConnectionStatus(toScope(sessionId), status, { lastError }).catch((err) =>
        console.error(`[whatsapp] failed to record disconnect for ${sessionId}:`, err)
      );
    },

    onMessage: (tenantId, fromJid, text) => {
      // The platform line is for outbound notifications only — it belongs to no ISP, so there is
      // no customer account or package catalogue for the self-service menu to act against.
      if (tenantId === PLATFORM_SESSION_ID) {
        console.log(`[whatsapp] (platform) message from ${fromJid}: ${text}`);
        return;
      }
      void handleIncomingWhatsAppMessage(manager?.get(tenantId) ?? null, tenantId, fromJid, text);
    },
  });

  // The platform line stays env-gated, exactly as before — it is operator infrastructure, not
  // something a tenant opts into.
  if (env.ENABLE_WHATSAPP_BOT) {
    await manager.start(PLATFORM_SESSION_ID);
  }

  // Bring back every tenant that was linked before this restart, so a deploy doesn't quietly
  // knock every ISP's WhatsApp offline until someone notices and re-pairs.
  for (const tenantId of await listTenantsToRestore()) {
    try {
      await manager.start(tenantId);
    } catch (err) {
      console.error(`[whatsapp] failed to restore session for tenant ${tenantId}:`, err);
    }
  }

  return manager;
}
