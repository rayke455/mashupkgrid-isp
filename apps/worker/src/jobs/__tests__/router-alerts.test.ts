import { describe, expect, it, vi } from "vitest";

vi.mock("@mashupkgrid/database", () => ({ prisma: {} }));
vi.mock("@mashupkgrid/sms", () => ({ sendTenantSms: vi.fn() }));
vi.mock("../../lib/email.js", () => ({ sendEmail: vi.fn() }));

import { routerAlertFor } from "../router-alerts.js";

describe("routerAlertFor", () => {
  it("alerts once when a router that was up stops responding", () => {
    expect(routerAlertFor("ONLINE", false)).toBe("down");
    expect(routerAlertFor("WARNING", false)).toBe("down");
    expect(routerAlertFor("DOWN", false)).toBeNull(); // already alerted for this outage
  });

  it("says when it's back", () => {
    expect(routerAlertFor("DOWN", true)).toBe("recovered");
    expect(routerAlertFor("ONLINE", true)).toBeNull();
  });

  it("never alerts about a router that was never set up", () => {
    // A router added in the dashboard but not yet linked stays UNKNOWN; it used to be texted
    // about as "DOWN" on every poll.
    expect(routerAlertFor("UNKNOWN", false)).toBeNull();
    expect(routerAlertFor("UNKNOWN", true)).toBeNull();
  });
});
