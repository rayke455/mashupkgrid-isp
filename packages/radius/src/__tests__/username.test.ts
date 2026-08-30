import { describe, it, expect } from "vitest";
import { buildRadiusUsername, generateRadiusPassword } from "../username.js";

describe("buildRadiusUsername", () => {
  it("joins the tenant slug and customer number, lowercased", () => {
    expect(buildRadiusUsername("Acme-ISP", "CUST-042")).toBe("acme-isp-cust-042");
  });
});

describe("generateRadiusPassword", () => {
  it("produces a 12-character alphanumeric password", () => {
    const password = generateRadiusPassword();
    expect(password).toHaveLength(12);
    expect(password).toMatch(/^[a-zA-Z0-9]{12}$/);
  });

  it("produces different passwords across calls", () => {
    const passwords = new Set(Array.from({ length: 20 }, () => generateRadiusPassword()));
    expect(passwords.size).toBeGreaterThan(1);
  });
});
