import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  prisma: {
    radAcct: { findMany: vi.fn(), count: vi.fn() },
    radiusUser: { findMany: vi.fn() },
    hotspotVoucher: { findMany: vi.fn() },
    router: { findMany: vi.fn() },
    payment: { findMany: vi.fn() },
  },
}));

vi.mock("@mashupkgrid/database", () => ({ prisma: h.prisma }));

import { listTrackedSessions, SESSION_STALE_AFTER_MS } from "../session-tracking.service.js";

const TENANT = "t1";
const now = Date.now();
const minutesAgo = (m: number) => new Date(now - m * 60_000);

const pppoeRow = {
  acctUniqueId: "u-ppp",
  username: "acme-0001",
  nasIpAddress: "10.8.0.2",
  framedProtocol: "PPP",
  framedIpAddress: "100.64.0.9",
  callingStationId: "AA:BB:CC:DD:EE:01",
  acctStartTime: minutesAgo(120),
  acctUpdateTime: minutesAgo(2),
  acctStopTime: null,
  acctSessionTime: 7200,
  acctInputOctets: 1000n,
  acctOutputOctets: 50_000n,
  acctTerminateCause: null,
};
const voucherRow = {
  ...pppoeRow,
  acctUniqueId: "u-hs",
  username: "WIFI1234",
  framedProtocol: null,
  callingStationId: "AA:BB:CC:DD:EE:02",
  acctUpdateTime: minutesAgo(40), // no interim update for 40 min: stale
};
const unknownRow = { ...pppoeRow, acctUniqueId: "u-x", username: "ghost", framedProtocol: null, acctStopTime: minutesAgo(1) };

describe("listTrackedSessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.prisma.radAcct.findMany.mockImplementation(async ({ select }: { select?: unknown }) =>
      select ? [pppoeRow, voucherRow].map((r) => ({ username: r.username, framedProtocol: r.framedProtocol })) : [pppoeRow, voucherRow, unknownRow]
    );
    h.prisma.radAcct.count.mockResolvedValue(3);
    h.prisma.radiusUser.findMany.mockResolvedValue([
      {
        username: "acme-0001",
        customerId: "c1",
        customer: { id: "c1", fullName: "Jane Wanjiku", phone: "+254700000001", customerNumber: "C-0001" },
        customerService: { package: { name: "Home 10 Mbps", serviceType: "PPPOE" } },
      },
    ]);
    h.prisma.hotspotVoucher.findMany.mockResolvedValue([
      { code: "WIFI1234", expiresAt: minutesAgo(-60), status: "ACTIVE", hotspotPackage: { name: "1 hour" }, package: null },
    ]);
    h.prisma.router.findMany.mockResolvedValue([{ id: "r1", name: "Kasarani hAP", host: "10.8.0.2", vpnIp: "10.8.0.2" }]);
    h.prisma.payment.findMany.mockResolvedValue([{ customerId: "c1", amountMinor: 150000, currency: "KES", method: "MPESA", createdAt: minutesAgo(600) }]);
  });

  it("joins each session to its customer or voucher, router and last payment", async () => {
    const { items, summary } = await listTrackedSessions(TENANT);
    const ppp = items.find((s) => s.username === "acme-0001")!;
    expect(ppp).toMatchObject({
      type: "PPPOE",
      state: "ACTIVE",
      customer: { fullName: "Jane Wanjiku" },
      packageName: "Home 10 Mbps",
      router: { name: "Kasarani hAP" },
      ipAddress: "100.64.0.9",
      downloadBytes: 50_000,
      uploadBytes: 1000,
      lastPayment: { amountMinor: 150000, method: "MPESA" },
    });
    const hs = items.find((s) => s.username === "WIFI1234")!;
    expect(hs).toMatchObject({ type: "HOTSPOT", state: "STALE", customer: null, voucher: { code: "WIFI1234" }, packageName: "1 hour", lastPayment: null });
    const ghost = items.find((s) => s.username === "ghost")!;
    expect(ghost).toMatchObject({ type: "HOTSPOT", state: "ENDED", customer: null, voucher: null, router: { name: "Kasarani hAP" } });
    expect(summary).toEqual({ activeHotspot: 1, activePppoe: 1, activeOther: 0, activePaid: 2 });
  });

  it("marks a session stale only once the router has been quiet for the threshold", async () => {
    const { items } = await listTrackedSessions(TENANT);
    expect(SESSION_STALE_AFTER_MS).toBe(15 * 60_000);
    expect(items.find((s) => s.username === "acme-0001")!.state).toBe("ACTIVE");
    expect(items.find((s) => s.username === "WIFI1234")!.state).toBe("STALE");
  });

  it("searches across name, phone, voucher code, IP and MAC", async () => {
    expect((await listTrackedSessions(TENANT, { search: "wanjiku" })).items.map((s) => s.username)).toEqual(["acme-0001"]);
    expect((await listTrackedSessions(TENANT, { search: "wifi12" })).items.map((s) => s.username)).toEqual(["WIFI1234"]);
    expect((await listTrackedSessions(TENANT, { search: "EE:02" })).items.map((s) => s.username)).toEqual(["WIFI1234"]);
    expect((await listTrackedSessions(TENANT, { search: "100.64.0.9" })).items).toHaveLength(3); // same IP on the fixtures
  });

  it("always scopes the accounting query to the tenant", async () => {
    await listTrackedSessions(TENANT, { scope: "recent", days: 3 });
    const call = h.prisma.radAcct.findMany.mock.calls[0]![0];
    expect(call.where.tenantId).toBe(TENANT);
    expect(call.where.OR).toBeDefined();
  });
});
