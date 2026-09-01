import { beforeEach, describe, expect, it, vi } from "vitest";

const stkRows: Record<string, unknown>[] = [];
const gatewayRows: Record<string, unknown>[] = [];
const queries: { stk?: Record<string, unknown>; gateway?: Record<string, unknown> } = {};

vi.mock("@mashupkgrid/database", () => ({
  prisma: {
    mpesaStkRequest: {
      findMany: async (args: Record<string, unknown>) => {
        queries.stk = args;
        return stkRows;
      },
      groupBy: async () => [
        { status: "COMPLETED", _count: { _all: 3 } },
        { status: "CANCELLED", _count: { _all: 2 } },
      ],
    },
    paystackTransaction: {
      findMany: async (args: Record<string, unknown>) => {
        queries.gateway = args;
        return gatewayRows;
      },
      groupBy: async () => [
        { status: "FAILED", _count: { _all: 1 } },
        { status: "ABANDONED", _count: { _all: 4 } },
      ],
    },
  },
}));

const { listPurchaseAttempts, summarisePurchaseAttempts } = await import("../purchase-attempts.service.js");

function stk(over: Record<string, unknown> = {}) {
  return {
    id: "s1",
    checkoutRequestId: "ws_CO_1",
    createdAt: new Date("2026-09-01T10:00:00Z"),
    updatedAt: new Date("2026-09-01T10:00:00Z"),
    phone: "254712345678",
    amountMinor: 5000,
    status: "COMPLETED",
    resultDesc: null,
    hotspotVoucherCode: "ABC123",
    hotspotPackage: { name: "1 Hour" },
    customer: null,
    ...over,
  };
}

function gateway(over: Record<string, unknown> = {}) {
  return {
    id: "g1",
    reference: "ref_123",
    createdAt: new Date("2026-09-01T11:00:00Z"),
    updatedAt: new Date("2026-09-01T11:00:00Z"),
    hotspotPhone: "254700000000",
    hotspotEmail: "a@b.co",
    amountMinor: 10000,
    currency: "KES",
    status: "ABANDONED",
    gatewayResponse: "Customer left checkout",
    hotspotVoucherCode: null,
    hotspotPackage: { name: "1 Day" },
    customer: null,
    ...over,
  };
}

beforeEach(() => {
  stkRows.length = 0;
  gatewayRows.length = 0;
  queries.stk = undefined;
  queries.gateway = undefined;
});

describe("listPurchaseAttempts", () => {
  it("merges both sources newest-first", async () => {
    stkRows.push(stk());
    gatewayRows.push(gateway());
    const result = await listPurchaseAttempts("t1");
    expect(result.map((r) => r.id)).toEqual(["g1", "s1"]); // 11:00 before 10:00
  });

  it("labels a PESA- reference as Pesapal and anything else as Paystack", async () => {
    gatewayRows.push(gateway({ id: "g1", reference: "PESA-abc-123" }), gateway({ id: "g2", reference: "ref_9" }));
    const result = await listPurchaseAttempts("t1");
    expect(result.find((r) => r.id === "g1")?.provider).toBe("PESAPAL");
    expect(result.find((r) => r.id === "g2")?.provider).toBe("PAYSTACK");
  });

  it("reports an M-Pesa CANCELLED as ABANDONED so both gateways speak one vocabulary", async () => {
    stkRows.push(stk({ status: "CANCELLED", resultDesc: "Request cancelled by user" }));
    const [attempt] = await listPurchaseAttempts("t1");
    expect(attempt!.status).toBe("ABANDONED");
    expect(attempt!.failureReason).toBe("Request cancelled by user");
  });

  it("translates an ABANDONED filter back to each table's own enum", async () => {
    await listPurchaseAttempts("t1", { status: "ABANDONED" });
    // M-Pesa has no ABANDONED and Paystack has no CANCELLED; querying either with the wrong
    // name returns nothing rather than erroring, so the filter would silently show an empty page.
    expect((queries.stk!.where as Record<string, unknown>).status).toBe("CANCELLED");
    expect((queries.gateway!.where as Record<string, unknown>).status).toBe("ABANDONED");
  });

  it("suppresses the gateway's success blurb as a failure reason", async () => {
    stkRows.push(stk({ status: "COMPLETED", resultDesc: "The service request is processed successfully." }));
    const [attempt] = await listPurchaseAttempts("t1");
    expect(attempt!.failureReason).toBeNull();
  });
});

describe("summarisePurchaseAttempts", () => {
  it("counts abandoned separately from failed across both tables", async () => {
    const summary = await summarisePurchaseAttempts("t1");
    expect(summary).toMatchObject({
      completed: 3,
      failed: 1,
      abandoned: 6, // 2 M-Pesa CANCELLED + 4 Paystack ABANDONED
      pending: 0,
      total: 10,
    });
    expect(summary.conversionRate).toBe(30);
  });
});
