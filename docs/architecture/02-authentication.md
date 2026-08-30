# Authentication Design

## Password storage

- Hashing: **Argon2id** via `@node-rs/argon2` (prebuilt native bindings — no build toolchain
  required on dev/CI/Windows). Parameters: memory 19456 KiB, iterations 2, parallelism 1
  (OWASP-recommended baseline for Argon2id), tuned later with real load testing.
- Never log, cache, or return password hashes over any API response.

## Session model

Hybrid session design, chosen so the API stays stateless-friendly while allowing hard
revocation (a pure stateless JWT cannot be revoked without a blocklist, which ends up being
the same problem as a session store):

```
LOGIN
  -> verify credentials
  -> create Session row (id, userId, tenantId, refreshTokenHash, expiresAt)
  -> issue:
       accessToken  = short-lived JWT (15 min), claims: sub, tenantId, sessionId, roles
       refreshToken = opaque random 256-bit token, httpOnly+secure+sameSite=strict cookie,
                      only its SHA-256 hash is stored (as Session.refreshTokenHash)
```

- Access token: verified stateless on every request (fast path, no DB hit) via signature +
  expiry. Carries `sessionId` so it can be cross-checked against revocation state when needed.
- Refresh token: DB-backed. `/auth/refresh` looks up the session by hash, checks `revokedAt` and
  `expiresAt`, rotates the refresh token (old one invalidated, new one issued) to detect reuse
  of stolen tokens — reuse of an already-rotated token revokes the entire session chain.
- Logout: sets `Session.revokedAt`, clears the refresh cookie.
- "Log out of all devices": revokes every `Session` row for the user.
- Session/device history: `Session` rows list `userAgent`, `ipAddress`, `createdAt`,
  `lastUsedAt` — surfaced in the customer/staff portal as "active sessions."

## Registration & email verification

```
POST /auth/register
  -> validate (Zod): email, password strength, tenant context
  -> create User (status = PENDING_VERIFICATION), hash password
  -> create EmailVerificationToken: random 256-bit token, store SHA-256 hash only,
     expiresAt = now + 24h
  -> enqueue "send-verification-email" job (worker) with the raw token (never persisted raw)
  -> respond 201, do not log the user in yet
```

```
GET /auth/verify-email?token=...
  -> hash incoming token, look up EmailVerificationToken by hash
  -> reject if missing / expired / already used (usedAt set)
  -> mark usedAt, set User.emailVerifiedAt, User.status = ACTIVE
  -> audit log: "user.email_verified"
```

Resend verification is rate-limited (see `11-security.md`) and invalidates prior unused tokens
for that user before issuing a new one.

## Password reset

Same token pattern as email verification (hash-only storage, one-time use, expiry), with the
added rule that a successful reset revokes every existing `Session` for that user (defense
against a compromised-password + hijacked-session combination).

## Login flow, lockout, suspicious login detection

```
POST /auth/login
  -> rate limit check (Redis, per-IP and per-email)
  -> look up User by (tenantId, email); constant-time-equivalent response whether or not the
     user exists (do not leak account existence)
  -> if User.lockedUntil > now: reject 423-style error, do not attempt password check
  -> verify password (argon2)
  -> on failure: increment failedLoginCount, write LoginAttempt(success=false); if
     failedLoginCount >= 5 within 15 minutes -> set lockedUntil = now + 15m, audit log
     "user.locked"
  -> on success: reset failedLoginCount, write LoginAttempt(success=true), create Session,
     update lastLoginAt
  -> "suspicious login" heuristic (Phase 1: new IP/user-agent not seen in the user's last N
     successful LoginAttempt rows) -> triggers a notification job, does not block login
```

## 2FA / TOTP

Schema and service hooks are included in Phase 1 (`User.totpSecretEncrypted`,
`User.totpEnabledAt`) but the enrollment/verification UI ships when the customer/staff portals
exist. `totpSecretEncrypted` is encrypted at rest using the platform `ENCRYPTION_KEY` (AES-256-GCM),
never stored plaintext.

## Where auth logic lives

`packages/auth` owns: hashing, token generation/verification, session lifecycle, lockout rules.
`apps/api` owns: HTTP routes, Zod request validation, wiring auth results to `AuditLog`.
`apps/worker` owns: sending the actual verification/reset emails (never done synchronously in
the request path).
