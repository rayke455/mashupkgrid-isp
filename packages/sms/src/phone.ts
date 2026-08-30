import { ValidationError } from "@mashupkgrid/shared";

/**
 * Normalizes a Kenyan phone number to the E.164 format (+2547XXXXXXXX / +2541XXXXXXXX) Africa's
 * Talking requires. Accepts 07XXXXXXXX, 01XXXXXXXX, +2547XXXXXXXX, 2547XXXXXXXX — the same input
 * shapes packages/payments/src/mpesa/phone.ts accepts, kept as a separate small copy here rather
 * than a cross-package dependency since an SMS gateway has no real reason to depend on the
 * payments package.
 */
export function normalizeKenyanPhoneE164(input: string): string {
  const digits = input.replace(/[^\d]/g, "");

  if (/^(0)(7|1)\d{8}$/.test(digits)) {
    return `+254${digits.slice(1)}`;
  }
  if (/^254(7|1)\d{8}$/.test(digits)) {
    return `+${digits}`;
  }
  if (/^(7|1)\d{8}$/.test(digits)) {
    return `+254${digits}`;
  }

  throw new ValidationError(`"${input}" is not a valid Kenyan phone number`);
}
