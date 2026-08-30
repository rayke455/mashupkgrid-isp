import { describe, it, expect } from "vitest";
import { cycleLengthDays, addDays, proRataAmountMinor, taxAmountMinor } from "../money.js";
import { ValidationError } from "@mashupkgrid/shared";

describe("cycleLengthDays", () => {
  it.each([
    ["DAILY", 1],
    ["WEEKLY", 7],
    ["MONTHLY", 30],
    ["QUARTERLY", 91],
    ["YEARLY", 365],
  ] as const)("%s -> %i days", (cycle, expected) => {
    expect(cycleLengthDays(cycle, null)).toBe(expected);
  });

  it("CUSTOM uses durationDays", () => {
    expect(cycleLengthDays("CUSTOM", 45)).toBe(45);
  });

  it("CUSTOM without durationDays throws ValidationError", () => {
    expect(() => cycleLengthDays("CUSTOM", null)).toThrow(ValidationError);
  });

  it("CUSTOM with a non-positive durationDays throws", () => {
    expect(() => cycleLengthDays("CUSTOM", 0)).toThrow(ValidationError);
    expect(() => cycleLengthDays("CUSTOM", -5)).toThrow(ValidationError);
  });
});

describe("addDays", () => {
  it("adds whole days in UTC", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    expect(addDays(start, 30).toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });

  it("does not mutate the input date", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    addDays(start, 10);
    expect(start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("proRataAmountMinor", () => {
  it("charges the full price when daysRemaining covers the whole cycle", () => {
    expect(proRataAmountMinor(3000, 30, 30)).toBe(3000);
    expect(proRataAmountMinor(3000, 45, 30)).toBe(3000); // never charge more than full price
  });

  it("charges 0 when no days remain", () => {
    expect(proRataAmountMinor(3000, 0, 30)).toBe(0);
    expect(proRataAmountMinor(3000, -5, 30)).toBe(0);
  });

  it("computes a proportional charge for a partial period", () => {
    expect(proRataAmountMinor(3000, 15, 30)).toBe(1500);
  });

  it("rounds to the nearest minor unit rather than leaving fractional cents", () => {
    // 1000 * 10/30 = 333.33... -> rounds to 333
    expect(proRataAmountMinor(1000, 10, 30)).toBe(333);
  });
});

describe("taxAmountMinor", () => {
  it("returns 0 when taxPercent is null", () => {
    expect(taxAmountMinor(10000, null)).toBe(0);
  });

  it("computes a whole-percent tax", () => {
    expect(taxAmountMinor(10000, 16)).toBe(1600);
  });

  it("rounds fractional results", () => {
    expect(taxAmountMinor(333, 16)).toBe(53); // 333 * 0.16 = 53.28 -> 53
  });
});
