import { describe, it, expect } from "vitest";
import { isReservedSubdomain } from "../subdomains.js";

describe("isReservedSubdomain", () => {
  it("rejects every word in the reserved list", () => {
    expect(isReservedSubdomain("admin")).toBe(true);
    expect(isReservedSubdomain("api")).toBe(true);
    expect(isReservedSubdomain("www")).toBe(true);
    expect(isReservedSubdomain("mail")).toBe(true);
    expect(isReservedSubdomain("support")).toBe(true);
    expect(isReservedSubdomain("billing")).toBe(true);
    expect(isReservedSubdomain("dashboard")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isReservedSubdomain("ADMIN")).toBe(true);
    expect(isReservedSubdomain("Admin")).toBe(true);
  });

  it("allows a normal tenant slug", () => {
    expect(isReservedSubdomain("mashupnet")).toBe(false);
    expect(isReservedSubdomain("demo-isp")).toBe(false);
  });
});
