import { randomInt } from "node:crypto";
import { prisma, Prisma, type StoreOrder, type StorePaymentMethod } from "@mashupkgrid/database";
import { ConflictError, NotFoundError, ValidationError } from "@mashupkgrid/shared";
import { initiateStkPush, queryStkPushStatus } from "../mpesa/daraja-client.js";
import { getPlatformMpesaCredentials } from "../mpesa/platform-config.service.js";
import { buildMpesaCallbackUrl } from "../mpesa/callback-url.js";
import { normalizeKenyanPhone } from "../mpesa/phone.js";
import { parseCallbackMetadata } from "../mpesa/callback.service.js";

/**
 * The public hardware store's orders. Money is taken with a real M-Pesa prompt on the platform's
 * paybill, and an order becomes PAID only when Safaricom says so (its callback, or a status query
 * the buyer triggers). Nothing the buyer's browser sends can mark an order paid.
 */

export interface StoreOrderItemSnapshot {
  productId: string;
  name: string;
  quantity: number;
  priceMinor: number;
}

/** Delivery charge: Nairobi, or anywhere else in Kenya. */
export function storeShippingMinor(county: string): number {
  return county.toLowerCase().includes("nairobi") ? 350_00 : 600_00;
}

async function uniqueOrderNumber(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const candidate = `ORD-${randomInt(100000, 1000000)}`;
    if (!(await prisma.storeOrder.findUnique({ where: { orderNumber: candidate }, select: { id: true } }))) return candidate;
  }
  throw new ConflictError("Couldn't allocate an order number. Please try again.");
}

export interface CreateStoreOrderInput {
  customerName: string;
  phone: string;
  email?: string;
  county: string;
  deliveryAddress: string;
  items: { productId: string; quantity: number }[];
  paymentMethod: StorePaymentMethod;
}

/** Creates the order at today's catalogue prices, then (for M-Pesa) sends the payment prompt.
 *  A prompt that can't be sent leaves the order waiting, with the reason, for a retry. */
export async function createStoreOrder(input: CreateStoreOrderInput): Promise<{ order: StoreOrder; paymentError: string | null }> {
  const phone = normalizeKenyanPhone(input.phone);
  const ids = [...new Set(input.items.map((i) => i.productId))];
  const products = await prisma.storeProduct.findMany({ where: { id: { in: ids } } });

  const items: StoreOrderItemSnapshot[] = [];
  for (const line of input.items) {
    const product = products.find((p) => p.id === line.productId);
    if (!product) throw new ValidationError("An item in your cart is no longer sold. Remove it and try again.");
    if (product.stock < line.quantity) {
      throw new ConflictError(
        product.stock > 0 ? `Only ${product.stock} of "${product.name}" left. Lower the quantity and try again.` : `"${product.name}" is out of stock.`
      );
    }
    items.push({ productId: product.id, name: product.name, quantity: line.quantity, priceMinor: product.priceMinor });
  }

  const subtotalMinor = items.reduce((sum, i) => sum + i.priceMinor * i.quantity, 0);
  const shippingMinor = storeShippingMinor(input.county);
  const order = await prisma.storeOrder.create({
    data: {
      orderNumber: await uniqueOrderNumber(),
      customerName: input.customerName.trim(),
      phone,
      email: input.email?.trim() || null,
      county: input.county,
      deliveryAddress: input.deliveryAddress.trim(),
      items: items as unknown as Prisma.InputJsonValue,
      subtotalMinor,
      shippingMinor,
      totalMinor: subtotalMinor + shippingMinor,
      paymentMethod: input.paymentMethod,
    },
  });

  if (input.paymentMethod !== "MPESA") return { order, paymentError: null };
  try {
    return { order: await startStoreOrderPayment(order.orderNumber, phone), paymentError: null };
  } catch (err) {
    return { order: await prisma.storeOrder.findUniqueOrThrow({ where: { id: order.id } }), paymentError: err instanceof Error ? err.message : String(err) };
  }
}

