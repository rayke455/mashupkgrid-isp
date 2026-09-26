import { describe, it, expect, beforeEach, vi } from "vitest";

/** Only payments at or above the ISP's own alert amount alert, each exactly once, and an ISP
 *  that set the amount to 0 gets none. */

const h = vi.hoisted(() => ({
  prisma: { payment: { findMany: vi.fn() }, tenant: { findUnique: vi.fn() } },
  claimed: new Set<string>(),
  push: vi.fn(),
}));

vi.mock("@mashupkgrid/database", () => ({ prisma: h.prisma }));
vi.mock("@mashupkgrid/push", () => ({ isPushConfigured: () => true, pushToTenantStaff: h.push }));
vi.mock("../../lib/redis.js", () => ({
  redis: {
    set: vi.fn(async (key: string) => {
      if (h.claimed.has(key)) return null;
      h.claimed.add(key);
      return "OK";
    }),
  },
}));

import { handlePushLargePayments } from "../push-large-payments.js";

const pay = (id: string, tenantId: string, amountMinor: number) => ({
  id, tenantId, amountMinor, currency: "KES", method: "MPESA", reference: `R${id}`, customer: { id: `c-${id}`, fullName: "Jane Wanjiku" },
});

describe("large payment alerts", () => {
  beforeEach(() => {
    h.claimed.clear();
    h.push.mockReset().mockResolvedValue(1);
    h.prisma.tenant.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      preferences: where.id === "quiet" ? { alerts: { largePaymentMinor: 0 } } : { alerts: { largePaymentMinor: 1_000_000 } },
    }));
  });

  it("alerts once for payments over the ISP's amount", async () => {
    h.prisma.payment.findMany.mockResolvedValue([pay("big", "t1", 1_200_000), pay("small", "t1", 50_000), pay("off", "quiet", 9_000_000)]);

    expect(await handlePushLargePayments()).toEqual({ checked: 3, alerted: 1 });
    expect(h.push).toHaveBeenCalledTimes(1);
    expect(h.push.mock.calls[0]![0]).toBe("t1");
    expect(h.push.mock.calls[0]![1]).toBe("payments.read");
    expect(h.push.mock.calls[0]![2].title).toContain("12,000.00");
    expect(h.push.mock.calls[0]![2].body).toBe("From Jane Wanjiku (M-Pesa Rbig).");

    // The next minute sees the same payment again and stays quiet.
    expect(await handlePushLargePayments()).toEqual({ checked: 3, alerted: 0 });
    expect(h.push).toHaveBeenCalledTimes(1);
  });
});
