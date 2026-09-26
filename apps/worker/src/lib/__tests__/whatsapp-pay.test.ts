import { describe, it, expect, beforeEach, vi } from "vitest";

/** "pay" on WhatsApp sends an M-Pesa prompt for the sender's own oldest unpaid invoice, to the
 *  sender's own phone, at most once a minute. The message never chooses the amount. */

const h = vi.hoisted(() => ({
  prisma: { customer: { findFirst: vi.fn() }, invoice: { findFirst: vi.fn() } },
  stk: vi.fn(),
  keys: new Set<string>(),
}));

vi.mock("ioredis", () => ({
  Redis: class {
    on() {}
    async set(key: string) {
      if (h.keys.has(key)) return null;
      h.keys.add(key);
      return "OK";
    }
    async del(key: string) {
      h.keys.delete(key);
    }
  },
}));
vi.mock("@mashupkgrid/config", () => ({ env: { REDIS_URL: "redis://x" } }));
vi.mock("@mashupkgrid/database", () => ({ prisma: h.prisma }));
vi.mock("@mashupkgrid/radius", () => ({ listHotspotPackages: vi.fn() }));
vi.mock("@mashupkgrid/payments", () => ({ initiateHotspotPurchaseStkPush: vi.fn(), initiateStkPushForCustomer: h.stk }));
vi.mock("@mashupkgrid/support", () => ({ createTicket: vi.fn() }));
vi.mock("@mashupkgrid/whatsapp", () => ({ sendWhatsAppMessage: vi.fn() }));

import { handlePayInvoice } from "../whatsapp-bot.js";

describe("WhatsApp pay", () => {
  beforeEach(() => {
    h.keys.clear();
    h.stk.mockReset().mockResolvedValue({ id: "stk1" });
    h.prisma.customer.findFirst.mockReset().mockResolvedValue({ id: "c1", fullName: "Jane" });
    h.prisma.invoice.findFirst.mockReset().mockResolvedValue({ id: "i1", invoiceNumber: "INV-7", totalMinor: 250_000, amountPaidMinor: 50_000, currency: "KES" });
  });

  it("prompts the sender's phone for what is left on their oldest invoice", async () => {
    const reply = await handlePayInvoice("t1", "+254712345678");
    expect(h.prisma.customer.findFirst.mock.calls[0]![0].where).toMatchObject({ tenantId: "t1", phone: { endsWith: "712345678" } });
    expect(h.stk).toHaveBeenCalledWith("t1", { customerId: "c1", invoiceId: "i1", phone: "+254712345678", amountMinor: 200_000, initiatedByUserId: null });
    expect(reply).toContain("2,000.00");
    expect(reply).toContain("INV-7");
  });

  it("does not send a second prompt within a minute", async () => {
    await handlePayInvoice("t1", "+254712345678");
    const second = await handlePayInvoice("t1", "+254712345678");
    expect(h.stk).toHaveBeenCalledTimes(1);
    expect(second).toContain("just sent");
  });

  it("says so when nothing is owed, and sends nothing", async () => {
    h.prisma.invoice.findFirst.mockResolvedValue(null);
    expect(await handlePayInvoice("t1", "+254712345678")).toContain("nothing to pay");
    expect(h.stk).not.toHaveBeenCalled();
  });

  it("lets the customer retry at once if M-Pesa refused the request", async () => {
    h.stk.mockRejectedValueOnce(new Error("Safaricom down"));
    expect(await handlePayInvoice("t1", "+254712345678")).toContain("could not send");
    await handlePayInvoice("t1", "+254712345678");
    expect(h.stk).toHaveBeenCalledTimes(2);
  });
});
