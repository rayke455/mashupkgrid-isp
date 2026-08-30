import { prisma, type Session } from "@mashupkgrid/database";
import { UnauthorizedError } from "@mashupkgrid/shared";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
} from "./tokens.js";
import { getEffectivePermissions } from "./rbac.js";

export interface DeviceContext {
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  session: Session;
  expiresInSeconds: number;
}

async function issueTokensForSession(
  userId: string,
  tenantId: string | null,
  session: Session
): Promise<IssuedTokens> {
  const permissions = await getEffectivePermissions(userId, tenantId);
  const accessToken = await signAccessToken({
    sub: userId,
    tenantId,
    sessionId: session.id,
    roles: [...permissions],
  });
  return { accessToken, refreshToken: "", session, expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS };
}

export async function createSession(
  userId: string,
  tenantId: string | null,
  device: DeviceContext
): Promise<IssuedTokens> {
  const refreshToken = generateRefreshToken();
  const session = await prisma.session.create({
    data: {
      userId,
      tenantId,
      refreshTokenHash: hashRefreshToken(refreshToken),
      userAgent: device.userAgent ?? null,
      ipAddress: device.ipAddress ?? null,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    },
  });
  const issued = await issueTokensForSession(userId, tenantId, session);
  return { ...issued, refreshToken };
}

/**
 * Rotates a refresh token. Detects reuse of an already-rotated (revoked) token — a strong
 * signal of token theft — and responds by revoking every session the user holds, not just
 * the one presented.
 */
export async function refreshSession(
  refreshToken: string,
  device: DeviceContext
): Promise<IssuedTokens> {
  const tokenHash = hashRefreshToken(refreshToken);
  const existing = await prisma.session.findUnique({ where: { refreshTokenHash: tokenHash } });

  if (!existing) {
    throw new UnauthorizedError("Invalid refresh token");
  }

  if (existing.revokedAt) {
    await prisma.session.updateMany({
      where: { userId: existing.userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: "refresh_token_reuse_detected" },
    });
    throw new UnauthorizedError(
      "Refresh token reuse detected — all sessions for this account have been revoked"
    );
  }

  if (existing.expiresAt < new Date()) {
    throw new UnauthorizedError("Refresh token has expired");
  }

  const newRefreshToken = generateRefreshToken();

  const [, newSession] = await prisma.$transaction([
    prisma.session.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), revokedReason: "rotated" },
    }),
    prisma.session.create({
      data: {
        userId: existing.userId,
        tenantId: existing.tenantId,
        refreshTokenHash: hashRefreshToken(newRefreshToken),
        userAgent: device.userAgent ?? existing.userAgent,
        ipAddress: device.ipAddress ?? existing.ipAddress,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
        previousSessionId: existing.id,
      },
    }),
  ]);

  const issued = await issueTokensForSession(existing.userId, existing.tenantId, newSession);
  return { ...issued, refreshToken: newRefreshToken };
}

export async function revokeSession(sessionId: string, reason = "logout"): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

export async function revokeAllSessionsForUser(userId: string, reason: string): Promise<number> {
  const result = await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  return result.count;
}

export async function listActiveSessionsForUser(userId: string): Promise<Session[]> {
  return prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: "desc" },
  });
}

export async function touchSession(sessionId: string): Promise<void> {
  await prisma.session.update({ where: { id: sessionId }, data: { lastUsedAt: new Date() } });
}
