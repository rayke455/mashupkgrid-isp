"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useCart, KENYA_COUNTIES, submitHardwareOrder, HardwareOrder } from "@/lib/hardware-store";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const { items, removeItem, updateQuantity, clearCart, subtotal, itemCount } = useCart();
  const [county, setCounty] = useState("Nairobi");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<HardwareOrder | null>(null);
  const [stkStatus, setStkStatus] = useState<"idle" | "prompting" | "success">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [countdown, setCountdown] = useState(45);
  const [copiedPin, setCopiedPin] = useState(false);

  useEffect(() => {
    if (isOpen && items.length > 0 && completedOrder) {
      setCompletedOrder(null);
      setStkStatus("idle");
    }
  }, [isOpen, items.length, completedOrder]);

  if (!isOpen) return null;

  const hasPhysicalHardware = items.some(
    (i) => i.product.category !== "fiber" && !i.product.id.startsWith("plan_")
  );
  const shippingFee =
    items.length === 0 || !hasPhysicalHardware
      ? 0
      : county.toLowerCase().includes("nairobi")
      ? 350
      : 600;
  const grandTotal = subtotal + shippingFee;

  const normalizePhone = (p: string): string => {
    let clean = p.replace(/\s+/g, "").replace(/-/g, "");
    if (clean.startsWith("+")) clean = clean.substring(1);
    if (clean.startsWith("0")) clean = "254" + clean.substring(1);
    return clean;
  };

  const isPhoneValid = (p: string): boolean => {
    const norm = normalizePhone(p);
    return /^254[71]\d{8}$/.test(norm);
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !phone.trim() || !deliveryAddress.trim()) {
      setErrorMessage("Please fill in your name, phone number, and delivery address.");
      return;
    }

    if (!isPhoneValid(phone)) {
      setErrorMessage("Please enter a valid Kenyan Safaricom phone number (e.g. 0712345678 or 0112345678).");
      return;
    }

    if (items.length === 0) {
      setErrorMessage("Your cart is empty.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    setStkStatus("prompting");
    setCountdown(45);

    // Start countdown timer
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    try {
      // Simulate STK Push to phone
      await new Promise((res) => setTimeout(res, 2600));
      clearInterval(timer);

      const receipt = `QHK${Math.floor(1000000 + Math.random() * 9000000)}`;
      const order = await submitHardwareOrder({
        customerName: customerName.trim(),
        phone: normalizePhone(phone.trim()),
        county,
        deliveryAddress: deliveryAddress.trim(),
        items: items.map((i) => ({
          productId: i.product.id,
          quantity: i.quantity,
          name: i.product.name,
          price: i.product.price,
        })),
        mpesaReceiptNumber: receipt,
      });

      setStkStatus("success");
      setCompletedOrder(order);
      clearCart();
    } catch (err: unknown) {
      clearInterval(timer);
      const msg = err instanceof Error ? err.message : "Payment processing failed";
      setErrorMessage(msg);
      setStkStatus("idle");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintReceipt = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const handleReset = () => {
    setCompletedOrder(null);
    setStkStatus("idle");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-lg bg-[#090D16] border-l border-cyan-500/20 text-slate-100 flex flex-col h-full shadow-2xl overflow-hidden">
        {/* Drawer Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <span className="text-xl">🛒</span>
            <div>
              <h2 className="font-bold text-white text-base">Your Cart &amp; Checkout</h2>
              <p className="text-xs text-slate-400">
                {items.length === 0 ? "No items selected" : `${itemCount} item${itemCount > 1 ? "s" : ""} selected`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 hover:border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {stkStatus === "prompting" ? (
            <div className="py-12 px-6 text-center space-y-6 animate-in fade-in">
              <div className="w-20 h-20 mx-auto rounded-full bg-emerald-500/10 border-2 border-emerald-500/40 flex items-center justify-center relative">
                <span className="text-3xl animate-bounce">📱</span>
                <span className="absolute inset-0 rounded-full border-2 border-emerald-400 animate-ping opacity-25" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-black text-white">M-Pesa STK Push Sent!</h3>
                <p className="text-xs text-slate-300 max-w-xs mx-auto leading-relaxed">
                  Check your phone <span className="font-mono text-emerald-400 font-bold">{phone}</span> and enter your M-Pesa PIN to authorize payment.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 border border-slate-800 font-mono text-xs text-slate-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Awaiting response... ({countdown}s)</span>
              </div>
            </div>
          ) : completedOrder ? (
            <div className="space-y-5 animate-in zoom-in-95 duration-200">
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center text-xl font-black">
                  ✓
                </div>
                <h3 className="font-black text-white text-base">Payment Received &amp; Verified!</h3>
                <p className="text-xs text-emerald-300 font-mono">
                  M-Pesa Receipt: {completedOrder.mpesaReceiptNumber}
                </p>
                <p className="text-[11px] text-slate-400">
                  Order ID: <span className="font-mono text-white font-bold">{completedOrder.id}</span>
                </p>
              </div>

              {/* AUTOMATIC STORE ACCOUNT CREATED NOTICE */}
              {completedOrder.account && (
                <div className="p-4 rounded-2xl bg-gradient-to-b from-amber-500/15 to-yellow-500/5 border-2 border-amber-500/40 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🎉</span>
                    <div>
                      <h4 className="text-xs font-black text-amber-300 uppercase tracking-wide">
                        Your Customer Account is Created!
                      </h4>
                      <p className="text-[11px] text-slate-300">
                        Use these credentials to track orders, download invoices, and manage subscriptions.
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-950/80 rounded-xl p-3 border border-amber-500/30 space-y-2 font-mono text-xs">
                    <div className="flex justify-between items-center text-slate-300">
                      <span className="text-slate-400">Account No:</span>
                      <span className="text-amber-400 font-bold">{completedOrder.account.accountNumber}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-300">
                      <span className="text-slate-400">Phone (Login):</span>
                      <span className="text-white font-bold">{completedOrder.account.phone}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-300 pt-1 border-t border-slate-800">
                      <div>
                        <span className="text-slate-400">Your Login PIN:</span>
                        <span className="ml-2 px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-black tracking-widest text-sm">
                          {completedOrder.account.tempPin}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (navigator.clipboard) {
                            navigator.clipboard.writeText(completedOrder.account!.tempPin);
                            setCopiedPin(true);
                            setTimeout(() => setCopiedPin(false), 2500);
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-sans font-bold transition-all border border-slate-700"
                      >
                        {copiedPin ? "✓ Copied" : "Copy PIN"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <p className="text-xs text-slate-400">
                You will receive an SMS dispatch alert with rider contact once parcel leaves our Nairobi hub.
              </p>

              <div className="flex flex-col gap-2 pt-1">
                {/* 1-Click Go to My Account */}
                <Link
                  href="/app"
                  onClick={() => onClose()}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs uppercase tracking-wide transition-all shadow-lg flex items-center justify-center gap-2"
                >
                  <span>🚀 Open My Store Dashboard</span>
                </Link>

                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href={`/track?orderId=${encodeURIComponent(completedOrder.id)}`}
                    onClick={() => onClose()}
                    className="py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>📍 Track Order</span>
                  </Link>

                  <a
                    href={`https://wa.me/254703605266?text=Hello%20MashupHost%2C%20I%20want%20to%20track%20my%20order%20${encodeURIComponent(
                      completedOrder.id
                    )}%20(M-Pesa%20${encodeURIComponent(completedOrder.mpesaReceiptNumber || "")})`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2.5 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 border border-[#25D366]/40 text-emerald-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>Track on WhatsApp</span>
                  </a>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={handlePrintReceipt}
                    className="py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-medium text-xs transition-colors flex items-center justify-center gap-1"
                  >
                    <span>🖨️</span> Print Receipt
                  </button>
                  <button
                    onClick={handleReset}
                    className="py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white font-medium text-xs transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <div className="text-4xl">📦</div>
              <p className="text-slate-300 font-medium">Your cart is currently empty</p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Explore MikroTik routers, switches, fiber cables, and solar backup systems in our store.
              </p>
            </div>
          ) : (
            <>
              {/* Item List */}
              <div className="space-y-3">
                {items.map(({ product, quantity }) => (
                  <div
                    key={product.id}
                    className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex gap-3.5 items-center"
                  >
                    <div className="w-16 h-16 rounded-lg bg-slate-800 overflow-hidden shrink-0 border border-slate-700">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{product.name}</p>
                      <p className="text-[11px] text-cyan-400 font-medium">{product.brand}</p>
                      <p className="text-xs font-bold text-slate-200 mt-1">
                        KES {product.price.toLocaleString()}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-700 rounded-lg p-0.5 text-xs">
                        <button
                          onClick={() => updateQuantity(product.id, quantity - 1)}
                          className="w-5 h-5 flex items-center justify-center hover:bg-slate-800 rounded text-slate-300"
                        >
                          -
                        </button>
                        <span className="w-4 text-center font-bold text-white">{quantity}</span>
                        <button
                          onClick={() => updateQuantity(product.id, quantity + 1)}
                          className="w-5 h-5 flex items-center justify-center hover:bg-slate-800 rounded text-slate-300"
                        >
                          +
                        </button>
                      </div>
                      <button
                        onClick={() => removeItem(product.id)}
                        className="text-[11px] text-rose-400 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Checkout Form */}
              <form onSubmit={handleCheckout} className="space-y-4 pt-4 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Customer Delivery &amp; Account Details
                  </h3>
                  <span className="text-[10px] text-emerald-400 font-mono font-bold">
                    ⚡ Auto-Account Creation
                  </span>
                </div>

                {errorMessage && (
                  <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                    {errorMessage}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. John Kamau"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      M-Pesa Safaricom Phone
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="0712 345 678"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">County</label>
                    <select
                      value={county}
                      onChange={(e) => setCounty(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500"
                    >
                      {KENYA_COUNTIES.map((c) => (
                        <option key={c} value={c} className="bg-slate-900">
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Exact Location / House</label>
                    <input
                      type="text"
                      required
                      placeholder="Estate, building, house / road"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                {/* Price Breakdown */}
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>{hasPhysicalHardware ? "Hardware Subtotal" : "Fiber Subscription Subtotal"}</span>
                    <span className="text-white font-medium">KES {subtotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>{hasPhysicalHardware ? `Courier Shipping (${county})` : "Setup & Router Dispatch"}</span>
                    <span className="text-emerald-400 font-medium">
                      {shippingFee === 0 ? "FREE (Included)" : `KES ${shippingFee.toLocaleString()}`}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-800 flex justify-between font-bold text-sm">
                    <span className="text-white">Total Amount</span>
                    <span className="text-cyan-400">KES {grandTotal.toLocaleString()}</span>
                  </div>
                </div>

                {/* M-Pesa STK Push Trigger Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-bold transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      Initiating Safaricom STK Push...
                    </>
                  ) : (
                    <>
                      <span>📱</span>
                      Pay KES {grandTotal.toLocaleString()} with M-Pesa
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
