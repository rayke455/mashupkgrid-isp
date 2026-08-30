import { describe, it, expect } from "vitest";
import { parseRouterOSUptime } from "../mikrotik.adapter.js";

describe("parseRouterOSUptime", () => {
  it("parses a single unit", () => {
    expect(parseRouterOSUptime("5s")).toBe(5);
    expect(parseRouterOSUptime("3m")).toBe(180);
    expect(parseRouterOSUptime("2h")).toBe(7200);
    expect(parseRouterOSUptime("1d")).toBe(86400);
    expect(parseRouterOSUptime("1w")).toBe(604800);
  });

  it("parses a compound RouterOS uptime string", () => {
    // 4 weeks + 2 days + 3 hours + 4 minutes + 5 seconds
    const expected = 4 * 604800 + 2 * 86400 + 3 * 3600 + 4 * 60 + 5;
    expect(parseRouterOSUptime("4w2d3h4m5s")).toBe(expected);
  });

  it("returns 0 for an unparseable string", () => {
    expect(parseRouterOSUptime("")).toBe(0);
    expect(parseRouterOSUptime("garbage")).toBe(0);
  });
});
