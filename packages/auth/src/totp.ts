import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Authenticator-app codes (TOTP, RFC 6238): HMAC-SHA1, 30-second steps, 6 digits, the settings
 * every authenticator app uses by default. Plus the one-time recovery codes that stand in for
 * the phone when it is lost.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("Invalid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new 160-bit secret, base32 as authenticator apps expect. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(key: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", key).update(msg).digest();
  const offset = mac[mac.length - 1]! & 15;
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(code).padStart(digits, "0");
}

export function totpAt(secretBase32: string, at: Date, digits = 6): string {
  return hotp(base32Decode(secretBase32), Math.floor(at.getTime() / 1000 / STEP_SECONDS), digits);
}

/** True when `code` matches now, or one step either side (a phone clock a little off). */
export function verifyTotp(secretBase32: string, code: string, now = new Date(), window = 1): boolean {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const key = base32Decode(secretBase32);
  const step = Math.floor(now.getTime() / 1000 / STEP_SECONDS);
  let ok = false;
  for (let i = -window; i <= window; i++) {
    const expected = Buffer.from(hotp(key, step + i));
    // Check every step, so timing doesn't reveal which one matched.
    if (timingSafeEqual(expected, Buffer.from(clean))) ok = true;
  }
  return ok;
}

/** The link an authenticator app reads from the QR code. */
export function otpauthUrl(issuer: string, account: string, secretBase32: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}

/** Ten codes like "k7m2-9qxd", each usable once. Shown to the user once; only hashes are kept. */
export function generateRecoveryCodes(count = 10): string[] {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(8);
    const s = Array.from(bytes, (b) => chars[b % chars.length]).join("");
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code.trim().toLowerCase().replace(/[^a-z0-9]/g, "")).digest("hex");
}

/** A random six-digit code for SMS. */
export function generateSmsCode(): string {
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, "0");
}
