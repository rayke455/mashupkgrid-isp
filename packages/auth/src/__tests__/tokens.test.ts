import { describe, it, expect } from "vitest";
import {
  signAccessToken,
  verifyAccessToken,
  InvalidAccessTokenError,
  generateRefreshToken,
  hashRefreshToken,
} from "../tokens.js";

describe("access tokens", () => {
  it("round-trips claims through sign/verify", async () => {
    const token = await signAccessToken({
      sub: "user-1",
      tenantId: "tenant-1",
      sessionId: "session-1",
      roles: ["customers.read", "billing.read"],
    });
    const claims = await verifyAccessToken(token);
    expect(claims).toEqual({
      sub: "user-1",
      tenantId: "tenant-1",
      sessionId: "session-1",
      roles: ["customers.read", "billing.read"],
    });
  });

  it("supports a null tenantId for platform-level (super admin) tokens", async () => {
    const token = await signAccessToken({
      sub: "super-1",
      tenantId: null,
      sessionId: "session-2",
      roles: [],
    });
    const claims = await verifyAccessToken(token);
    expect(claims.tenantId).toBeNull();
  });

  it("rejects a tampered token", async () => {
    const token = await signAccessToken({
      sub: "user-1",
      tenantId: null,
      sessionId: "session-1",
      roles: [],
    });
    const tampered = token.slice(0, -2) + "xx";
    await expect(verifyAccessToken(tampered)).rejects.toThrow(InvalidAccessTokenError);
  });

  it("rejects garbage input", async () => {
    await expect(verifyAccessToken("not-a-jwt")).rejects.toThrow(InvalidAccessTokenError);
  });
});

describe("refresh tokens", () => {
  it("generates high-entropy, unique tokens", () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(32);
  });

  it("hashes deterministically (needed to look up by hash)", () => {
    const token = generateRefreshToken();
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
  });

  it("never stores the raw token in its hash", () => {
    const token = "raw-refresh-token-value";
    expect(hashRefreshToken(token)).not.toContain(token);
  });
});
