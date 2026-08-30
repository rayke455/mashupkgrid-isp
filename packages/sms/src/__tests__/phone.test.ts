import { describe, it, expect } from "vitest";
import { normalizeKenyanPhoneE164 } from "../phone.js";

describe("normalizeKenyanPhoneE164", () => {
  it("normalizes a local 07... number", () => {
    expect(normalizeKenyanPhoneE164("0712345678")).toBe("+254712345678");
  });

  it("normalizes a local 01... number", () => {
    expect(normalizeKenyanPhoneE164("0112345678")).toBe("+254112345678");
  });

  it("normalizes an already-254-prefixed number", () => {
    expect(normalizeKenyanPhoneE164("254712345678")).toBe("+254712345678");
  });

  it("normalizes an already-+254-prefixed number", () => {
    expect(normalizeKenyanPhoneE164("+254712345678")).toBe("+254712345678");
  });

  it("normalizes a bare 9-digit number", () => {
    expect(normalizeKenyanPhoneE164("712345678")).toBe("+254712345678");
  });

  it("strips spaces and dashes before normalizing", () => {
    expect(normalizeKenyanPhoneE164("0712-345-678")).toBe("+254712345678");
  });

  it("rejects an invalid number", () => {
    expect(() => normalizeKenyanPhoneE164("12345")).toThrow();
    expect(() => normalizeKenyanPhoneE164("0212345678")).toThrow();
  });
});
