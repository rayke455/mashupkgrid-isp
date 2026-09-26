import { describe, it, expect } from "vitest";
import { base32Decode, base32Encode, generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, otpauthUrl, totpAt, verifyTotp } from "../totp.js";

// RFC 6238 appendix B, SHA-1: the key is the ASCII string "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP", () => {
  it("matches the RFC 6238 test vectors", () => {
    expect(totpAt(RFC_SECRET, new Date(59_000), 8)).toBe("94287082");
    expect(totpAt(RFC_SECRET, new Date(1_111_111_109_000), 8)).toBe("07081804");
    expect(totpAt(RFC_SECRET, new Date(1_234_567_890_000), 8)).toBe("89005924");
    expect(totpAt(RFC_SECRET, new Date(2_000_000_000_000), 8)).toBe("69279037");
  });

  it("accepts the current code and one step either side, nothing further", () => {
    const secret = generateTotpSecret();
    const now = new Date("2026-10-01T10:00:15Z");
    expect(verifyTotp(secret, totpAt(secret, now), now)).toBe(true);
    expect(verifyTotp(secret, totpAt(secret, new Date(now.getTime() - 30_000)), now)).toBe(true);
    expect(verifyTotp(secret, totpAt(secret, new Date(now.getTime() + 30_000)), now)).toBe(true);
    expect(verifyTotp(secret, totpAt(secret, new Date(now.getTime() - 90_000)), now)).toBe(false);
    expect(verifyTotp(secret, "12345", now)).toBe(false);
    expect(verifyTotp(secret, "abcdef", now)).toBe(false);
  });

  it("round-trips base32 and builds an authenticator link", () => {
    const buf = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(base32Decode(base32Encode(buf))).toEqual(buf);
    expect(otpauthUrl("Demo ISP", "owner@demo.local", "ABC")).toBe("otpauth://totp/Demo%20ISP%3Aowner%40demo.local?secret=ABC&issuer=Demo%20ISP&algorithm=SHA1&digits=6&period=30");
  });
});

describe("recovery codes", () => {
  it("are ten distinct codes, matched however they are typed", () => {
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}$/);
    expect(hashRecoveryCode(codes[0]!.toUpperCase().replace("-", " "))).toBe(hashRecoveryCode(codes[0]!));
  });
});
