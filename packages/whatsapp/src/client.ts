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
    if (type !== "notify" || !options.onMessage) return;
    for (const msg of messages) {
      const from = msg.key.remoteJid;
      const text =
        msg.message?.conversation ?? msg.message?.extendedTextMessage?.text ?? undefined;
      if (from && text && !msg.key.fromMe) {
        options.onMessage(from, text);
      }
    }
  });

  return sock;
}

/** Turns a phone number into the `<digits>@s.whatsapp.net` JID Baileys' `sendMessage` expects.
 *  Strips every non-digit rather than just a leading `+`: callers hand this numbers straight out
 *  of user input and DB columns in a mix of shapes ("+254 703605266" from the registration
 *  wizard, "254703605266" from M-Pesa), and a JID containing a space or dash is silently
 *  undeliverable rather than an error. Group chats use a different JID shape (`...@g.us`) and are
 *  out of scope here. */
export function phoneToWhatsAppJid(phone: string): string {
  return `${phone.replace(/\D/g, "")}@s.whatsapp.net`;
}

export async function sendWhatsAppMessage(sock: WASocket, e164Phone: string, text: string): Promise<void> {
  await sock.sendMessage(phoneToWhatsAppJid(e164Phone), { text });
}
