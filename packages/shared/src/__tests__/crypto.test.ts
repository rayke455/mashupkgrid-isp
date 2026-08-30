import { describe, it, expect } from "vitest";
import { encryptAtRest, decryptAtRest, generateSecureToken, hashToken, timingSafeStringEqual } from "../crypto.js";

const KEY = "a".repeat(64); // 32 bytes hex

describe("encryptAtRest / decryptAtRest", () => {
  it("round-trips plaintext", () => {
    const encrypted = encryptAtRest("router-secret-password", KEY);
    expect(encrypted).not.toContain("router-secret-password");
    expect(decryptAtRest(encrypted, KEY)).toBe("router-secret-password");
  });

  it("produces different ciphertext for the same plaintext each time (random IV)", () => {
    const a = encryptAtRest("same-value", KEY);
    const b = encryptAtRest("same-value", KEY);
    expect(a).not.toBe(b);
  });

  it("fails to decrypt with the wrong key", () => {
    const encrypted = encryptAtRest("secret", KEY);
    const wrongKey = "b".repeat(64);
    expect(() => decryptAtRest(encrypted, wrongKey)).toThrow();
  });

  it("rejects a malformed payload", () => {
    expect(() => decryptAtRest("not-a-valid-payload", KEY)).toThrow();
  });
});

describe("generateSecureToken / hashToken", () => {
  it("generates tokens of sufficient length and uniqueness", () => {
    const a = generateSecureToken();
    const b = generateSecureToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(32);
  });

  it("hashToken is deterministic and one-way-looking", () => {
    const token = "abc123";
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(token);
    expect(hashToken(token)).toHaveLength(64); // sha256 hex
  });
});

describe("timingSafeStringEqual", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeStringEqual("hunter2", "hunter2")).toBe(true);
  });

  it("returns false for different strings", () => {
    expect(timingSafeStringEqual("hunter2", "hunter3")).toBe(false);
  });

  it("returns false for strings of different length (without throwing)", () => {
    expect(timingSafeStringEqual("short", "a-much-longer-string")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(timingSafeStringEqual("Secret", "secret")).toBe(false);
  });
});
