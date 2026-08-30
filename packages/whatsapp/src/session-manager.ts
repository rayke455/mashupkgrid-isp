import path from "node:path";
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  type WASocket,
} from "@whiskeysockets/baileys";
import { pino } from "pino";

/**
 * Runs one WhatsApp session per tenant, so every ISP messages its customers from its own number.
 *
 * This replaced a single platform-wide account shared by every tenant, which had two problems it
 * could not solve: an inbound message carried nothing identifying which ISP the sender was a
 * customer of (the bot had to literally ask), and every ISP's outbound messages appeared to come
 * from the same unrelated number. With a session per tenant both fall away — the socket a message
 * arrives on *is* the tenant.
 *
 * Session keys are persisted per tenant under `<baseAuthPath>/<tenantId>` via Baileys'
 * useMultiFileAuthState, so a worker restart silently reconnects every previously-paired tenant
 * without anyone rescanning a QR code.
 */

const silentLogger = pino({ level: "silent" });

export interface SessionManagerEvents {
  /** A fresh QR code needs scanning for this tenant (first pair, or after a logout). */
  onQr?: (tenantId: string, qr: string) => void;
  /** Session is authenticated and usable. `phoneNumber` is the linked WhatsApp account. */
  onReady?: (tenantId: string, phoneNumber: string) => void;
  /** `reconnecting` is the ordinary transient drop this manager recovers from on its own;
   *  `logged_out` means the phone unlinked the device and the saved keys are now dead. */
  onDisconnected?: (tenantId: string, reason: "reconnecting" | "logged_out") => void;
  onMessage?: (tenantId: string, fromJid: string, text: string) => void;
}

interface TenantSession {
  socket: WASocket | null;
  /** Set while a deliberate stop() is in flight, so the resulting "close" event is not treated as
   *  a dropped connection to reconnect from — otherwise disconnecting from the dashboard would
   *  immediately reconnect itself. */
  stopping: boolean;
}

/** Baileys wraps disconnect reasons as Boom errors whose HTTP-style status is a DisconnectReason.
 *  Reading it through a narrow type guard avoids depending on @hapi/boom for one field. */
function disconnectStatusCode(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null && "output" in err) {
    const output = (err as { output?: { statusCode?: unknown } }).output;
    if (output && typeof output.statusCode === "number") return output.statusCode;
  }
  return undefined;
}

/** `sock.user.id` looks like "254703605266:12@s.whatsapp.net" — the digits before the colon are
 *  the linked account's actual number. */
function phoneFromSocket(sock: WASocket): string {
  const raw = sock.user?.id ?? "";
  const digits = raw.split(":")[0]?.replace(/\D/g, "") ?? "";
  return digits ? `+${digits}` : "";
}

export const PLATFORM_SESSION_ID = "platform";

export function normalizeSessionId(tenantId: string | null | undefined): string {
  return tenantId ?? PLATFORM_SESSION_ID;
}

export class WhatsAppSessionManager {
  private sessions = new Map<string, TenantSession>();

  constructor(
    private readonly baseAuthPath: string,
    private readonly events: SessionManagerEvents = {}
  ) {}

  /** Currently-usable socket for a tenant (or platform if null), or null if it isn't connected right now.
   *  Callers must re-read this per send rather than caching it: reconnects replace the socket instance. */
  get(tenantId: string | null | undefined): WASocket | null {
    const id = normalizeSessionId(tenantId);
    return this.sessions.get(id)?.socket ?? null;
  }

  isConnected(tenantId: string | null | undefined): boolean {
    return this.get(tenantId) !== null;
  }

  connectedTenantIds(): string[] {
    return [...this.sessions.entries()].filter(([, s]) => s.socket !== null).map(([id]) => id);
  }

  /**
   * Starts (or restarts) a tenant's session (or platform session if null). Safe to call when one is
   * already live — that's a no-op rather than a second competing socket for the same account.
   */
  async start(tenantId: string | null | undefined): Promise<void> {
    const id = normalizeSessionId(tenantId);
    if (this.sessions.get(id)?.socket) return;

    const session: TenantSession = this.sessions.get(id) ?? { socket: null, stopping: false };
    session.stopping = false;
    this.sessions.set(id, session);

    const { state, saveCreds } = await useMultiFileAuthState(path.join(this.baseAuthPath, id));
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({ version, auth: state, logger: silentLogger });
    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) this.events.onQr?.(id, qr);

      if (connection === "open") {
        session.socket = sock;
        this.events.onReady?.(id, phoneFromSocket(sock));
      }

      if (connection === "close") {
        session.socket = null;
        if (session.stopping) return; // deliberate stop() — do not resurrect it

        const loggedOut = disconnectStatusCode(lastDisconnect?.error) === DisconnectReason.loggedOut;
        if (loggedOut) {
          this.events.onDisconnected?.(id, "logged_out");
          this.sessions.delete(id);
          return;
        }
        this.events.onDisconnected?.(id, "reconnecting");
        void this.start(id).catch((err) =>
          console.error(`[whatsapp] reconnect failed for ${id}:`, err)
        );
      }
    });

    sock.ev.on("messages.upsert", ({ messages, type }) => {
      if (type !== "notify" || !this.events.onMessage) return;
      for (const msg of messages) {
        const from = msg.key.remoteJid;
        const text = msg.message?.conversation ?? msg.message?.extendedTextMessage?.text ?? undefined;
        if (from && text && !msg.key.fromMe) this.events.onMessage(id, from, text);
      }
    });
  }

  /** Closes a tenant's session without reconnecting. Note this does not delete the stored keys. */
  async stop(tenantId: string | null | undefined): Promise<void> {
    const id = normalizeSessionId(tenantId);
    const session = this.sessions.get(id);
    if (!session) return;
    session.stopping = true;
    try {
      session.socket?.end(undefined);
    } catch {
      // Already dead — nothing to close.
    }
    session.socket = null;
    this.sessions.delete(id);
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.stop(id)));
  }
}
