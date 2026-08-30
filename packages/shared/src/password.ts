import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id parameters (OWASP-recommended baseline: memory 19 MiB, 2 iterations, 1 thread).
 * Lives in `shared` (dependency-free) rather than `auth` so `packages/database`'s seed script
 * can hash the seeded super-admin/demo passwords without creating an `auth <-> database`
 * import cycle (`auth` itself depends on `database`). `packages/auth` re-exports these as the
 * canonical hashing API for the rest of the app.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, ARGON2_OPTIONS);
}

export async function verifyPassword(hashValue: string, plaintext: string): Promise<boolean> {
  try {
    return await verify(hashValue, plaintext);
  } catch {
    return false;
  }
}

const PASSWORD_MIN_LENGTH = 10;

export function isPasswordStrongEnough(plaintext: string): boolean {
  if (plaintext.length < PASSWORD_MIN_LENGTH) return false;
  const hasLetter = /[a-zA-Z]/.test(plaintext);
  const hasDigitOrSymbol = /[\d\W]/.test(plaintext);
  return hasLetter && hasDigitOrSymbol;
}
