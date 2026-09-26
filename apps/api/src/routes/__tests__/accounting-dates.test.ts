import { describe, it, expect, vi } from "vitest";

vi.mock("@mashupkgrid/database", () => ({ prisma: {} }));
vi.mock("@mashupkgrid/billing", () => ({ buildAccountingExport: vi.fn() }));
vi.mock("../../lib/redis.js", () => ({ redis: {} }));
vi.mock("../../lib/audit.js", () => ({ writeAuditLog: vi.fn() }));
vi.mock("../../lib/maintenance-state.js", () => ({ getCurrentMaintenanceState: vi.fn() }));

import { localMidnight } from "../accounting.js";

describe("localMidnight", () => {
  it("is the start of the day in the ISP's time zone", () => {
    expect(localMidnight("2026-09-01", "Africa/Nairobi").toISOString()).toBe("2026-08-31T21:00:00.000Z");
    expect(localMidnight("2026-09-01", "UTC").toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(localMidnight("2026-01-01", "Africa/Lagos").toISOString()).toBe("2025-12-31T23:00:00.000Z");
  });
});
