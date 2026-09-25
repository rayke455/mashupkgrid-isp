/**
 * Platform fee arithmetic. Pure, integer-only — no floating point touches money anywhere here.
 *
 * A fee rule is a percentage in basis points (200 = 2%) plus a fixed amount in minor units. The
 * percentage part is rounded half-up to the nearest cent, then the fixed part is added, and the
 * result is capped at the gross amount so the tenant's net can never go negative (a KES 10
 * payment against a KES 20 fixed fee yields fee 10, net 0 — never net −10).
 */

export interface FeeRule {
  percentBps: number;
  fixedMinor: number;
}

export interface FeeBreakdown {
  grossMinor: number;
  feeMinor: number;
  netMinor: number;
  percentBps: number;
  fixedMinor: number;
}

function assertWholeNonNegative(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative whole number of minor units, got ${value}`);
  }
}

export function calculateFee(grossMinor: number, rule: FeeRule): FeeBreakdown {
  if (!Number.isSafeInteger(grossMinor) || grossMinor <= 0) {
    throw new RangeError(`grossMinor must be a positive whole number, got ${grossMinor}`);
  }
  assertWholeNonNegative(rule.fixedMinor, "fixedMinor");
  if (!Number.isSafeInteger(rule.percentBps) || rule.percentBps < 0 || rule.percentBps > 10_000) {
    throw new RangeError(`percentBps must be between 0 and 10000, got ${rule.percentBps}`);
  }

  // gross × bps / 10 000, rounded half-up, in integers: (gross × bps + 5 000) div 10 000.
  const percentPart = Math.floor((grossMinor * rule.percentBps + 5_000) / 10_000);
  const feeMinor = Math.min(grossMinor, percentPart + rule.fixedMinor);

  return {
    grossMinor,
    feeMinor,
    netMinor: grossMinor - feeMinor,
    percentBps: rule.percentBps,
    fixedMinor: rule.fixedMinor,
  };
}

/**
 * The share of a transaction's fee that goes back with a partial refund, proportional to the
 * refunded share of the gross. Rounded down, and the final refund that completes the transaction
 * returns whatever fee is left — so across any sequence of partial refunds the tenant gets back
 * exactly the whole fee, never a cent more or less.
 */
export function feeShareForRefund(input: {
  grossMinor: number;
  feeMinor: number;
  alreadyRefundedMinor: number;
  feeAlreadyReturnedMinor: number;
  refundMinor: number;
}): number {
  const { grossMinor, feeMinor, alreadyRefundedMinor, feeAlreadyReturnedMinor, refundMinor } = input;
  const remainingFee = feeMinor - feeAlreadyReturnedMinor;
  if (alreadyRefundedMinor + refundMinor >= grossMinor) return remainingFee;
  return Math.min(remainingFee, Math.floor((feeMinor * refundMinor) / grossMinor));
}

/** "KES 1,234.50" — display only; never parse this back. */
export function formatMinor(amountMinor: number, currency = "KES"): string {
  const sign = amountMinor < 0 ? "-" : "";
  const abs = Math.abs(amountMinor);
  const major = Math.floor(abs / 100).toLocaleString("en-KE");
  const cents = String(abs % 100).padStart(2, "0");
  return `${sign}${currency} ${major}.${cents}`;
}
