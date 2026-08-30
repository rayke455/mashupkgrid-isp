import { prisma, type User } from "@mashupkgrid/database";
import { UnauthorizedError, verifyPassword, hashPassword } from "@mashupkgrid/shared";
import { createSession, type DeviceContext, type IssuedTokens } from "./session.js";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

// A "user not found" response returned immediately (one fast DB read) while a wrong-password
// response only returns after a real Argon2 verify (tens of milliseconds) — even with an
// identical error body, that latency gap is itself an account-enumeration oracle. Hashed once
// lazily and reused: verifying against it costs the same as a real check without needing a real
// user's hash on hand.
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) dummyHashPromise = hashPassword("timing-defense-dummy-password-never-used");
  return dummyHashPromise;
}

export interface LoginParams {
  tenantId: string | null;
  email: string;
  password: string;
  device: DeviceContext;
}

export interface LoginResult extends IssuedTokens {
  user: User;
}

/**
 * Verifies credentials, enforces account lockout, records the attempt, and — on success —
 * issues a new session. Every branch (including "user not found") records a LoginAttempt row
 * and returns the same generic UnauthorizedError so account existence is never leaked.
 */
export async function attemptLogin(params: LoginParams): Promise<LoginResult> {
  const { tenantId, email, password, device } = params;
  const normalizedEmail = email.trim().toLowerCase();

  // findFirst rather than findUnique: Prisma's compound-unique `where` input requires a
  // non-null value for every field in the key, but tenantId is null for platform (super admin)
  // accounts. findFirst against the same two columns still resolves through the same
  // (tenantId, email) unique index at the database level.
  const user = await prisma.user.findFirst({
    where: { tenantId, email: normalizedEmail },
  });

  const recordAttempt = (success: boolean, failureReason?: string) =>
    prisma.loginAttempt.create({
      data: {
        userId: user?.id,
        email: normalizedEmail,
        tenantId,
        ipAddress: device.ipAddress ?? "unknown",
        userAgent: device.userAgent ?? null,
        success,
        failureReason,
      },
    });

  if (!user) {
    await verifyPassword(await getDummyHash(), password);
    await recordAttempt(false, "user_not_found");
    throw new UnauthorizedError("Invalid email or password");
  }

  if (user.status === "SUSPENDED") {
    await recordAttempt(false, "account_suspended");
    throw new UnauthorizedError("Invalid email or password");
  }

  // Without this, a correct password for a PENDING_VERIFICATION account (created but its email
  // link never clicked) issued a full session anyway — completely bypassing the verification
  // gate registration.ts otherwise enforces (no session is returned at registration time
  // specifically so verification is required first). Same generic error as every other branch
  // here, for the same anti-enumeration reason.
  if (user.status === "PENDING_VERIFICATION") {
    await recordAttempt(false, "pending_verification");
    throw new UnauthorizedError("Invalid email or password");
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await recordAttempt(false, "account_locked");
    // Deliberately the same generic error every other failure branch in this function returns
    // (see below and the "user not found" branch above) — a distinct response here would let an
    // unauthenticated caller confirm an account exists (and its lockout state) without ever
    // knowing its password. AccountLockedError still exists for callers who legitimately need
    // the distinction (e.g. a future authenticated "why can't I log in" support view).
    throw new UnauthorizedError("Invalid email or password");
  }

  const passwordValid = await verifyPassword(user.passwordHash, password);

  if (!passwordValid) {
    const failedLoginCount = user.failedLoginCount + 1;
    const shouldLock = failedLoginCount >= MAX_FAILED_ATTEMPTS;
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: shouldLock ? 0 : failedLoginCount,
          lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null,
        },
      }),
      recordAttempt(false, "bad_password"),
    ]);
    // Same generic error whether this attempt just tripped the lockout or not — see the comment
    // on the lockedUntil check above.
    throw new UnauthorizedError("Invalid email or password");
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    }),
    recordAttempt(true),
  ]);

  const issued = await createSession(user.id, user.tenantId, device);
  return { ...issued, user };
}

/**
 * Heuristic "suspicious login" detector: has this user ever successfully logged in from this
 * IP/user-agent pair before? Does not block login — callers use this to decide whether to
 * fire a notification.
 */
export async function isSuspiciousLogin(userId: string, device: DeviceContext): Promise<boolean> {
  if (!device.ipAddress) return false;
  const priorSuccess = await prisma.loginAttempt.findFirst({
    where: {
      userId,
      success: true,
      ipAddress: device.ipAddress,
      userAgent: device.userAgent ?? undefined,
    },
  });
  return !priorSuccess;
}
