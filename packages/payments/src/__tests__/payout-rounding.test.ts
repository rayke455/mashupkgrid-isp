import { describe, expect, it } from "vitest";

/**
 * The whole-shilling rule, isolated from the database so the arithmetic can be pinned directly.
 *
 * M-Pesa moves whole shillings. The payout amount is therefore the floor of the balance, never
 * the round — rounding KES 1.50 up to 2 pays a tenant money the platform never collected, and
 * doing that on every payout run is a slow leak that no report would flag as wrong.
 */
function payableMinor(balanceMinor: number): number {
  return Math.floor(balanceMinor / 100) * 100;
}

describe("payout rounding", () => {
  it("sends the exact amount when the balance is whole shillings", () => {
    expect(payableMinor(1000)).toBe(1000);
  });

  it("rounds DOWN, never up — an odd balance must not overpay", () => {
    // KES 1.50. Rounding to nearest would send KES 2, which is 50 cents the platform never took.
    expect(payableMinor(150)).toBe(100);
    expect(payableMinor(199)).toBe(100);
  });

  it("sends nothing when the balance is under one shilling", () => {
    // Not lost: it stays on the ledger and goes out once it reaches a shilling.
    expect(payableMinor(99)).toBe(0);
    expect(payableMinor(1)).toBe(0);
  });

  it("leaves the remainder behind so the ledger still balances", () => {
    const balance = 12345; // KES 123.45
    const sent = payableMinor(balance);
    expect(sent).toBe(12300);
    expect(balance - sent).toBe(45); // the 45 cents remain owed
  });

  it("accumulates rather than evaporating across runs", () => {
    // Three sales of KES 0.40 pay nothing individually but a shilling once combined, which is
    // the property that makes "every cent is paid eventually" true.
    let balance = 0;
    for (let i = 0; i < 3; i++) balance += 40;
    expect(payableMinor(balance)).toBe(100);
    expect(balance - payableMinor(balance)).toBe(20);
  });
});
