// Named import (not the default) deliberately — baileys ships CJS type declarations that
// resolve incorrectly under strict NodeNext default-import interop (TypeScript ends up typing
// the default import as the whole module namespace instead of the callable function, which then
// cascades into every downstream inferred type in this file). The `.d.ts` re-exports the same
// function as a plain named binding specifically for interop cases like this one.
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  type WASocket,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
// Same NodeNext default-import quirk as baileys above — pino's own .d.ts re-exports itself as a
// named `pino` binding for exactly this reason.
import { pino } from "pino";

// Re-exported so callers outside this package (apps/worker's job handlers) can type a stored
// socket reference without reaching into @whiskeysockets/baileys directly.
export type { WASocket };

/** Quiet by default — Baileys' own logger is extremely chatty at "info"; callers who want to
 *  debug a connection can pass a louder one into connect() instead. */
const silentLogger = pino({ level: "silent" });

export interface WhatsAppConnectOptions {
  /** Folder Baileys persists the paired session's auth keys into (see
   *  useMultiFileAuthState) — reusing the same folder across restarts is what avoids having to
   *  scan the QR code again every time the process restarts. */
  authStatePath: string;
  /** Called every time a fresh QR code needs scanning (first pairing, or after the session was
   *  invalidated). Defaults to printing it straight to the terminal. */
  onQr?: (qr: string) => void;
  /** Called once the socket is fully authenticated and ready to send/receive — with the socket
   *  that's actually ready, not necessarily the one connectWhatsApp() originally returned: right
   *  after a first-time pairing WhatsApp's servers commonly cycle the connection once more while
   *  finishing multi-device sync, and connectWhatsApp() transparently reconnects with a brand
   *  new WASocket instance when that happens (see the "connection" === "close" branch below). A
   *  caller that closed over the original return value instead of this parameter would keep
   *  retrying against a socket that's already dead. */
  onReady?: (sock: WASocket) => void;
  /** Called for every inbound message this account receives (only the plain-text body is
   *  extracted — media/reactions/etc. are ignored, since a caller building a bot only ever needs
   *  the addressable "who said what" pair). */
  onMessage?: (from: string, text: string) => void;
  /** Called whenever the connection drops — including the transient drops this function then
   *  transparently reconnects from. Pairs with `onReady` for callers that gate work on "is there
   *  a usable socket right now": between a disconnect and the next `onReady`, any socket a caller
   *  is holding is dead, and sending on it fails deep inside Baileys rather than cleanly. */
  onDisconnected?: () => void;
}

/** A Baileys-specific narrowing of the `Error` a closed connection carries — Baileys wraps every
 *  disconnect reason as a `Boom` error whose HTTP-style status code is one of
 *  `DisconnectReason`'s values, but depending directly on `@hapi/boom`'s types just for this one
 *  field isn't worth a second dependency. */
function disconnectStatusCode(err: unknown): number | undefined {
  if (
    typeof err === "object" &&
    err !== null &&
    "output" in err &&
    typeof (err as { output?: unknown }).output === "object" &&
    (err as { output?: { statusCode?: unknown } }).output !== null
  ) {
    const statusCode = (err as { output?: { statusCode?: unknown } }).output?.statusCode;
    return typeof statusCode === "number" ? statusCode : undefined;
  }
  return undefined;
}

/**
 * Connects a self-hosted WhatsApp session (WhatsApp Web's multi-device protocol via Baileys) —
 * pairs with a real WhatsApp account by QR code, no Meta Business API credentials needed. The
 * first call prints a QR code (scan it from the phone's WhatsApp: Linked Devices > Link a
 * Device); every call after that reuses the session saved under `authStatePath` and reconnects
 * silently. Auto-reconnects on any drop except an explicit logout (DisconnectReason.loggedOut),
 * which means the session was invalidated from the phone side and a fresh QR scan is required —
 * see the module doc in connect.ts for the standalone pairing flow.
 */
