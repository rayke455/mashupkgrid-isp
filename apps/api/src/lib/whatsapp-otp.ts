import { randomInt } from "node:crypto";
import { hashToken, generateSecureToken, ConflictError, ValidationError } from "@mashupkgrid/shared";
import { redis } from "./redis.js";
import { enqueueSendWhatsappOtp } from "./queue.js";

const CODE_TTL_SECONDS = 10 * 60; // matches the frontend wizard's 10-minute countdown
const TICKET_TTL_SECONDS = 15 * 60; // a little slack past the code's own expiry to finish the rest of the form
const MAX_VERIFY_ATTEMPTS = 5;

interface StoredOtp {
  codeHash: string;
  attempts: number;
}

function otpKey(purpose: string, phone: string): string {
  return `wa-otp:${purpose}:${phone}`;
}

function ticketKey(purpose: string, phone: string): string {
  return `wa-otp-ticket:${purpose}:${phone}`;
}

/** Loosely normalizes a phone number for OTP purposes: strips everything but digits and a
 *  leading `+`. Deliberately not the stricter Kenya-only normalizeKenyanPhoneE164 (packages/sms)
 *  since the ISP registration wizard this backs supports many countries — the WhatsApp JID this
 *  ultimately becomes (packages/whatsapp's phoneToWhatsAppJid) only needs digits, no particular
 *  country's format. */
export function normalizePhoneForOtp(input: string): string {
  const digits = input.replace(/[^\d]/g, "");
  if (digits.length < 8) {
    throw new ValidationError("Enter a valid phone number");
  }
  return `+${digits}`;
}

/** Generates a 6-digit code, stores only its hash (never the plaintext — same pattern as
 *  emailVerificationToken/passwordResetToken), and enqueues the actual WhatsApp send for the
 *  worker (which owns the live paired session) to deliver. */
export async function requestWhatsappOtp(phone: string, purpose: string): Promise<void> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const stored: StoredOtp = { codeHash: hashToken(code), attempts: 0 };
  await redis.set(otpKey(purpose, phone), JSON.stringify(stored), "EX", CODE_TTL_SECONDS);
  // No tenant yet — ISP registration OTPs are sent before the tenant that could own a WhatsApp
  // session exists, so these go out on the platform line.
  await enqueueSendWhatsappOtp({ tenantId: null, phone, code });
}

/** Verifies a typed code against the stored hash. On success, issues a one-time verification
 *  ticket (returned here, and separately consumed by consumeWhatsappOtpTicket) that proves this
 *  phone was actually verified — without this, a caller could skip straight to submitting the
 *  final form claiming success, since the form itself has no other way to prove the code was
 *  ever checked. On failure, counts the attempt toward MAX_VERIFY_ATTEMPTS and locks the code out
 *  once exceeded (a fresh one must be requested), the same brute-force bound login.ts applies to
 *  password attempts. */
export async function verifyWhatsappOtp(phone: string, purpose: string, code: string): Promise<string> {
  const key = otpKey(purpose, phone);
  const raw = await redis.get(key);
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
  await redis.set(ticketKey(purpose, phone), ticket, "EX", TICKET_TTL_SECONDS);
  return ticket;
}

/** Consumed by the final registration endpoint — proves this exact phone actually completed
 *  OTP verification for this exact purpose before the account gets created. One-time use: the
 *  ticket is deleted the moment it's checked, whether or not it matched, so it can never be
 *  replayed against a second registration attempt. */
export async function consumeWhatsappOtpTicket(phone: string, purpose: string, ticket: string): Promise<void> {
  const key = ticketKey(purpose, phone);
  const stored = await redis.get(key);
  await redis.del(key);
  if (!stored || stored !== ticket) {
    throw new ValidationError("Phone verification is missing or expired — verify your WhatsApp code again");
  }
}
