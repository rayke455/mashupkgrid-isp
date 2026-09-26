import { describe, it, expect, vi } from "vitest";

vi.mock("@mashupkgrid/database", () => ({ prisma: {} }));
vi.mock("@mashupkgrid/push", () => ({ pushToTenantStaff: vi.fn() }));
vi.mock("../../lib/redis.js", () => ({ redis: {} }));

import { healthAlertsFor, type HealthReading } from "../router-health.js";

const r = (over: Partial<HealthReading>): HealthReading => ({ reachable: true, cpuPercent: 20, temperatureC: 45, uptimeSeconds: 10_000, ...over });

describe("router health alerts", () => {
  it("alerts on CPU only after three busy readings in a row", () => {
    expect(healthAlertsFor(r({ cpuPercent: 95 }), [r({ cpuPercent: 92 })], false)).toEqual([]);
    expect(healthAlertsFor(r({ cpuPercent: 95 }), [r({ cpuPercent: 92 }), r({ cpuPercent: 97 })], false)).toEqual(["cpu"]);
    expect(healthAlertsFor(r({ cpuPercent: 95 }), [r({ cpuPercent: 92 }), r({ cpuPercent: 40 })], false)).toEqual([]);
  });

  it("alerts on heat", () => {
    expect(healthAlertsFor(r({ temperatureC: 78 }), [], false)).toEqual(["temperature"]);
  });

  it("alerts on an unplanned reboot but not a planned one", () => {
    const prev = [r({ uptimeSeconds: 500_000 })];
    expect(healthAlertsFor(r({ uptimeSeconds: 120 }), prev, false)).toEqual(["reboot"]);
    expect(healthAlertsFor(r({ uptimeSeconds: 120 }), prev, true)).toEqual([]);
    expect(healthAlertsFor(r({ uptimeSeconds: 500_300 }), prev, false)).toEqual([]);
  });

  it("says nothing about a router it cannot reach", () => {
    expect(healthAlertsFor(r({ reachable: false, temperatureC: 90 }), [], false)).toEqual([]);
  });
});
