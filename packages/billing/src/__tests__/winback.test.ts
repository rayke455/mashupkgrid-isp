import { describe, it, expect } from "vitest";
import { winBackCredit, winBackMessage } from "../winback.service.js";

describe("winBackMessage", () => {
  const base = { firstName: "Jane", isp: "Demo ISP", discountPercent: 20, validDays: 7, accountNumber: "CUS-000001" };

  it("names the bill, the deal, the deadline and how to pay", () => {
    const text = winBackMessage({ ...base, owedMinor: 150_000 });
    expect(text).toContain("Hi Jane, we miss you at Demo ISP.");
    expect(text).toContain("Pay your KES 1,500 bill within 7 days");
    expect(text).toContain("20% back as credit");
    expect(text).toContain("account CUS-000001");
    expect(text.length).toBeLessThanOrEqual(306);
  });

  it("leaves out the bill when nothing is owed", () => {
    expect(winBackMessage({ ...base, owedMinor: 0, validDays: 1 })).toContain("Pay today and get");
  });
});

describe("winBackCredit", () => {
  it("is the discount on what they paid", () => {
    expect(winBackCredit(100_000, 0, 20)).toBe(20_000);
  });
  it("counts at most what they owed when the offer went out", () => {
    expect(winBackCredit(500_000, 150_000, 20)).toBe(30_000);
    expect(winBackCredit(50_000, 150_000, 20)).toBe(10_000);
  });
  it("rounds down to whole cents", () => {
    expect(winBackCredit(333, 0, 10)).toBe(33);
  });
});
