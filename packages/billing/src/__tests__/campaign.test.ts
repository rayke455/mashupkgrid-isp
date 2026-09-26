import { describe, it, expect } from "vitest";
import { personalizeMessage, smsParts } from "../campaign.service.js";

const jane = { fullName: "Jane Wanjiku", customerNumber: "CUS-000001", owedMinor: 150_000 };

describe("personalizeMessage", () => {
  it("fills in each customer's details", () => {
    expect(personalizeMessage("Hi {firstName}, account {accountNumber} owes {amountDue}.", jane)).toBe("Hi Jane, account CUS-000001 owes KES 1,500.");
    expect(personalizeMessage("Dear {name}", jane)).toBe("Dear Jane Wanjiku");
  });
  it("leaves unknown placeholders as they are", () => {
    expect(personalizeMessage("Hi {nickname}", jane)).toBe("Hi {nickname}");
  });
});

describe("smsParts", () => {
  it("counts one SMS up to 160 characters, then 153 per part", () => {
    expect(smsParts("a".repeat(160))).toBe(1);
    expect(smsParts("a".repeat(161))).toBe(2);
    expect(smsParts("a".repeat(306))).toBe(2);
    expect(smsParts("a".repeat(307))).toBe(3);
  });
});