/** Sends (or re-sends) the M-Pesa prompt for an unpaid M-Pesa order. */
export async function startStoreOrderPayment(orderNumber: string, phoneInput?: string): Promise<StoreOrder> {
  const order = await prisma.storeOrder.findUnique({ where: { orderNumber } });
  if (!order) throw new NotFoundError("Order");
  if (order.status !== "PENDING" || order.paymentMethod !== "MPESA") throw new ConflictError("This order doesn't need an M-Pesa payment.");
  const phone = phoneInput ? normalizeKenyanPhone(phoneInput) : order.phone;

  let checkoutRequestId: string;
  try {
    const credentials = await getPlatformMpesaCredentials();
    const response = await initiateStkPush({
      credentials,
      phone,
      amountMinor: order.totalMinor,
      accountReference: order.orderNumber,
      transactionDesc: `Order ${order.orderNumber}`,
      callbackUrl: buildMpesaCallbackUrl(),
    });
    checkoutRequestId = response.CheckoutRequestID;
  } catch {
    const note = "We couldn't send the M-Pesa prompt. Please try again in a minute.";
    await prisma.storeOrder.update({ where: { id: order.id }, data: { paymentNote: note } });
    throw new ConflictError(note);
  }
  return prisma.storeOrder.update({ where: { id: order.id }, data: { checkoutRequestId, paymentNote: null } });
}

/** Records Safaricom's answer for a store order. False when the push isn't a store order's, so the
 *  callback route can try the next kind of payment. */
export async function tryCompleteStoreOrderCallback(rawPayload: unknown): Promise<boolean> {
  const cb = (rawPayload as { Body?: { stkCallback?: { CheckoutRequestID?: string; ResultCode?: number; ResultDesc?: string; CallbackMetadata?: { Item?: [] } } } })
    .Body?.stkCallback;
  if (!cb?.CheckoutRequestID || typeof cb.ResultCode !== "number") return false;
  const order = await prisma.storeOrder.findUnique({ where: { checkoutRequestId: cb.CheckoutRequestID } });
  if (!order) return false;
  await applyStoreOrderResult(order, cb.ResultCode, cb.ResultDesc ?? "", parseCallbackMetadata(cb.CallbackMetadata?.Item).mpesaReceiptNumber ?? null);
  return true;
}

async function applyStoreOrderResult(order: StoreOrder, resultCode: number, resultDesc: string, receipt: string | null): Promise<StoreOrder> {
  if (resultCode === 0) {
    // A status query has no receipt; the callback that follows fills in the real one.
    const hasRealReceipt = Boolean(order.mpesaReceiptNumber && !order.mpesaReceiptNumber.startsWith("STK-"));
    if (order.status === "PAID" && (hasRealReceipt || !receipt)) return order;
    return prisma.storeOrder.update({
      where: { id: order.id },
      data: {
        status: order.status === "PENDING" ? "PAID" : order.status,
        paidAt: order.paidAt ?? new Date(),
        mpesaReceiptNumber: receipt ?? order.mpesaReceiptNumber ?? `STK-${order.checkoutRequestId!.replace(/[^A-Za-z0-9]/g, "").slice(-12).toUpperCase()}`,
        paymentNote: null,
      },
    });
  }
  if (order.status !== "PENDING") return order;
  const note = resultCode === 1032 ? "The M-Pesa request was cancelled on the phone." : resultDesc || "M-Pesa didn't complete the payment.";
  return prisma.storeOrder.update({ where: { id: order.id }, data: { paymentNote: note, checkoutRequestId: null } });
}

/** "I've paid": asks Safaricom directly instead of waiting for its callback. */
export async function verifyStoreOrderPayment(orderNumber: string): Promise<StoreOrder> {
  const order = await prisma.storeOrder.findUnique({ where: { orderNumber } });
  if (!order) throw new NotFoundError("Order");
  if (order.status !== "PENDING" || !order.checkoutRequestId) return order;
  let result;
  try {
    result = await queryStkPushStatus(await getPlatformMpesaCredentials(), order.checkoutRequestId);
  } catch {
    // Safaricom answers "still being processed" as an error: nothing to record yet.
    return order;
  }
  const code = Number(result.ResultCode);
  if (Number.isNaN(code)) return order;
  return applyStoreOrderResult(order, code, result.ResultDesc ?? "", null);
}

/** The buyer's view of their order: only with the phone number it was placed with. */
export async function findStoreOrderForBuyer(orderNumber: string, phoneInput: string): Promise<StoreOrder> {
  const order = await prisma.storeOrder.findUnique({ where: { orderNumber: orderNumber.trim().toUpperCase() } });
  const digits = phoneInput.replace(/\D/g, "").slice(-9);
  if (!order || digits.length < 9 || !order.phone.endsWith(digits)) throw new NotFoundError("Order");
  return order;
}
