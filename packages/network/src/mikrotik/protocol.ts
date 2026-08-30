/**
 * RouterOS API wire protocol — pure encode/decode functions, no socket I/O, so they're unit
 * testable without a real router. Protocol reference: https://wiki.mikrotik.com/wiki/Manual:API
 *
 * Every "sentence" (a command, or one line of a reply) is a sequence of length-prefixed UTF-8
 * "words", terminated by a zero-length word.
 */

/** Encodes a word's length prefix per the API's variable-length integer scheme. */
export function encodeLength(length: number): Buffer {
  if (length < 0x80) {
    return Buffer.from([length]);
  }
  if (length < 0x4000) {
    const buf = Buffer.alloc(2);
    buf.writeUInt16BE(length | 0x8000, 0);
    return buf;
  }
  if (length < 0x200000) {
    const buf = Buffer.alloc(3);
    buf[0] = (length >> 16) | 0xc0;
    buf[1] = (length >> 8) & 0xff;
    buf[2] = length & 0xff;
    return buf;
  }
  if (length < 0x10000000) {
    const buf = Buffer.alloc(4);
    buf[0] = (length >> 24) | 0xe0;
    buf[1] = (length >> 16) & 0xff;
    buf[2] = (length >> 8) & 0xff;
    buf[3] = length & 0xff;
    return buf;
  }
  const buf = Buffer.alloc(5);
  buf[0] = 0xf0;
  buf.writeUInt32BE(length, 1);
  return buf;
}

/** Encodes a single word (length prefix + UTF-8 bytes). */
export function encodeWord(word: string): Buffer {
  const bytes = Buffer.from(word, "utf8");
  return Buffer.concat([encodeLength(bytes.length), bytes]);
}

/** Encodes a full sentence: each word, then a zero-length terminator. */
export function encodeSentence(words: readonly string[]): Buffer {
  const parts = words.map(encodeWord);
  parts.push(Buffer.from([0]));
  return Buffer.concat(parts);
}

/**
 * Incrementally decodes a byte stream into words. Callers push received bytes via `push()` and
 * pull complete words via `next()`. Keeping this stateful-but-pure (no socket references) is
 * what makes it testable by feeding it byte chunks directly, including a chunk split
 * mid-word — the case a real TCP stream will eventually produce.
 */
export class WordDecoder {
  private buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);

  push(chunk: Buffer<ArrayBufferLike>): void {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
  }

  /** Returns the next fully-buffered word (empty string for a sentence terminator), or `null`
   *  if more bytes are needed. Never throws on partial data — that's the "not enough yet" case. */
  next(): string | null {
    if (this.buffer.length === 0) return null;

    const first = this.buffer[0]!;
    let length: number;
    let headerLen: number;

    if ((first & 0x80) === 0x00) {
      length = first;
      headerLen = 1;
    } else if ((first & 0xc0) === 0x80) {
      if (this.buffer.length < 2) return null;
      length = ((first & 0x3f) << 8) | this.buffer[1]!;
      headerLen = 2;
    } else if ((first & 0xe0) === 0xc0) {
      if (this.buffer.length < 3) return null;
      length = ((first & 0x1f) << 16) | (this.buffer[1]! << 8) | this.buffer[2]!;
      headerLen = 3;
    } else if ((first & 0xf0) === 0xe0) {
      if (this.buffer.length < 4) return null;
      length = ((first & 0x0f) << 24) | (this.buffer[1]! << 16) | (this.buffer[2]! << 8) | this.buffer[3]!;
      headerLen = 4;
    } else {
      if (this.buffer.length < 5) return null;
      length = this.buffer.readUInt32BE(1);
      headerLen = 5;
    }

    if (this.buffer.length < headerLen + length) return null;

    const word = this.buffer.subarray(headerLen, headerLen + length).toString("utf8");
    this.buffer = this.buffer.subarray(headerLen + length);
    return word;
  }
}

export interface Sentence {
  /** The reply type word: "!re" (a result row), "!done", "!trap" (error), "!fatal". */
  type: string;
  attributes: Record<string, string>;
}

/**
 * Groups a flat word stream into sentences (a run of words up to a zero-length terminator).
 * `words` is consumed via the decoder's `next()` contract — this is the layer that knows a
 * sentence ends at the empty-string terminator, not the byte-level decoder above.
 */
export class SentenceAssembler {
  private currentWords: string[] = [];

  /** Feed one decoded word; returns the completed Sentence once a terminator is seen. */
  push(word: string): Sentence | null {
    if (word === "") {
      const words = this.currentWords;
      this.currentWords = [];
      if (words.length === 0) return null; // stray empty sentence, ignore
      const type = words[0]!;
      const attributes: Record<string, string> = {};
      for (const w of words.slice(1)) {
        if (w.startsWith("=")) {
          const eq = w.indexOf("=", 1);
          if (eq > 0) attributes[w.slice(1, eq)] = w.slice(eq + 1);
        } else if (w.startsWith(".")) {
          // Control words like ".tag=5" (RouterOSClient uses this to correlate a reply sentence
          // back to the talk() call that sent the matching request tag — see its doc comment).
          const eq = w.indexOf("=");
          if (eq > 0) attributes[w.slice(1, eq)] = w.slice(eq + 1);
        }
      }
      return { type, attributes };
    }
    this.currentWords.push(word);
    return null;
  }
}
