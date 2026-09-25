import { randomInt } from "node:crypto";
import { hashToken, generateSecureToken, ConflictError, ValidationError } from "@mashupkgrid/shared";
import { redis } from "./redis.js";
import { enqueueSendWhatsappOtp, enqueueSendEmailOtp } from "./queue.js";

const CODE_TTL_SECONDS = 10 * 60; // matches the frontend wizard's 10-minute countdown
const TICKET_TTL_SECONDS = 15 * 60; // a little slack past the code's own expiry to finish the rest of the form
const MAX_VERIFY_ATTEMPTS = 5;

interface StoredOtp {
  codeHash: string;
  attempts: number;
}

function otpKey(purpose: string, identifier: string): string {
  return `otp:${purpose}:${identifier}`;
}

function ticketKey(purpose: string, identifier: string): string {
  return `otp-ticket:${purpose}:${identifier}`;
}

/** Loosely normalizes a phone number for OTP purposes: strips everything but digits and a
 *  leading `+`. Automatically formats Kenyan local format (07... / 01...) into +254... so WhatsApp
 *  and SMS gateways never drop messages due to missing country codes. */
export function normalizePhoneForOtp(input: string): string {
  let digits = input.replace(/[^\d]/g, "");
  if (digits.length === 10 && digits.startsWith("0")) {
    digits = `254${digits.slice(1)}`;
  } else if (digits.length === 9 && (digits.startsWith("7") || digits.startsWith("1"))) {
    digits = `254${digits}`;
  }
  if (digits.length < 8) {
    throw new ValidationError("Enter a valid phone number");
  }
  return `+${digits}`;
}

export function normalizeEmailForOtp(input: string): string {
  const clean = input.trim().toLowerCase();
  if (!clean.includes("@") || clean.length < 5) {
    throw new ValidationError("Enter a valid email address");
  }
  return clean;
}

/** Generates a 6-digit code, stores only its hash (never the plaintext), and enqueues WhatsApp delivery. */
export async function requestWhatsappOtp(phone: string, purpose: string): Promise<void> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const stored: StoredOtp = { codeHash: hashToken(code), attempts: 0 };
  await redis.set(otpKey(purpose, phone), JSON.stringify(stored), "EX", CODE_TTL_SECONDS);
  // Also set legacy key for backwards-compatibility
  await redis.set(`wa-otp:${purpose}:${phone}`, JSON.stringify(stored), "EX", CODE_TTL_SECONDS);
  await enqueueSendWhatsappOtp({ tenantId: null, phone, code });
}

/** Generates a 6-digit code and enqueues Email delivery (useful when WhatsApp is unavailable). */
export async function requestEmailOtp(email: string, purpose: string): Promise<void> {
  const cleanEmail = normalizeEmailForOtp(email);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const stored: StoredOtp = { codeHash: hashToken(code), attempts: 0 };
  await redis.set(otpKey(purpose, cleanEmail), JSON.stringify(stored), "EX", CODE_TTL_SECONDS);
  await enqueueSendEmailOtp({ email: cleanEmail, code, purpose });
}

/** Verifies a typed code against the stored hash for any identifier (phone or email). */
export async function verifyOtpIdentifier(identifier: string, purpose: string, code: string): Promise<string> {
  let key = otpKey(purpose, identifier);
  let raw = await redis.get(key);
  if (!raw) {
    // Check legacy key
    const legacyKey = `wa-otp:${purpose}:${identifier}`;
    raw = await redis.get(legacyKey);
    if (raw) key = legacyKey;
  }
  if (!raw) {
    throw new ValidationError("This code has expired or was never requested — request a new one");
  }
  const stored = JSON.parse(raw) as StoredOtp;

  if (stored.attempts >= MAX_VERIFY_ATTEMPTS) {
    await redis.del(key);
    throw new ConflictError("Too many incorrect attempts — request a new code");
  }

  if (hashToken(code) !== stored.codeHash) {
    stored.attempts += 1;
    const ttl = await redis.ttl(key);
    await redis.set(key, JSON.stringify(stored), "EX", ttl > 0 ? ttl : CODE_TTL_SECONDS);
    throw new ValidationError("Incorrect code");
  }

  await redis.del(key); // one-time use — a verified code can't be replayed
  const ticket = generateSecureToken();
  await redis.set(ticketKey(purpose, identifier), ticket, "EX", TICKET_TTL_SECONDS);
  // Also set legacy key
  await redis.set(`wa-otp-ticket:${purpose}:${identifier}`, ticket, "EX", TICKET_TTL_SECONDS);
  return ticket;
}

export async function verifyWhatsappOtp(phone: string, purpose: string, code: string): Promise<string> {
  return verifyOtpIdentifier(phone, purpose, code);
}

export async function verifyEmailOtp(email: string, purpose: string, code: string): Promise<string> {
  return verifyOtpIdentifier(normalizeEmailForOtp(email), purpose, code);
}

export async function consumeOtpTicket(identifier: string, purpose: string, ticket: string): Promise<void> {
  let key = ticketKey(purpose, identifier);
  let stored = await redis.get(key);
  if (!stored) {
    const legacyKey = `wa-otp-ticket:${purpose}:${identifier}`;
    stored = await redis.get(legacyKey);
    await redis.del(legacyKey);
  }
  await redis.del(key);
  if (!stored || stored !== ticket) {
    throw new ValidationError("Verification is missing or expired — verify your code again");
  }
}

export async function consumeWhatsappOtpTicket(phone: string, purpose: string, ticket: string): Promise<void> {
  return consumeOtpTicket(phone, purpose, ticket);
}

export async function consumeEmailOtpTicket(email: string, purpose: string, ticket: string): Promise<void> {
  return consumeOtpTicket(normalizeEmailForOtp(email), purpose, ticket);
}