export async function connectWhatsApp(options: WhatsAppConnectOptions): Promise<WASocket> {
  const { state, saveCreds } = await useMultiFileAuthState(options.authStatePath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: silentLogger,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      if (options.onQr) {
        options.onQr(qr);
      } else {
        qrcode.generate(qr, { small: true });
      }
    }

    if (connection === "open") {
      options.onReady?.(sock);
    }

    if (connection === "close") {
      options.onDisconnected?.();
      const statusCode = disconnectStatusCode(lastDisconnect?.error);
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      if (!loggedOut) {
        // Any other close (network blip, WhatsApp server restart, etc.) — reconnect with the
        // same auth state rather than giving up; this is the normal, expected way a long-lived
        // Baileys connection behaves, not an error condition.
        void connectWhatsApp(options);
      } else {
        console.error(
          `[whatsapp] session logged out from the phone side — delete "${options.authStatePath}" and re-run connect to pair again`
        );
      }
    }
  });

  sock.ev.on("messages.upsert", ({ messages, type }) => {
    if ((type !== "notify" && type !== "append") || !options.onMessage) return;
    for (const msg of messages) {
      const from = msg.key.remoteJid;
      const text =
        msg.message?.conversation ?? msg.message?.extendedTextMessage?.text ?? undefined;
      if (!from || !text) continue;

      const isSelf = isSelfChat(sock, from);
      const fromMe = Boolean(msg.key.fromMe);

      // Discard messages generated by the bot itself to prevent infinite loops
      if (isBotSentMessage(msg.key.id, text)) continue;

      // Allow incoming messages from other people, or messages typed to oneself
      if (!fromMe || isSelf) {
        options.onMessage(from, text);
      }
    }
  });

  return sock;
}

const sentBotMessageIds = new Set<string>();
const recentBotTexts = new Set<string>();

export function recordBotSentMessage(messageId?: string | null, text?: string | null): void {
  if (messageId) {
    sentBotMessageIds.add(messageId);
    if (sentBotMessageIds.size > 2000) {
      const it = sentBotMessageIds.values();
      for (let i = 0; i < 500; i++) {
        const n = it.next();
        if (n.done) break;
        sentBotMessageIds.delete(n.value);
      }
    }
  }
  if (text) {
    recentBotTexts.add(text.trim());
    if (recentBotTexts.size > 100) {
      const it = recentBotTexts.values();
      for (let i = 0; i < 30; i++) {
        const n = it.next();
        if (n.done) break;
        recentBotTexts.delete(n.value);
      }
    }
  }
}

export function isBotSentMessage(messageId?: string | null, text?: string | null): boolean {
  if (messageId && sentBotMessageIds.has(messageId)) return true;
  if (text && recentBotTexts.has(text.trim())) return true;
  return false;
}

export function extractMessageText(msg: any): string | undefined {
  if (!msg?.message) return undefined;
  const m = msg.message;
  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.ephemeralMessage?.message?.conversation ??
    m.ephemeralMessage?.message?.extendedTextMessage?.text ??
    m.viewOnceMessage?.message?.conversation ??
    m.viewOnceMessage?.message?.extendedTextMessage?.text ??
    m.viewOnceMessageV2?.message?.conversation ??
    m.viewOnceMessageV2?.message?.extendedTextMessage?.text ??
    m.documentWithCaptionMessage?.message?.documentMessage?.caption ??
    undefined
  );
}

export function isSelfChat(sock: WASocket, remoteJid?: string | null): boolean {
  if (!remoteJid || !sock.user) return false;
  const myDigits = sock.user.id?.split(":")[0]?.replace(/\D/g, "");
  const remoteDigits = remoteJid.split("@")[0]?.replace(/\D/g, "");
  if (myDigits && remoteDigits && myDigits === remoteDigits) return true;

  const myLid = (sock.user as any)?.lid?.split("@")[0];
  if (myLid && remoteJid.startsWith(myLid)) return true;

  return false;
}

/** Turns a phone number or existing JID into the `<digits>@s.whatsapp.net` JID Baileys' `sendMessage` expects.
 *  Strips every non-digit rather than just a leading `+`. If already a JID (contains @), preserves it. */
export function phoneToWhatsAppJid(phone: string): string {
  if (phone.includes("@")) return phone;
  return `${phone.replace(/\D/g, "")}@s.whatsapp.net`;
}

export async function sendWhatsAppMessage(sock: WASocket, e164Phone: string, text: string): Promise<void> {
  recordBotSentMessage(null, text);
  const targetJid = phoneToWhatsAppJid(e164Phone);
  const result = await sock.sendMessage(targetJid, { text });
  if (result?.key?.id) {
    recordBotSentMessage(result.key.id, text);
  }
}
