import { describe, expect, it } from "vitest";
import { calculateFee, feeShareForRefund, formatMinor } from "../gateway/fees.js";
import { latestScheduledRun } from "../gateway/settlement.service.js";

describe("calculateFee", () => {
  it("applies a percentage fee: 2% of KES 1,000 is KES 20", () => {
    expect(calculateFee(100_000, { percentBps: 200, fixedMinor: 0 })).toEqual({
      grossMinor: 100_000,
      feeMinor: 2_000,
      netMinor: 98_000,
      percentBps: 200,
      fixedMinor: 0,
    });
  });

  it("applies a fixed fee: KES 20 on KES 1,000", () => {
    const fee = calculateFee(100_000, { percentBps: 0, fixedMinor: 2_000 });
    expect([fee.feeMinor, fee.netMinor]).toEqual([2_000, 98_000]);
  });

  it("adds percentage and fixed parts", () => {
    const fee = calculateFee(100_000, { percentBps: 150, fixedMinor: 500 });
    expect(fee.feeMinor).toBe(1_500 + 500);
    expect(fee.grossMinor).toBe(fee.feeMinor + fee.netMinor);
  });

  it("rounds the percentage half-up to the nearest cent, in integers", () => {
    // 2.5% of KES 0.99 = 2.475 cents → 2; of KES 1.01 = 2.525 cents → 3
    expect(calculateFee(99, { percentBps: 250, fixedMinor: 0 }).feeMinor).toBe(2);
    expect(calculateFee(101, { percentBps: 250, fixedMinor: 0 }).feeMinor).toBe(3);
    // 1.75% of KES 333.33 = 583.3275 cents → 583
    expect(calculateFee(33_333, { percentBps: 175, fixedMinor: 0 }).feeMinor).toBe(583);
  });

  it("never lets the fee exceed the payment, so net is never negative", () => {
    const fee = calculateFee(1_000, { percentBps: 0, fixedMinor: 2_000 });
    expect(fee).toMatchObject({ feeMinor: 1_000, netMinor: 0 });
  });

  it("keeps gross = fee + net for every amount (no cent created or lost)", () => {
    for (let gross = 1; gross <= 5_000; gross += 7) {
      const f = calculateFee(gross, { percentBps: 333, fixedMinor: 13 });
      expect(f.feeMinor + f.netMinor).toBe(gross);
      expect(f.netMinor).toBeGreaterThanOrEqual(0);
    }
  });

  it("rejects fractional, negative or out-of-range inputs", () => {
    expect(() => calculateFee(100.5, { percentBps: 0, fixedMinor: 0 })).toThrow(RangeError);
    expect(() => calculateFee(0, { percentBps: 0, fixedMinor: 0 })).toThrow(RangeError);
    expect(() => calculateFee(100, { percentBps: 10_001, fixedMinor: 0 })).toThrow(RangeError);
    expect(() => calculateFee(100, { percentBps: 0, fixedMinor: -1 })).toThrow(RangeError);
  });
});

describe("feeShareForRefund", () => {
  it("returns exactly the whole fee across any sequence of partial refunds", () => {
    const grossMinor = 100_000;
    const feeMinor = 2_333;
    const parts = [12_345, 33_333, 1, 40_000, 14_321];
    let refunded = 0;
    let feeReturned = 0;
    for (const refundMinor of parts) {
      feeReturned += feeShareForRefund({
        grossMinor,
        feeMinor,
        alreadyRefundedMinor: refunded,
        feeAlreadyReturnedMinor: feeReturned,
        refundMinor,
      });
      refunded += refundMinor;
    }
    expect(refunded).toBe(grossMinor);
    expect(feeReturned).toBe(feeMinor);
  });

  it("returns a proportional share for a partial refund", () => {
    expect(
      feeShareForRefund({ grossMinor: 100_000, feeMinor: 2_000, alreadyRefundedMinor: 0, feeAlreadyReturnedMinor: 0, refundMinor: 30_000 })
    ).toBe(600);
  });
});

describe("formatMinor", () => {
  it("formats cents without floating point", () => {
    expect(formatMinor(123_456)).toBe("KES 1,234.56");
    expect(formatMinor(-5)).toBe("-KES 0.05");
  });
});

describe("latestScheduledRun (Africa/Nairobi, UTC+3)", () => {
  // 2026-09-23 is a Wednesday. 10:30 EAT = 07:30 UTC.
  const wedMorning = new Date("2026-09-23T07:30:00Z");

  it("DAILY at 09:00 EAT: today's slot once it has passed", () => {
    expect(latestScheduledRun(wedMorning, "DAILY", 9, 1)?.toISOString()).toBe("2026-09-23T06:00:00.000Z");
  });

  it("DAILY at 11:00 EAT: yesterday's slot while today's is still ahead", () => {
    expect(latestScheduledRun(wedMorning, "DAILY", 11, 1)?.toISOString()).toBe("2026-09-22T08:00:00.000Z");
  });

  it("WEEKLY on Monday 09:00 EAT: this week's Monday", () => {
    expect(latestScheduledRun(wedMorning, "WEEKLY", 9, 1)?.toISOString()).toBe("2026-09-21T06:00:00.000Z");
  });

  it("WEEKLY on Friday: last week's Friday", () => {
    expect(latestScheduledRun(wedMorning, "WEEKLY", 9, 5)?.toISOString()).toBe("2026-09-18T06:00:00.000Z");
  });

  it("uses the Nairobi date near UTC midnight", () => {
    // 22:30 UTC on Tue 22nd is 01:30 EAT on Wed 23rd; a 01:00 daily slot is Wed's.
    expect(latestScheduledRun(new Date("2026-09-22T22:30:00Z"), "DAILY", 1, 1)?.toISOString()).toBe(
      "2026-09-22T22:00:00.000Z"
    );
  });

  it("MANUAL never schedules; INSTANT is always due", () => {
    expect(latestScheduledRun(wedMorning, "MANUAL", 9, 1)).toBeNull();
    expect(latestScheduledRun(wedMorning, "INSTANT", 9, 1)).toEqual(wedMorning);
  });
});
