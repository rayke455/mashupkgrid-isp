import { describe, it, expect } from "vitest";
import { isReservedSubdomain, RESERVED_SUBDOMAINS } from "../subdomains.js";

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

  // Each of these is a hostname the reverse proxy (infrastructure/caddy/Caddyfile) routes to a
  // specific surface. A tenant that claimed one would be handed a platform-looking address that
  // the API's CORS check also treats as a trusted origin, so they must stay unregisterable.
  it("rejects every subdomain the reverse proxy routes itself", () => {
    for (const host of ["api", "admin", "app", "portal", "wifi", "www"]) {
      expect(isReservedSubdomain(host)).toBe(true);
    }
  });

  it("trims surrounding whitespace before deciding", () => {
    expect(isReservedSubdomain("  admin  ")).toBe(true);
  });

  it("keeps the catalog lowercase and duplicate-free so lookups stay exact", () => {
    const list = [...RESERVED_SUBDOMAINS];
    expect(list).toEqual(list.map((s) => s.toLowerCase()));
    expect(new Set(list).size).toBe(list.length);
  });
});
