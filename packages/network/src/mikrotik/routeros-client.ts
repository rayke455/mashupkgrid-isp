import { Socket, connect as netConnect } from "node:net";
import { connect as tlsConnect, type TLSSocket } from "node:tls";
import { encodeSentence, WordDecoder, SentenceAssembler, type Sentence } from "./protocol.js";

export interface RouterOSConnectOptions {
  host: string;
  port: number;
  useTls: boolean;
  /** Connection + per-command timeout, milliseconds. */
  timeoutMs?: number;
}

export class RouterOSApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RouterOSApiError";
  }
}

/**
 * A real RouterOS API client (binary protocol, TCP 8728 / TLS 8729) — not a REST wrapper.
 * Implements the post-6.43 plaintext login only; legacy MD5-challenge auth (pre-6.43) is not
 * supported and is a documented gap, not a silent failure (connect() throws a clear error if a
 * router responds with the old-style challenge).
 */
export class RouterOSClient {
  private socket: Socket | TLSSocket | null = null;
  private decoder = new WordDecoder();
  private assembler = new SentenceAssembler();
  // RouterOS lets multiple commands be in flight on one connection at once, correlated by the
  // request's own `.tag=` word, which every reply sentence echoes back — required here because
  // MikroTikAdapter issues concurrent talk()/print() calls on the same client (e.g.
  // getActiveSessions's Promise.all of ppp + hotspot prints). A single shared FIFO queue (the
  // previous design) handed whichever call's loop happened to run next whatever sentence was at
  // the front, regardless of which command it actually replied to — fine when exactly one talk()
  // is ever in flight, silently cross-wiring results between two concurrent ones otherwise.
  private nextTag = 1;
  private pendingByTag = new Map<string, Sentence[]>();
  private waitersByTag = new Map<string, () => void>();
  private readonly timeoutMs: number;

  constructor(private readonly options: RouterOSConnectOptions) {
    this.timeoutMs = options.timeoutMs ?? 8000;
  }

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      // `socket.setTimeout()` only *emits* "timeout" on idle — it does not close the socket or
      // abort an in-flight TCP handshake. Removing the "error" listener in cleanup() without
      // also destroying the socket left the still-connecting socket free to later emit "error"
      // (e.g. the OS finally reporting ETIMEDOUT) with no listener attached at all — Node's
      // default behavior for an unhandled "error" event is to throw, which took down the whole
      // process. Every exit path below must destroy the socket, not just remove listeners.
      const onError = (err: Error) => {
        cleanup();
        socket.destroy();
        reject(new RouterOSApiError(`Failed to connect to ${this.options.host}:${this.options.port}: ${err.message}`));
      };
      const onTimeout = () => {
        cleanup();
        socket.destroy();
        reject(new RouterOSApiError(`Connection to ${this.options.host}:${this.options.port} timed out`));
      };
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        socket.removeListener("error", onError);
        socket.removeListener("timeout", onTimeout);
        socket.removeListener("connect", onConnect);
        socket.removeListener("secureConnect", onConnect);
      };

      const socket = this.options.useTls
        ? tlsConnect({ host: this.options.host, port: this.options.port, rejectUnauthorized: false })
        : netConnect({ host: this.options.host, port: this.options.port });

      socket.setTimeout(this.timeoutMs);
      socket.once("error", onError);
      socket.once("timeout", onTimeout);
      socket.once(this.options.useTls ? "secureConnect" : "connect", onConnect);

      this.socket = socket;
    });

    this.socket!.on("data", (chunk: Buffer) => {
      this.decoder.push(chunk);
      for (;;) {
        const word = this.decoder.next();
        if (word === null) break;
        const sentence = this.assembler.push(word);
        if (sentence) {
          // Every sentence we send carries a `.tag=`, so every reply RouterOS sends back for it
          // does too — a sentence with no tag (or a tag no longer tracked, e.g. its talk() call
          // already timed out) is dropped rather than guessed at.
          const tag = sentence.attributes["tag"];
          if (tag !== undefined) {
            this.pendingByTag.get(tag)?.push(sentence);
            const waiter = this.waitersByTag.get(tag);
            if (waiter) {
              this.waitersByTag.delete(tag);
              waiter();
            }
          }
        }
      }
    });

    // A permanent handler for the life of the connection — without one, any post-connect socket
    // error (reset, router reboot mid-session) is just as unhandled-error-crashes-the-process as
    // the connect-time bug above. Reject every in-flight talk() waiter so callers see a clean
    // rejection instead of hanging forever on a dead socket.
    this.socket!.on("error", () => {
      this.socket?.destroy();
      this.socket = null;
      const waiters = [...this.waitersByTag.values()];
      this.waitersByTag.clear();
      for (const waiter of waiters) waiter();
    });
  }

  async login(username: string, password: string): Promise<void> {
    const sentences = await this.talk(["/login", `=name=${username}`, `=password=${password}`]);
    const trap = sentences.find((s) => s.type === "!trap");
    if (trap) {
      throw new RouterOSApiError(
        trap.attributes["message"] ??
          "Login failed — if this router is on RouterOS < 6.43, legacy challenge-response auth is not supported"
      );
    }
  }

  /** Sends one command sentence and collects every reply sentence up to (and including) `!done`.
   *  Safe to call concurrently on the same client — each call gets its own request tag and only
   *  ever consumes sentences RouterOS echoes that tag back on. */
  async talk(words: readonly string[]): Promise<Sentence[]> {
    if (!this.socket) throw new RouterOSApiError("Not connected");
    const tag = String(this.nextTag++);
    this.pendingByTag.set(tag, []);
    this.socket.write(encodeSentence([...words, `.tag=${tag}`]));

    try {
      const collected: Sentence[] = [];
      const deadline = Date.now() + this.timeoutMs;

      for (;;) {
        const queue = this.pendingByTag.get(tag)!;
        const next = queue.shift();
        if (next) {
          collected.push(next);
          if (next.type === "!done") return collected;
          continue;
        }

        // The persistent post-connect error handler nulls this out and wakes every waiter so a
        // dropped connection surfaces as a clean rejection here, not an infinite wait.
        if (!this.socket) {
          throw new RouterOSApiError(`Connection lost while waiting for a reply to ${words[0] ?? "(command)"}`);
        }

        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          throw new RouterOSApiError(`Timed out waiting for a reply to ${words[0] ?? "(command)"}`);
        }
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            this.waitersByTag.delete(tag);
            reject(new RouterOSApiError(`Timed out waiting for a reply to ${words[0] ?? "(command)"}`));
          }, remaining);
          this.waitersByTag.set(tag, () => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
    } finally {
      this.pendingByTag.delete(tag);
      this.waitersByTag.delete(tag);
    }
  }

  /** Convenience wrapper: runs a `/path/print`-style command and returns just the `!re` rows. */
  async print(words: readonly string[]): Promise<Array<Record<string, string>>> {
    const sentences = await this.talk(words);
    const trap = sentences.find((s) => s.type === "!trap");
    if (trap) throw new RouterOSApiError(trap.attributes["message"] ?? "RouterOS command failed");
    return sentences.filter((s) => s.type === "!re").map((s) => s.attributes);
  }

  disconnect(): void {
    this.socket?.destroy();
    this.socket = null;
  }
}
