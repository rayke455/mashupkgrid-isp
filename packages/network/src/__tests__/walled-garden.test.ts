import { describe, expect, it, vi } from "vitest";

vi.mock("@mashupkgrid/database", () => ({ prisma: {} }));

import { normalizeWalledGardenHost } from "../walled-garden.js";

describe("normalizeWalledGardenHost", () => {
  it("accepts a host, a wildcard under a domain, and an IPv4 address", () => {
    expect(normalizeWalledGardenHost("Pay.Example.com")).toBe("pay.example.com");
    expect(normalizeWalledGardenHost("*.example.com")).toBe("*.example.com");
    expect(normalizeWalledGardenHost("*.pay.co.ke")).toBe("*.pay.co.ke");
    expect(normalizeWalledGardenHost("203.0.113.5")).toBe("203.0.113.5");
  });

  it("strips what an admin pastes from a browser", () => {
    expect(normalizeWalledGardenHost(" https://pay.example.com/checkout?x=1 ")).toBe("pay.example.com");
    expect(normalizeWalledGardenHost("example.com:8443")).toBe("example.com");
  });

  it("refuses anything that would open the paywall wholesale", () => {
    for (const bad of ["*", "*.com", "*.co.ke", "", "not a host", "example", "999.1.1.1", "*.*.com", "ex ample.com"]) {
      expect(normalizeWalledGardenHost(bad), bad).toBeNull();
    }
  });
});
