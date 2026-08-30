import type { FastifyRequest } from "fastify";
import { verifyAccessToken, InvalidAccessTokenError, touchSession } from "@mashupkgrid/auth";
import { prisma } from "@mashupkgrid/database";
import { UnauthorizedError, hashToken } from "@mashupkgrid/shared";

/** Tenant-issued API tokens (Settings → Developer) are prefixed so they're distinguishable from
 *  session JWTs at a glance without decoding anything — a leaked token in a log line reads
 *  unambiguously as "API token", not "possibly a session JWT". */
const API_KEY_PREFIX = "mkg_";

async function authenticateApiKey(request: FastifyRequest, token: string): Promise<void> {
  const apiKey = await prisma.apiKey.findUnique({ where: { keyHash: hashToken(token) } });
  if (!apiKey || apiKey.revokedAt || !apiKey.createdByUserId) {
    // A key whose creating user was deleted has nobody's permissions left to act as — treat it
    // as revoked rather than falling back to some ambient tenant-wide access it never had.
    throw new UnauthorizedError("Invalid or revoked API token");
  }

  // Best-effort — a failed write here must never block the request the token is authenticating.
  void prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  request.user = {
    id: apiKey.createdByUserId,
    tenantId: apiKey.tenantId,
    sessionId: `api-key:${apiKey.id}`,
    apiKeyScopes: apiKey.scopes.length > 0 ? apiKey.scopes : null,
  };
}

/**
 * preHandler that authenticates the request from the `Authorization: Bearer <accessToken>`
 * header. The JWT signature/expiry check is stateless (fast path), but we still cross-check
 * the session hasn't been revoked (logout, password reset, detected token-theft) — a revoked
 * session must stop working immediately, not just after the 15-minute access token expiry.
 */
export async function authenticate(request: FastifyRequest): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing bearer token");
  }
  const token = header.slice("Bearer ".length);

  if (token.startsWith(API_KEY_PREFIX)) {
    return authenticateApiKey(request, token);
  }

  let claims;
  try {
    claims = await verifyAccessToken(token);
  } catch (err) {
    if (err instanceof InvalidAccessTokenError) {
      throw new UnauthorizedError("Invalid or expired access token");
    }
    throw err;
  }

  const session = await prisma.session.findUnique({ where: { id: claims.sessionId } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw new UnauthorizedError("Session has been revoked or expired");
  }

  // Best-effort, same pattern as the API-key path above — without this, `Session.lastUsedAt`
  // never advances past session creation, so the sessions-list UI (sessions.ts, ordered and
  // displayed by lastUsedAt) can never actually tell a user which of their sessions is stale.
  void touchSession(session.id).catch(() => {});

  request.user = { id: claims.sub, tenantId: claims.tenantId, sessionId: claims.sessionId };
}
