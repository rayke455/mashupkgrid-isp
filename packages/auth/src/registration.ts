import { prisma, type User } from "@mashupkgrid/database";
import { emailTransportConfigured } from "@mashupkgrid/config";
import {
  ConflictError,
  ValidationError,
  NotFoundError,
  generateSecureToken,
  hashToken,
  hashPassword,
  isPasswordStrongEnough,
} from "@mashupkgrid/shared";
import { createSession, type DeviceContext, type IssuedTokens } from "./session.js";

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export interface RegisterUserParams {
  tenantId: string | null;
  email: string;
  password: string;
  phone?: string | null;
  /** Used only to open a session immediately when the account is auto-verified (see below) —
   *  ignored otherwise. */
  device?: DeviceContext;
}

export interface RegisterUserResult {
  user: User;
  /** Raw verification token — never persisted; caller (API layer) hands this to the email job.
   *  Null when the account was auto-verified because no email transport is configured (see
   *  below) — there is nothing for a verification link to be emailed to a user through. */
  verificationToken: string | null;
  /** Set only when the account was auto-verified — lets the caller hand back a logged-in
   *  session directly instead of forcing a separate `/auth/login` request, which (unlike
   *  register) is tightly rate-limited. Absent when email verification is still required —
   *  there is nothing to log in with until that's done. */
  session: IssuedTokens | null;
}

export async function registerUser(params: RegisterUserParams): Promise<RegisterUserResult> {
  const email = params.email.trim().toLowerCase();

  if (!isPasswordStrongEnough(params.password)) {
    throw new ValidationError(
      "Password must be at least 10 characters and include a letter plus a digit or symbol"
    );
  }

  // findFirst, not findUnique — see the comment in login.ts for why (tenantId is nullable).
  const existing = await prisma.user.findFirst({ where: { tenantId: params.tenantId, email } });
  if (existing) {
    throw new ConflictError("An account with this email already exists");
  }

  const passwordHash = await hashPassword(params.password);

  // No SMTP configured means there is no way for this deployment to ever deliver a
  // verification email, so gating account activation on one would just lock every account out
  // permanently. This only ever triggers when the operator hasn't set SMTP_* — the moment real
  // credentials are configured (staging/production), the normal PENDING_VERIFICATION flow
  // below applies again automatically.
  if (!emailTransportConfigured) {
    const user = await prisma.user.create({
      data: {
        tenantId: params.tenantId,
        email,
        phone: params.phone ?? null,
        passwordHash,
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
    });
    const session = await createSession(user.id, user.tenantId, params.device ?? {});
    return { user, verificationToken: null, session };
  }

  const verificationToken = generateSecureToken();

  const user = await prisma.user.create({
    data: {
      tenantId: params.tenantId,
      email,
      phone: params.phone ?? null,
      passwordHash,
      status: "PENDING_VERIFICATION",
      emailVerificationTokens: {
        create: {
          tokenHash: hashToken(verificationToken),
          expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
        },
      },
    },
  });

  return { user, verificationToken, session: null };
}

export async function verifyEmailToken(rawToken: string): Promise<User> {
  const tokenHash = hashToken(rawToken);
  const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new ValidationError("This verification link is invalid or has expired");
  }

  const [, user] = await prisma.$transaction([
    prisma.emailVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date(), status: "ACTIVE" },
    }),
  ]);

  return user;
}

export async function resendVerificationEmail(
  tenantId: string | null,
  email: string
): Promise<{ user: User; verificationToken: string } | null> {
  const user = await prisma.user.findFirst({ where: { tenantId, email: email.trim().toLowerCase() } });
  if (!user || user.emailVerifiedAt) return null;

  const verificationToken = generateSecureToken();
  await prisma.$transaction([
    prisma.emailVerificationToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(verificationToken),
        expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
      },
    }),
  ]);

  return { user, verificationToken };
}

export async function requestPasswordReset(
  tenantId: string | null,
  email: string
): Promise<{ user: User; resetToken: string } | null> {
  const user = await prisma.user.findFirst({ where: { tenantId, email: email.trim().toLowerCase() } });
  if (!user) return null;

  const resetToken = generateSecureToken();
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(resetToken),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    }),
  ]);

  return { user, resetToken };
}

export async function resetPassword(rawToken: string, newPassword: string): Promise<User> {
  if (!isPasswordStrongEnough(newPassword)) {
    throw new ValidationError(
      "Password must be at least 10 characters and include a letter plus a digit or symbol"
    );
  }

  const tokenHash = hashToken(rawToken);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new ValidationError("This password reset link is invalid or has expired");
  }

  const passwordHash = await hashPassword(newPassword);

  const [, user] = await prisma.$transaction([
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
    }),
    // A successful reset revokes every existing session — defense against a compromised
    // password being used alongside a hijacked session (docs/architecture/02).
    prisma.session.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: "password_reset" },
    }),
  ]);

  if (!user) throw new NotFoundError("User");
  return user;
}
