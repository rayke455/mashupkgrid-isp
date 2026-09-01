import { describe, expect, it } from "vitest";
import { dayKeyInTimeZone } from "../reporting-dates.js";

describe("dayKeyInTimeZone", () => {
  it("returns an ISO-ordered YYYY-MM-DD key", () => {
    expect(dayKeyInTimeZone(new Date("2026-09-01T12:00:00Z"), "Africa/Nairobi")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("reports a late-evening UTC payment as the NEXT day in Nairobi", () => {
    // 22:00 UTC on the 1st is 01:00 on the 2nd in Nairobi (UTC+3). Bucketing this by UTC is what
    // silently moved every midnight-to-3am transaction into the previous day's totals.
    expect(dayKeyInTimeZone(new Date("2026-09-01T22:00:00Z"), "Africa/Nairobi")).toBe("2026-09-02");
  });

  it("keeps a mid-afternoon payment on its own day", () => {
    expect(dayKeyInTimeZone(new Date("2026-09-01T12:00:00Z"), "Africa/Nairobi")).toBe("2026-09-01");
  });

  it("differs from the UTC key exactly at the offset boundary", () => {
    const at2300Utc = new Date("2026-09-01T23:00:00Z");
    expect(at2300Utc.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(dayKeyInTimeZone(at2300Utc, "Africa/Nairobi")).toBe("2026-09-02");
  });

  it("handles a timezone behind UTC", () => {
    // 02:00 UTC on the 2nd is still the 1st in New York (UTC-4 in September).
    expect(dayKeyInTimeZone(new Date("2026-09-02T02:00:00Z"), "America/New_York")).toBe("2026-09-01");
  });

  it("falls back to UTC rather than throwing on an unrecognised timezone", () => {
    expect(dayKeyInTimeZone(new Date("2026-09-01T22:00:00Z"), "Not/AZone")).toBe("2026-09-01");
  });
});
