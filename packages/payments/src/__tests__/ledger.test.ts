import { beforeEach, describe, expect, it, vi } from "vitest";

/** In-memory stand-in for tenant_ledger_entries, enforcing the (sourceType, sourceId) unique
 *  index that the whole idempotency guarantee rests on. */
const entries: { tenantId: string; direction: string; amountMinor: number; sourceType: string; sourceId: string }[] = [];
let collectionMode = "PLATFORM";

class UniqueViolation extends Error {
  code = "P2002";
}

const db = {
  tenant: {
    findUnique: async () => ({ collectionMode }),
    findMany: async () => [{ id: "t1" }],
  },
  tenantLedgerEntry: {
    create: async ({ data }: { data: (typeof entries)[number] }) => {
      if (entries.some((e) => e.sourceType === data.sourceType && e.sourceId === data.sourceId)) {
        throw new UniqueViolation("duplicate");
      }
      entries.push(data);
      return data;
    },
    groupBy: async ({ where }: { where: { tenantId: string } }) => {
      const mine = entries.filter((e) => e.tenantId === where.tenantId);
      const sum = (d: string) =>
        mine.filter((e) => e.direction === d).reduce((t, e) => t + e.amountMinor, 0);
      return [
        { direction: "CREDIT", _sum: { amountMinor: sum("CREDIT") } },
        { direction: "DEBIT", _sum: { amountMinor: sum("DEBIT") } },
      ];
    },
    findMany: async () => entries,
  },
};

vi.mock("@mashupkgrid/database", () => ({ prisma: db }));

const { creditTenantForPayment, debitTenantForPayout, getTenantBalance, listTenantsWithBalance } =
  await import("../ledger.service.js");

const credit = (paymentId: string, amountMinor: number) =>
  creditTenantForPayment(db as never, {
    tenantId: "t1",
    paymentId,
    amountMinor,
    currency: "KES",
    description: "Hotspot voucher sale",
  });

beforeEach(() => {
  entries.length = 0;
  collectionMode = "PLATFORM";
});

describe("creditTenantForPayment", () => {
  it("credits a tenant whose payments this platform collects", async () => {
    await credit("pay-1", 15000);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ direction: "CREDIT", amountMinor: 15000 });
  });

  it("does NOT credit a tenant collecting with their own M-Pesa account", async () => {
    // Their customers paid them directly — the money never passed through this platform, so a
    // credit here would invent a debt and pay them a second time at the next payout run.
    collectionMode = "OWN";
    await credit("pay-1", 15000);
    expect(entries).toHaveLength(0);
  });

  it("ignores a replayed callback rather than crediting twice", async () => {
    // M-Pesa and Paystack both retry callbacks. A double credit here is money paid out twice.
    await credit("pay-1", 15000);
    await credit("pay-1", 15000);
    expect(entries).toHaveLength(1);
    expect((await getTenantBalance("t1")).balanceMinor).toBe(15000);
  });

  it("still credits a genuinely different payment of the same amount", async () => {
    await credit("pay-1", 15000);
    await credit("pay-2", 15000);
    expect((await getTenantBalance("t1")).balanceMinor).toBe(30000);
  });
});

describe("getTenantBalance", () => {
  it("is credits minus payouts", async () => {
    await credit("pay-1", 50000);
    await debitTenantForPayout(db as never, {
      tenantId: "t1",
      payoutId: "po-1",
      amountMinor: 20000,
      currency: "KES",
    });

    const balance = await getTenantBalance("t1");
    expect(balance).toMatchObject({ creditedMinor: 50000, paidOutMinor: 20000, balanceMinor: 30000 });
  });

  it("is zero, not negative, for a tenant with no entries", async () => {
    expect((await getTenantBalance("t1")).balanceMinor).toBe(0);
  });
});

describe("listTenantsWithBalance", () => {
  it("omits a tenant whose balance is below the minimum", async () => {
    await credit("pay-1", 500);
    expect(await listTenantsWithBalance(10000)).toHaveLength(0);
  });

  it("includes one at or above it", async () => {
    await credit("pay-1", 10000);
    const owed = await listTenantsWithBalance(10000);
    expect(owed).toHaveLength(1);
    expect(owed[0]!.balanceMinor).toBe(10000);
  });
});
