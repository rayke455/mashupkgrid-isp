import { createCipheriv, createDecipheriv, randomBytes, createHash, timingSafeEqual } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

/**
 * Encrypts a plaintext string at rest (router credentials, TOTP secrets, ...). `keyHex` must
 * be a 64-character hex string (32 bytes) — `packages/config` validates ENCRYPTION_KEY has
 * that shape at boot. Output is `iv:authTag:ciphertext`, all hex-encoded, safe to store in a
 * single text column.
 */
export function encryptAtRest(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptAtRest(payload: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  const [ivHex, authTagHex, ciphertextHex] = payload.split(":");
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error("Malformed encrypted payload");
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/** Generates a URL-safe random token (for email verification / password reset / refresh tokens). */
export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** A fixed-length, alphanumeric-only random secret (RADIUS/PPP passwords and shared secrets,
 *  which commonly reject or mis-handle base64url's `-`/`_`). Generating one shot of random bytes,
 *  stripping non-alphanumeric characters, then padding the (now variable, usually shorter)
 *  result out to `length` with a fixed filler character is a common but broken pattern — it
 *  produces a secret of unpredictable length whose tail is a guessable run of the filler
 *  character whenever enough characters got stripped, silently weakening the very randomness
 *  callers asked for. This instead keeps drawing fresh random characters until it has enough,
 *  so the result is always exactly `length` characters of real entropy. */
export function generateAlnumSecret(length: number): string {
  let out = "";
  while (out.length < length) {
    out += randomBytes(length).toString("base64url").replace(/[^a-zA-Z0-9]/g, "");
  }
  return out.slice(0, length);
}

/** One-way hash for tokens we store server-side (never store the raw token). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time string comparison for secrets (voucher/RADIUS passwords, etc.) — a plain `===`
 *  leaks how many leading characters matched through response-time differences, which is
 *  exactly the kind of oracle a login endpoint must not offer. Hashing both sides to a fixed
 *  32-byte digest first sidesteps `timingSafeEqual`'s own requirement that both buffers be the
 *  same length (a length check on the raw secrets would itself leak length information). */
export function timingSafeStringEqual(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a, "utf8").digest();
  const digestB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(digestA, digestB);
}
