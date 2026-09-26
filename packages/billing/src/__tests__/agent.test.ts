import { describe, it, expect } from "vitest";
import { commissionMinor } from "../agent.service.js";

describe("commissionMinor", () => {
  it("is the percentage, rounded down to whole cents", () => {
    expect(commissionMinor(5_000, 10)).toBe(500);
    expect(commissionMinor(150_000, 2)).toBe(3_000);
    expect(commissionMinor(999, 10)).toBe(99);
    expect(commissionMinor(5_000, 0)).toBe(0);
  });
});
