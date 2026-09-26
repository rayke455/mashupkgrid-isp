import { describe, it, expect } from "vitest";
import { addOnEndsAt, validateAddOn } from "../addon.service.js";

const HOUR = 3_600_000;
const now = new Date("2026-10-01T10:00:00Z");

describe("addOnEndsAt", () => {
  it("runs for its hours from now", () => {
    expect(addOnEndsAt(now, 24, null).getTime()).toBe(now.getTime() + 24 * HOUR);
  });

  it("adds on to the same add-on still running", () => {
    const running = new Date(now.getTime() + 5 * HOUR);
    expect(addOnEndsAt(now, 24, running).getTime()).toBe(running.getTime() + 24 * HOUR);
  });

  it("ignores one that has already ended", () => {
    expect(addOnEndsAt(now, 3, new Date(now.getTime() - HOUR)).getTime()).toBe(now.getTime() + 3 * HOUR);
  });
});

describe("validateAddOn", () => {
  const base = { name: "x", durationHours: 24, priceMinor: 5000 };
  it("needs speeds for a boost and data for a data add-on", () => {
    expect(() => validateAddOn({ ...base, kind: "SPEED", downloadKbps: 20_000 })).toThrow();
    expect(() => validateAddOn({ ...base, kind: "DATA" })).toThrow();
    expect(() => validateAddOn({ ...base, kind: "SPEED", downloadKbps: 20_000, uploadKbps: 10_000 })).not.toThrow();
    expect(() => validateAddOn({ ...base, kind: "DATA", dataMb: 10_240 })).not.toThrow();
  });
});
