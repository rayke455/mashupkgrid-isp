import { describe, it, expect } from "vitest";
import { pickEffectiveRate, rateLimitValue } from "../rate.service.js";

const plan = { downloadKbps: 10_000, uploadKbps: 5_000 };

describe("pickEffectiveRate", () => {
  it("is the plan's speed with no boost", () => {
    expect(pickEffectiveRate(plan, [])).toEqual(plan);
  });

  it("uses the fastest running boost", () => {
    expect(pickEffectiveRate(plan, [{ downloadKbps: 20_000, uploadKbps: 10_000 }, { downloadKbps: 50_000, uploadKbps: 20_000 }])).toEqual({ downloadKbps: 50_000, uploadKbps: 20_000 });
  });

  it("never goes below the plan on either side", () => {
    expect(pickEffectiveRate(plan, [{ downloadKbps: 20_000, uploadKbps: 2_000 }])).toEqual({ downloadKbps: 20_000, uploadKbps: 5_000 });
    expect(pickEffectiveRate(plan, [{ downloadKbps: 5_000, uploadKbps: 2_000 }])).toEqual(plan);
  });

  it("formats as MikroTik upload/download", () => {
    expect(rateLimitValue(plan)).toBe("5000k/10000k");
  });
});
