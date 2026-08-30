import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import { createHmac } from "node:crypto";
import { env } from "@mashupkgrid/config";
import { generateSecureToken } from "@mashupkgrid/shared";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface AccessTokenClaims {
  sub: string;
  tenantId: string | null;
  sessionId: string;
  roles: string[];
}

function accessSecretKey(): Uint8Array {
  return new TextEncoder().encode(env.JWT_ACCESS_SECRET);
}

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({
    tenantId: claims.tenantId,
    sessionId: claims.sessionId,
    roles: claims.roles,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS)
    .sign(accessSecretKey());
}

export class InvalidAccessTokenError extends Error {
  constructor(cause?: unknown) {
    super("Invalid or expired access token");
    this.name = "InvalidAccessTokenError";
    this.cause = cause;
  }
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, accessSecretKey());
    if (typeof payload.sub !== "string") throw new Error("Missing subject claim");
    return {
      sub: payload.sub,
      tenantId: (payload["tenantId"] as string | null | undefined) ?? null,
      sessionId: String(payload["sessionId"] ?? ""),
      roles: Array.isArray(payload["roles"]) ? (payload["roles"] as string[]) : [],
    };
  } catch (err) {
    if (err instanceof joseErrors.JOSEError) throw new InvalidAccessTokenError(err);
    throw err;
  }
}

/** Opaque, high-entropy refresh token. Only its peppered hash is ever persisted. */
export function generateRefreshToken(): string {
  return generateSecureToken(32);
}

/**
 * HMAC-SHA256 with a server-side pepper (JWT_REFRESH_PEPPER), distinct from the plain SHA-256
 * used for single-use email/reset tokens — refresh tokens are longer-lived and higher value,
 * so they get a peppered hash that can't be recomputed from a leaked database dump alone.
 */
export function hashRefreshToken(token: string): string {
  return createHmac("sha256", env.JWT_REFRESH_PEPPER).update(token).digest("hex");
}
