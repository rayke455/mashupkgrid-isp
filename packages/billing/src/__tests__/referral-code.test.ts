import { describe, it, expect } from "vitest";
import { generateReferralCode, normalizeReferralCode } from "../referral.service.js";

describe("referral codes", () => {
  it("are six characters with no look-alike letters or digits", () => {
    for (let i = 0; i < 200; i++) expect(generateReferralCode()).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
  });
  it("match however the customer typed them", () => {
    expect(normalizeReferralCode(" qtj-qpy ")).toBe("QTJQPY");
  });
});
