import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@mashupkgrid/database";
import { ConflictError, NotFoundError } from "@mashupkgrid/shared";
import {
  createStoreOrder,
  findStoreOrderForBuyer,
  startStoreOrderPayment,
  tryCompleteStoreOrderCallback,
  verifyStoreOrderPayment,
} from "../../store/store-order.service.js";
import { assertTestDatabase, integrationEnabled, resetDb, seedPlatform, stkCallback } from "./harness.js";

/** The store may only call an order paid when Safaricom says so. */
describe.skipIf(!integrationEnabled)("hardware store orders", () => {
  let stk: { mode: "accept" | "network"; pushes: Record<string, unknown>[]; queryResult: string };

  beforeEach(async () => {
    await resetDb();
    assertTestDatabase();
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "store_orders", "store_products"`);
    await seedPlatform();
    await prisma.storeProduct.create({
      data: {
        id: "prod_hex",
        slug: "hex",
        name: "MikroTik hEX",
        brand: "MikroTik",
        category: "routers",
        priceMinor: 8500_00,
        stock: 3,
        shortDescription: "5-port router",
        description: "A small, fast router.",
        imageUrl: "https://example.com/hex.jpg",
        specs: [],
        warranty: "1 year",
      },
    });
    stk = { mode: "accept", pushes: [], queryResult: "0" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/oauth/")) return new Response(JSON.stringify({ access_token: "t", expires_in: "3599" }), { status: 200 });
        if (stk.mode === "network") throw new TypeError("fetch failed");
        if (url.includes("stkpushquery")) {
          return new Response(JSON.stringify({ ResultCode: stk.queryResult, ResultDesc: "done" }), { status: 200 });
        }
        stk.pushes.push(JSON.parse(String(init?.body)));
        return new Response(
          JSON.stringify({ MerchantRequestID: "m", CheckoutRequestID: `ws_CO_${randomUUID()}`, ResponseCode: "0", ResponseDescription: "ok", CustomerMessage: "ok" }),
          { status: 200 }
        );
      })
    );
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await prisma.$disconnect();
  });

  const buyer = { customerName: "Jane Wanjiku", phone: "0712345678", county: "Nairobi", deliveryAddress: "Moi Avenue, Shop 12" };

  it("prices the order from the catalogue and sends an M-Pesa prompt for the total", async () => {
    const { order, paymentError } = await createStoreOrder({ ...buyer, items: [{ productId: "prod_hex", quantity: 2 }], paymentMethod: "MPESA" });
    expect(paymentError).toBeNull();
    expect(order.status).toBe("PENDING");
    expect(order.subtotalMinor).toBe(17_000_00);
    expect(order.shippingMinor).toBe(350_00);
    expect(order.totalMinor).toBe(17_350_00);
    expect(order.checkoutRequestId).toMatch(/^ws_CO_/);
    expect(stk.pushes[0]).toMatchObject({ Amount: 17350, AccountReference: order.orderNumber });
  });

  it("becomes PAID only on Safaricom's confirmation, and a repeat callback changes nothing", async () => {
    const { order } = await createStoreOrder({ ...buyer, items: [{ productId: "prod_hex", quantity: 1 }], paymentMethod: "MPESA" });
    expect(await tryCompleteStoreOrderCallback(stkCallback(order.checkoutRequestId!, { receipt: "UIO1STORE1" }))).toBe(true);
    const paid = await prisma.storeOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(paid).toMatchObject({ status: "PAID", mpesaReceiptNumber: "UIO1STORE1" });
    expect(paid.paidAt).not.toBeNull();

    await tryCompleteStoreOrderCallback(stkCallback(order.checkoutRequestId!, { receipt: "UIO1STORE1" }));
    expect((await prisma.storeOrder.findUniqueOrThrow({ where: { id: order.id } })).paidAt).toEqual(paid.paidAt);
  });

  it("stays unpaid after a cancelled prompt, and can be retried", async () => {
    const { order } = await createStoreOrder({ ...buyer, items: [{ productId: "prod_hex", quantity: 1 }], paymentMethod: "MPESA" });
    await tryCompleteStoreOrderCallback(stkCallback(order.checkoutRequestId!, { resultCode: 1032 }));
    const cancelled = await prisma.storeOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(cancelled).toMatchObject({ status: "PENDING", checkoutRequestId: null });
    expect(cancelled.paymentNote).toContain("cancelled");

    const retried = await startStoreOrderPayment(order.orderNumber);
    expect(retried.checkoutRequestId).toMatch(/^ws_CO_/);
    expect(retried.paymentNote).toBeNull();
  });

  it("\"I've paid\" asks Safaricom and records the answer", async () => {
    const { order } = await createStoreOrder({ ...buyer, items: [{ productId: "prod_hex", quantity: 1 }], paymentMethod: "MPESA" });
    const verified = await verifyStoreOrderPayment(order.orderNumber);
    expect(verified.status).toBe("PAID");
    expect(verified.mpesaReceiptNumber).toMatch(/^STK-/);
    // The callback that follows replaces the placeholder with Safaricom's receipt.
    await tryCompleteStoreOrderCallback(stkCallback(order.checkoutRequestId!, { receipt: "UIO1REAL02" }));
    expect((await prisma.storeOrder.findUniqueOrThrow({ where: { id: order.id } })).mpesaReceiptNumber).toBe("UIO1REAL02");
  });

  it("keeps the order when the prompt can't be sent, and says why", async () => {
    stk.mode = "network";
    const { order, paymentError } = await createStoreOrder({ ...buyer, items: [{ productId: "prod_hex", quantity: 1 }], paymentMethod: "MPESA" });
    expect(order.status).toBe("PENDING");
    expect(order.checkoutRequestId).toBeNull();
    expect(paymentError).toContain("couldn't send the M-Pesa prompt");
  });

  it("pay on delivery sends no prompt", async () => {
    const { order } = await createStoreOrder({ ...buyer, county: "Kisumu", items: [{ productId: "prod_hex", quantity: 1 }], paymentMethod: "PAY_ON_DELIVERY" });
    expect(order).toMatchObject({ status: "PENDING", paymentMethod: "PAY_ON_DELIVERY", shippingMinor: 600_00, checkoutRequestId: null });
    expect(stk.pushes).toHaveLength(0);
  });

  it("refuses more than is in stock", async () => {
    await expect(createStoreOrder({ ...buyer, items: [{ productId: "prod_hex", quantity: 4 }], paymentMethod: "MPESA" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("shows an order only to someone with its phone number", async () => {
    const { order } = await createStoreOrder({ ...buyer, items: [{ productId: "prod_hex", quantity: 1 }], paymentMethod: "PAY_ON_DELIVERY" });
    await expect(findStoreOrderForBuyer(order.orderNumber, "0799999999")).rejects.toBeInstanceOf(NotFoundError);
    expect((await findStoreOrderForBuyer(order.orderNumber.toLowerCase(), "+254 712 345 678")).id).toBe(order.id);
  });
});
