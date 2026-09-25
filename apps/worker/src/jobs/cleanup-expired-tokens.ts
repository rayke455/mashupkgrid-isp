import { prisma } from "@mashupkgrid/database";
import type { AutomationSummary } from "@mashupkgrid/shared";

/**
 * Prunes expired/used single-use tokens and long-expired revoked sessions. NON-CRITICAL per
 * the job classification (docs/architecture/05) — purely storage hygiene, never blocks a
 * user-facing flow.
 */
export async function handleCleanupExpiredTokens(): Promise<AutomationSummary> {
  const now = new Date();

  const verificationTokens = await prisma.emailVerificationToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] },
  });

  const resetTokens = await prisma.passwordResetToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] },
  });

  const sessionRetentionCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const sessions = await prisma.session.deleteMany({
    where: { revokedAt: { not: null, lt: sessionRetentionCutoff } },
  });

  const loginAttempts = await prisma.loginAttempt.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000) } },
  });

  return {
    verificationTokens: verificationTokens.count,
    resetTokens: resetTokens.count,
    sessions: sessions.count,
    loginAttempts: loginAttempts.count,
  };
}
