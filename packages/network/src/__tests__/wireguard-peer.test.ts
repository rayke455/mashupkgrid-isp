import { describe, expect, it } from "vitest";
import { allocateNextVpnIp } from "../wireguard-peer.service.js";

describe("allocateNextVpnIp", () => {
  it("returns the first host address after the reserved server address (.1)", () => {
    expect(allocateNextVpnIp("10.90.0.0/24", [])).toBe("10.90.0.2");
  });

  it("skips addresses already in use", () => {
    expect(allocateNextVpnIp("10.90.0.0/24", ["10.90.0.2", "10.90.0.3"])).toBe("10.90.0.4");
  });

  it("skips over gaps correctly, not just the highest used address", () => {
    expect(allocateNextVpnIp("10.90.0.0/24", ["10.90.0.2", "10.90.0.4"])).toBe("10.90.0.3");
  });

  it("works across octet boundaries for a /16 pool", () => {
    const used = Array.from({ length: 254 }, (_, i) => `10.90.0.${i + 2}`);
    expect(allocateNextVpnIp("10.90.0.0/16", used)).toBe("10.90.1.0");
  });

  it("rejects a malformed CIDR block", () => {
    expect(() => allocateNextVpnIp("not-a-cidr", [])).toThrow();
  });

  it("throws once the pool is exhausted", () => {
    // A /30 has exactly 2 usable addresses; both already reserved (.1 for the server) or used.
    expect(() => allocateNextVpnIp("10.90.0.0/30", ["10.90.0.2"])).toThrow(/exhausted/);
  });
});
