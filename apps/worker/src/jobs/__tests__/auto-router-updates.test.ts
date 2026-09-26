import { describe, it, expect, vi } from "vitest";

vi.mock("@mashupkgrid/database", () => ({ prisma: {} }));
vi.mock("../../lib/redis.js", () => ({ redis: {} }));

import { isAutoUpdateDue, localParts } from "../auto-router-updates.js";

describe("monthly router upgrade timing", () => {
  it("uses the ISP's own timezone", () => {
    // 00:30 UTC on the 5th is 03:30 in Nairobi.
    const now = new Date("2026-10-05T00:30:00Z");
    expect(localParts(now, "Africa/Nairobi")).toMatchObject({ day: 5, hour: 3 });
    expect(isAutoUpdateDue(now, "Africa/Nairobi", 5, 3)).toBe(true);
    expect(isAutoUpdateDue(now, "UTC", 5, 3)).toBe(false);
  });
  it("is not due on other days or hours", () => {
    expect(isAutoUpdateDue(new Date("2026-10-04T00:30:00Z"), "Africa/Nairobi", 5, 3)).toBe(false);
    expect(isAutoUpdateDue(new Date("2026-10-05T01:30:00Z"), "Africa/Nairobi", 5, 3)).toBe(false);
  });
});
