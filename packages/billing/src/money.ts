import type { BillingCycle } from "@mashupkgrid/database";
import { ValidationError } from "@mashupkgrid/shared";

/**
 * Canonical cycle length in days, used for pro-rata calculation and to advance
 * `CustomerService.nextBillingAt`. MONTHLY/QUARTERLY/YEARLY use fixed approximations (30/91/365
 * days) rather than true calendar-month arithmetic — acceptable for Phase 2 pro-rata billing,
 * revisit if a tenant needs calendar-exact billing.
 */
export function cycleLengthDays(cycle: BillingCycle, customDurationDays: number | null): number {
  switch (cycle) {
    case "DAILY":
      return 1;
    case "WEEKLY":
      return 7;
    case "MONTHLY":
      return 30;
    case "QUARTERLY":
      return 91;
    case "YEARLY":
      return 365;
    case "CUSTOM":
      if (!customDurationDays || customDurationDays < 1) {
        throw new ValidationError("A CUSTOM billing cycle package must have durationDays set");
      }
      return customDurationDays;
  }
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/** Pro-rata amount for the remainder of the current cycle, rounded to the nearest minor unit. */
export function proRataAmountMinor(fullPriceMinor: number, daysRemaining: number, cycleDays: number): number {
  if (daysRemaining >= cycleDays) return fullPriceMinor;
  if (daysRemaining <= 0) return 0;
  return Math.round((fullPriceMinor * daysRemaining) / cycleDays);
}

export function taxAmountMinor(subtotalMinor: number, taxPercent: number | null): number {
  if (!taxPercent) return 0;
  return Math.round((subtotalMinor * taxPercent) / 100);
}

/** The pre-tax amount whose total with tax comes to `grossMinor`, for prices quoted tax
 *  included. Exact when some amount rounds to it; otherwise the nearest below. */
export function netFromGrossMinor(grossMinor: number, taxPercent: number | null): number {
  if (!taxPercent) return grossMinor;
  const guess = Math.round((grossMinor * 100) / (100 + taxPercent));
  for (const net of [guess, guess - 1, guess + 1, guess - 2, guess + 2]) {
    if (net >= 0 && net + taxAmountMinor(net, taxPercent) === grossMinor) return net;
  }
  return Math.floor((grossMinor * 100) / (100 + taxPercent));
}
