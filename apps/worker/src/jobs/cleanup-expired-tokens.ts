import { prisma } from "@mashupkgrid/database";

/**
 * Prunes expired/used single-use tokens and long-expired revoked sessions. NON-CRITICAL per
 * the job classification (docs/architecture/05) — purely storage hygiene, never blocks a
 * user-facing flow.
 */
export async function handleCleanupExpiredTokens(): Promise<void> {
  const now = new Date();

  await prisma.emailVerificationToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] },
  });

  await prisma.passwordResetToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] },
  });

  const sessionRetentionCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  await prisma.session.deleteMany({
    where: { revokedAt: { not: null, lt: sessionRetentionCutoff } },
  });

  await prisma.loginAttempt.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000) } },
  });
}
