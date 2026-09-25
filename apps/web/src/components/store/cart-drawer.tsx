"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ApiRequestError } from "@/lib/api-client";
import {
  KENYA_COUNTIES,
  getOrder,
  placeOrder,
  retryOrderPayment,
  shippingFeeFor,
  useCart,
  type HardwareOrder,
  type PaymentMethod,
} from "@/lib/hardware-store";
import { ksh } from "./hardware-product-card";

type Step = "cart" | "details" | "paying" | "done";

const field =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20";

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiRequestError ? err.message : fallback;
}

export function CartDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { items, updateQuantity, removeItem, clearCart, subtotal } = useCart();
  const [step, setStep] = useState<Step>("cart");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [county, setCounty] = useState("Nairobi");
  const [address, setAddress] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("MPESA");

  const [order, setOrder] = useState<HardwareOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const shipping = items.length ? shippingFeeFor(county) : 0;

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && step !== "paying" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, step]);

  // While a prompt is out, follow the order until M-Pesa answers.
  useEffect(() => {
    if (step !== "paying" || !order) return;
    let stopped = false;
    let tries = 0;
    const tick = async () => {
      if (stopped) return;
      tries += 1;
      try {
        const latest = await getOrder(order.orderNumber, phone);
        if (stopped) return;
        setOrder(latest);
        if (latest.status !== "PENDING") return setStep("done");
        if (!latest.awaitingMpesa) return; // failed or cancelled: the note explains, retry is offered
      } catch {
        // A dropped poll is not a failed payment; try again.
      }
      if (tries < 40) setTimeout(tick, 3000);
      else setNote("Still waiting for M-Pesa. If you've entered your PIN, tap “I've paid”.");
    };
    const first = setTimeout(tick, 3000);
    return () => {
      stopped = true;
      clearTimeout(first);
    };
    // Restarts when a retried prompt goes out (awaitingMpesa turns true again).
  }, [step, order?.orderNumber, order?.awaitingMpesa, phone]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const close = () => {
    if (step === "done") {
      setStep("cart");
      setOrder(null);
    }
    onClose();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNote(null);
    const digits = phone.replace(/\D/g, "");
    if (!/^(0[71]\d{8}|[71]\d{8}|254[71]\d{8})$/.test(digits)) return setError("Enter your phone number, e.g. 0712 345 678.");
    if (address.trim().length < 5) return setError("Add a delivery address we can find: street, building or landmark.");
    setBusy(true);
    try {
      const result = await placeOrder({
        customerName: name.trim(),
        phone: digits,
        email: email.trim() || undefined,
        county,
        deliveryAddress: address.trim(),
        items: items.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
        paymentMethod: method,
      });
      clearCart();
      setOrder(result.order);
      if (method === "PAY_ON_DELIVERY") setStep("done");
      else {
        setStep("paying");
        if (result.paymentError) setNote(result.paymentError);
      }
    } catch (err) {
      setError(errorText(err, "Couldn't place the order. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const checkNow = async () => {
    if (!order) return;
    setBusy(true);
    setNote(null);
    try {
      const latest = await getOrder(order.orderNumber, phone, true);
      setOrder(latest);
      if (latest.status !== "PENDING") setStep("done");
      else if (latest.awaitingMpesa) setNote("M-Pesa hasn't confirmed it yet. Give it a few seconds; this updates by itself.");
    } catch (err) {
      setNote(errorText(err, "Couldn't check right now. Try again in a moment."));
    } finally {
      setBusy(false);
    }
  };

  const retry = async () => {
    if (!order) return;
    setBusy(true);
    setNote(null);
    try {
      setOrder(await retryOrderPayment(order.orderNumber, phone));
    } catch (err) {
      setNote(errorText(err, "Couldn't send the prompt. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="force-light fixed inset-0 z-50 flex justify-end bg-slate-950/50" onClick={step === "paying" ? undefined : close}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Your cart"
        className="flex h-full w-full max-w-md flex-col bg-white text-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">
            {step === "cart" ? "Your cart" : step === "details" ? "Delivery & payment" : step === "paying" ? "Pay with M-Pesa" : "Order placed"}
          </h2>
          <button type="button" onClick={close} aria-label="Close" className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {step === "cart" &&
            (items.length === 0 ? (
              <div className="py-16 text-center">
                <p className="font-medium text-slate-900">Your cart is empty</p>
                <p className="mt-1 text-sm text-slate-500">Add something from the store to get started.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map(({ product, quantity }) => (
                  <li key={product.id} className="flex gap-3 py-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-50 p-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={product.imageUrl} alt="" className="h-full w-full object-contain" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium text-slate-900">{product.name}</p>
                      <p className="mt-0.5 text-sm tabular-nums text-slate-600">{ksh(product.price)}</p>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="flex items-center rounded-lg border border-slate-300">
                          <button type="button" aria-label="Fewer" className="px-2.5 py-1 text-slate-700" onClick={() => updateQuantity(product.id, quantity - 1)}>
                            −
                          </button>
                          <span className="w-7 text-center text-sm tabular-nums">{quantity}</span>
                          <button
                            type="button"
                            aria-label="More"
                            className="px-2.5 py-1 text-slate-700 disabled:opacity-40"
                            disabled={quantity >= product.stock}
                            onClick={() => updateQuantity(product.id, quantity + 1)}
                          >
                            +
                          </button>
                        </div>
                        <button type="button" onClick={() => removeItem(product.id)} className="text-sm text-slate-500 hover:text-rose-600">
                          Remove
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ))}

          {step === "details" && (
            <form id="checkout" onSubmit={submit} className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-900">Full name</span>
                <input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={field} />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-900">Phone (M-Pesa)</span>
                <input required type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" className={field} />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-900">
                  Email <span className="font-normal text-slate-500">(optional)</span>
                </span>
                <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-900">County</span>
                <select value={county} onChange={(e) => setCounty(e.target.value)} className={field}>
                  {KENYA_COUNTIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-900">Delivery address</span>
                <textarea
                  required
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street, building, shop number or a landmark"
                  className={field}
                />
              </label>

              <fieldset>
                <legend className="text-sm font-medium text-slate-900">Payment</legend>
                <div className="mt-2 space-y-2">
                  {(
                    [
                      ["MPESA", "M-Pesa now", "You'll get a prompt on your phone to enter your PIN."],
                      ["PAY_ON_DELIVERY", "Pay on delivery", "Pay with M-Pesa when your order arrives. We'll call to confirm first."],
                    ] as const
                  ).map(([value, label, hint]) => (
                    <label
                      key={value}
                      className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${method === value ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-slate-200"}`}
                    >
                      <input type="radio" name="method" className="mt-1 accent-brand-600" checked={method === value} onChange={() => setMethod(value)} />
                      <span>
                        <span className="block text-sm font-medium text-slate-900">{label}</span>
                        <span className="block text-xs text-slate-500">{hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {error && (
                <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  {error}
                </p>
              )}
            </form>
          )}

          {step === "paying" && order && (
            <div className="py-6 text-center">
              {order.awaitingMpesa ? (
                <>
                  <span aria-hidden="true" className="mx-auto block h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-brand-600" />
                  <p className="mt-4 text-lg font-semibold text-slate-950">Check your phone</p>
                  <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-slate-600">
                    Enter your M-Pesa PIN to pay <strong className="text-slate-900">{ksh(order.totalAmount)}</strong> for order {order.orderNumber}.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold text-slate-950">Payment not completed</p>
                  <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-slate-600">
                    {order.paymentNote ?? "The M-Pesa prompt didn't go through."} Your order {order.orderNumber} is saved; you can try again.
                  </p>
                </>
              )}
              {note && <p className="mx-auto mt-4 max-w-xs text-sm text-slate-600">{note}</p>}
              <div className="mt-6 flex flex-col gap-2">
                {order.awaitingMpesa ? (
                  <button type="button" onClick={checkNow} disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60">
                    {busy ? "Checking…" : "I've paid"}
                  </button>
                ) : (
                  <button type="button" onClick={retry} disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60">
                    {busy ? "Sending…" : "Send the M-Pesa prompt again"}
                  </button>
                )}
              </div>
            </div>
          )}

          {step === "done" && order && (
            <div className="space-y-5">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="font-semibold text-emerald-900">
                  {order.status === "PAID" ? "Paid. Thank you!" : "Order received. Thank you!"}
                </p>
                <p className="mt-1 text-sm text-emerald-900/80">
                  {order.status === "PAID"
                    ? `M-Pesa confirmed ${ksh(order.totalAmount)}${order.mpesaReceiptNumber && !order.mpesaReceiptNumber.startsWith("STK-") ? ` (receipt ${order.mpesaReceiptNumber})` : ""}. We'll call you to arrange delivery.`
                    : `You'll pay ${ksh(order.totalAmount)} with M-Pesa on delivery. We'll call you to confirm.`}
                </p>
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Order number</dt>
                  <dd className="font-semibold text-slate-950">{order.orderNumber}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Deliver to</dt>
                  <dd className="text-right text-slate-900">
                    {order.deliveryAddress}, {order.county}
                  </dd>
                </div>
              </dl>
              <p className="text-sm text-slate-600">
                Keep your order number. You can check on it any time on the{" "}
                <Link href="/track" className="font-medium text-brand-600 hover:underline">
                  order tracking page
                </Link>{" "}
                with the phone number you used.
              </p>
            </div>
          )}
        </div>

        {(step === "cart" || step === "details") && items.length > 0 && (
          <footer className="space-y-3 border-t border-slate-200 px-5 py-4">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between text-slate-600">
                <dt>Items</dt>
                <dd className="tabular-nums">{ksh(subtotal)}</dd>
              </div>
              <div className="flex justify-between text-slate-600">
                <dt>Delivery ({county.toLowerCase().includes("nairobi") ? "Nairobi, same day" : "rest of Kenya"})</dt>
                <dd className="tabular-nums">{ksh(shipping)}</dd>
              </div>
              <div className="flex justify-between pt-1 text-base font-semibold text-slate-950">
                <dt>Total</dt>
                <dd className="tabular-nums">{ksh(subtotal + shipping)}</dd>
              </div>
            </dl>
            {step === "cart" ? (
              <button type="button" onClick={() => setStep("details")} className="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700">
                Checkout
              </button>
            ) : (
              <div className="flex gap-2">
                <button type="button" onClick={() => setStep("cart")} className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Back
                </button>
                <button type="submit" form="checkout" disabled={busy} className="flex-1 rounded-lg bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
                  {busy ? "Placing order…" : method === "MPESA" ? `Pay ${ksh(subtotal + shipping)} with M-Pesa` : "Place order"}
                </button>
              </div>
            )}
          </footer>
        )}
      </aside>
    </div>
  );
}
