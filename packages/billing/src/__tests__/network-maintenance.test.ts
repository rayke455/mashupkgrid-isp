import { describe, it, expect } from "vitest";
import { dueMaintenanceNotice, maintenanceBeforeSms, maintenanceCancelledSms } from "../network-maintenance.service.js";

const H = 3_600_000;
const now = new Date("2026-10-01T09:00:00Z");
const base = { status: "SCHEDULED" as const, notifyHoursBefore: 24, beforeSentAt: null, afterSentAt: null };

describe("dueMaintenanceNotice", () => {
  it("waits until the notice window opens", () => {
    expect(dueMaintenanceNotice({ ...base, startsAt: new Date(now.getTime() + 30 * H), endsAt: new Date(now.getTime() + 32 * H) }, now)).toBeNull();
    expect(dueMaintenanceNotice({ ...base, startsAt: new Date(now.getTime() + 20 * H), endsAt: new Date(now.getTime() + 22 * H) }, now)).toBe("before");
  });

  it("sends the before notice once", () => {
    expect(dueMaintenanceNotice({ ...base, beforeSentAt: now, startsAt: new Date(now.getTime() + 2 * H), endsAt: new Date(now.getTime() + 4 * H) }, now)).toBeNull();
  });

  it("sends the after notice when it ends, but not hours later", () => {
    expect(dueMaintenanceNotice({ ...base, beforeSentAt: now, startsAt: new Date(now.getTime() - 3 * H), endsAt: new Date(now.getTime() - 1 * H) }, now)).toBe("after");
    expect(dueMaintenanceNotice({ ...base, beforeSentAt: now, startsAt: new Date(now.getTime() - 10 * H), endsAt: new Date(now.getTime() - 8 * H) }, now)).toBeNull();
  });

  it("sends nothing for a cancelled window", () => {
    expect(dueMaintenanceNotice({ ...base, status: "CANCELLED", startsAt: new Date(now.getTime() + 2 * H), endsAt: new Date(now.getTime() + 4 * H) }, now)).toBeNull();
  });
});

describe("maintenance texts", () => {
  it("gives the window in the ISP's own time and fits two SMS", () => {
    const sms = maintenanceBeforeSms({ startsAt: new Date("2026-10-04T23:00:00Z"), endsAt: new Date("2026-10-05T01:00:00Z"), message: "Fibre upgrade on Thika Road." }, "Demo ISP", "Africa/Nairobi");
    expect(sms).toContain("Mon, 5 Oct 02:00-04:00");
    expect(sms).toContain("Fibre upgrade on Thika Road.");
    expect(sms.length).toBeLessThanOrEqual(320);
    expect(maintenanceCancelledSms({ startsAt: new Date("2026-10-04T23:00:00Z") }, "Demo ISP", "Africa/Nairobi")).toContain("cancelled");
  });
});
