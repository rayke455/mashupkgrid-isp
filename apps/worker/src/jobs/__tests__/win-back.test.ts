import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  tenants: vi.fn(),
  billing: {
    settleWinBackOffers: vi.fn(),
    winBackCandidates: vi.fn(),
    createWinBackOffer: vi.fn(),
    markWinBackOfferFailed: vi.fn(),
  },
  sendTenantSms: vi.fn(),
}));

vi.mock("@mashupkgrid/database", () => ({ prisma: { tenant: { findMany: h.tenants } } }));
vi.mock("@mashupkgrid/billing", () => h.billing);
vi.mock("@mashupkgrid/sms", () => ({ sendTenantSms: h.sendTenantSms }));

import { handleWinBackOffers, isSendingHour } from "../win-back.js";

// 07:00 UTC is 10:00 in Nairobi.
const morning = new Date("2026-10-01T07:00:00Z");
const night = new Date("2026-10-01T20:00:00Z");
const on = { winBack: { enabled: true, discountPercent: 20, validDays: 7, minDaysBetween: 60 } };

describe("isSendingHour", () => {
  it("is daytime in the ISP's own time zone", () => {
    expect(isSendingHour(morning, "Africa/Nairobi")).toBe(true);
    expect(isSendingHour(night, "Africa/Nairobi")).toBe(false);
    expect(isSendingHour(new Date("2026-10-01T06:00:00Z"), "Africa/Nairobi")).toBe(true);
    expect(isSendingHour(new Date("2026-10-01T05:59:00Z"), "Africa/Nairobi")).toBe(false);
  });
});

describe("handleWinBackOffers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.billing.settleWinBackOffers.mockResolvedValue({ redeemed: 1, expired: 2 });
    h.billing.winBackCandidates.mockResolvedValue([
      { customerId: "c1", phone: "+254700000001" },
      { customerId: "c2", phone: "+254700000002" },
    ]);
    h.billing.createWinBackOffer.mockImplementation(async (_t: string, c: { customerId: string }) => ({ id: `o-${c.customerId}`, message: "hi" }));
  });

  it("texts offers for ISPs that turned it on, and marks the ones that failed", async () => {
    h.tenants.mockResolvedValue([
      { id: "t1", timezone: "Africa/Nairobi", preferences: on },
      { id: "t2", timezone: "Africa/Nairobi", preferences: {} },
    ]);
    h.sendTenantSms.mockResolvedValueOnce({ delivered: true }).mockResolvedValueOnce({ delivered: false });
    const res = await handleWinBackOffers(morning);
    expect(res).toEqual({ sent: 1, failed: 1, redeemed: 1, expired: 2 });
    expect(h.billing.winBackCandidates).toHaveBeenCalledTimes(1);
    expect(h.billing.markWinBackOfferFailed).toHaveBeenCalledWith("o-c2");
  });

  it("still settles offers at night but sends nothing", async () => {
    h.tenants.mockResolvedValue([{ id: "t1", timezone: "Africa/Nairobi", preferences: on }]);
    const res = await handleWinBackOffers(night);
    expect(res).toEqual({ sent: 0, failed: 0, redeemed: 1, expired: 2 });
    expect(h.sendTenantSms).not.toHaveBeenCalled();
  });
});
