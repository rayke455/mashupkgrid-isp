import { ValidationError } from "@mashupkgrid/shared";

/**
 * Normalizes a Kenyan phone number to the 2547XXXXXXXX / 2541XXXXXXXX format Daraja requires.
 * Accepts 07XXXXXXXX, 01XXXXXXXX, +2547XXXXXXXX, 2547XXXXXXXX.
 */
export function normalizeKenyanPhone(input: string): string {
  const digits = input.replace(/[^\d]/g, "");

  if (/^(0)(7|1)\d{8}$/.test(digits)) {
    return `254${digits.slice(1)}`;
  }
  if (/^254(7|1)\d{8}$/.test(digits)) {
    return digits;
  }
  if (/^(7|1)\d{8}$/.test(digits)) {
    return `254${digits}`;
  }

  throw new ValidationError(`"${input}" is not a valid Kenyan phone number`);
}
