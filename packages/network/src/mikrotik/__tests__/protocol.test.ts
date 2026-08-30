import { describe, it, expect } from "vitest";
import { encodeLength, encodeWord, encodeSentence, WordDecoder, SentenceAssembler } from "../protocol.js";

describe("encodeLength", () => {
  it("encodes lengths < 0x80 as a single byte", () => {
    expect(encodeLength(0)).toEqual(Buffer.from([0]));
    expect(encodeLength(5)).toEqual(Buffer.from([5]));
    expect(encodeLength(0x7f)).toEqual(Buffer.from([0x7f]));
  });

  it("encodes lengths < 0x4000 as two bytes with the high bit set", () => {
    const buf = encodeLength(0x80);
    expect(buf.length).toBe(2);
    expect(buf[0]! & 0x80).toBe(0x80);
  });

  it("encodes larger lengths with more bytes", () => {
    expect(encodeLength(0x4000).length).toBe(3);
    expect(encodeLength(0x200000).length).toBe(4);
    expect(encodeLength(0x10000000).length).toBe(5);
  });
});

describe("word/sentence round-trip through the decoder", () => {
  function decodeAll(buf: Buffer): string[] {
    const decoder = new WordDecoder();
    decoder.push(buf);
    const words: string[] = [];
    let word: string | null;
    while ((word = decoder.next()) !== null) words.push(word);
    return words;
  }

  it("round-trips a single short word", () => {
    expect(decodeAll(encodeWord("hello"))).toEqual(["hello"]);
  });

  it("round-trips an empty word (sentence terminator)", () => {
    expect(decodeAll(encodeWord(""))).toEqual([""]);
  });

  it("round-trips a word long enough to need the two-byte length form", () => {
    const long = "x".repeat(200);
    expect(decodeAll(encodeWord(long))).toEqual([long]);
  });

  it("round-trips a UTF-8 multi-byte word (length is byte length, not char length)", () => {
    const word = "café-résumé-日本語";
    expect(decodeAll(encodeWord(word))).toEqual([word]);
  });

  it("round-trips a full sentence (words + terminator)", () => {
    const words = encodeSentence(["/login", "=name=admin", "=password=secret"]);
    expect(decodeAll(words)).toEqual(["/login", "=name=admin", "=password=secret", ""]);
  });

  it("handles a chunk split in the middle of a word's length header and payload", () => {
    const encoded = encodeWord("x".repeat(300)); // needs the 2-byte length header
    const decoder = new WordDecoder();
    // Split mid-header (after 1 of the 2 length bytes) and again mid-payload.
    decoder.push(encoded.subarray(0, 1));
    expect(decoder.next()).toBeNull();
    decoder.push(encoded.subarray(1, 100));
    expect(decoder.next()).toBeNull();
    decoder.push(encoded.subarray(100));
    expect(decoder.next()).toBe("x".repeat(300));
  });
});

describe("SentenceAssembler", () => {
  it("assembles words into a Sentence on the terminator, splitting =key=value attributes", () => {
    const assembler = new SentenceAssembler();
    expect(assembler.push("!re")).toBeNull();
    expect(assembler.push("=name=ether1")).toBeNull();
    expect(assembler.push("=running=true")).toBeNull();
    const sentence = assembler.push("");
    expect(sentence).toEqual({
      type: "!re",
      attributes: { name: "ether1", running: "true" },
    });
  });

  it("handles an attribute value that itself contains an '=' character", () => {
    const assembler = new SentenceAssembler();
    assembler.push("!re");
    assembler.push("=comment=a=b=c");
    const sentence = assembler.push("");
    expect(sentence?.attributes["comment"]).toBe("a=b=c");
  });

  it("ignores a stray empty sentence with no words", () => {
    const assembler = new SentenceAssembler();
    expect(assembler.push("")).toBeNull();
  });

  it("resets after each sentence so a second sentence starts clean", () => {
    const assembler = new SentenceAssembler();
    assembler.push("!re");
    assembler.push("=a=1");
    assembler.push("");
    assembler.push("!done");
    const second = assembler.push("");
    expect(second).toEqual({ type: "!done", attributes: {} });
  });
});
