import { describe, it, expect } from "vitest";
import { expandIpv4Cidr } from "../cidr.js";

describe("expandIpv4Cidr", () => {
  it("excludes the network and broadcast addresses for a /24", () => {
    const addresses = expandIpv4Cidr("192.168.1.0/24");
    expect(addresses).toHaveLength(254);
    expect(addresses[0]).toBe("192.168.1.1");
    expect(addresses[addresses.length - 1]).toBe("192.168.1.254");
    expect(addresses).not.toContain("192.168.1.0");
    expect(addresses).not.toContain("192.168.1.255");
  });

  it("handles a /30 (2 usable addresses)", () => {
    expect(expandIpv4Cidr("10.0.0.0/30")).toEqual(["10.0.0.1", "10.0.0.2"]);
  });

  it("handles a /31 as a point-to-point link with both addresses usable", () => {
    expect(expandIpv4Cidr("10.0.0.0/31")).toEqual(["10.0.0.0"]);
  });

  it("handles a /32 as a single host", () => {
    expect(expandIpv4Cidr("10.0.0.5/32")).toEqual(["10.0.0.5"]);
  });

  it("normalizes an arbitrary host address down to its network base", () => {
    const addresses = expandIpv4Cidr("192.168.1.130/24");
    expect(addresses[0]).toBe("192.168.1.1");
    expect(addresses).toHaveLength(254);
  });

  it("rejects a malformed CIDR string", () => {
    expect(() => expandIpv4Cidr("not-an-ip/24")).toThrow();
    expect(() => expandIpv4Cidr("10.0.0.1")).toThrow();
    expect(() => expandIpv4Cidr("10.0.0.999/24")).toThrow();
  });

  it("rejects a block larger than the pool size cap", () => {
    expect(() => expandIpv4Cidr("10.0.0.0/16")).toThrow(/pool limit/);
  });
});
