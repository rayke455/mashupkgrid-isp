import { describe, it, expect } from "vitest";
import { normalizeKenyanPhone } from "../phone.js";
import { ValidationError } from "@mashupkgrid/shared";

describe("normalizeKenyanPhone", () => {
  it("normalizes a 07XXXXXXXX number", () => {
    expect(normalizeKenyanPhone("0712345678")).toBe("254712345678");
  });

  it("normalizes a 01XXXXXXXX number", () => {
    expect(normalizeKenyanPhone("0112345678")).toBe("254112345678");
  });

  it("passes through an already-normalized 2547XXXXXXXX number", () => {
    expect(normalizeKenyanPhone("254712345678")).toBe("254712345678");
  });

  it("strips a leading + and normalizes", () => {
    expect(normalizeKenyanPhone("+254712345678")).toBe("254712345678");
  });

  it("strips spaces and dashes", () => {
    expect(normalizeKenyanPhone("0712 345 678")).toBe("254712345678");
    expect(normalizeKenyanPhone("0712-345-678")).toBe("254712345678");
  });

  it("accepts a bare 7XXXXXXXX number", () => {
    expect(normalizeKenyanPhone("712345678")).toBe("254712345678");
  });

  it("rejects a non-Kenyan / malformed number", () => {
    expect(() => normalizeKenyanPhone("12345")).toThrow(ValidationError);
    expect(() => normalizeKenyanPhone("0212345678")).toThrow(ValidationError); // landline prefix
    expect(() => normalizeKenyanPhone("not-a-phone")).toThrow(ValidationError);
  });
});
