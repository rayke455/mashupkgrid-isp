"use client";

import { useState } from "react";
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

  if (!isOpen) return null;

  const shippingFee = county.toLowerCase().includes("nairobi") ? 350 : 600;
  const grandTotal = subtotal + shippingFee;

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !phone.trim() || !deliveryAddress.trim()) {
      setErrorMessage("Please fill in your name, phone number, and delivery address.");
      return;
    }
    if (items.length === 0) {
      setErrorMessage("Your cart is empty.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    setStkStatus("prompting");

    try {
      // Simulate STK Push to phone
      await new Promise((res) => setTimeout(res, 1800));

      const receipt = `QHK${Math.floor(1000000 + Math.random() * 9000000)}`;
      const order = await submitHardwareOrder({
        customerName: customerName.trim(),
        phone: phone.trim(),
        county,
        deliveryAddress: deliveryAddress.trim(),
        items: items.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
        mpesaReceiptNumber: receipt,
      });

      setStkStatus("success");
      setCompletedOrder(order);
      clearCart();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Payment processing failed";
      setErrorMessage(msg);
      setStkStatus("idle");
    } finally {
      setIsSubmitting(false);
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
            <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              🛒
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">Your Hardware Cart</h3>
              <p className="text-xs text-slate-400">{itemCount} items ready for Kenya dispatch</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {completedOrder ? (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-3xl flex items-center justify-center mx-auto animate-bounce">
                ✓
              </div>
              <h4 className="text-xl font-bold text-white">Order Confirmed & Paid!</h4>
              <p className="text-sm text-slate-300">
                M-Pesa payment received for Order{" "}
                <span className="text-cyan-400 font-mono font-bold">{completedOrder.id}</span>.
              </p>
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 text-left space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">M-Pesa Receipt:</span>
                  <span className="text-emerald-400 font-mono font-bold">
                    {completedOrder.mpesaReceiptNumber}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Recipient:</span>
                  <span className="text-white font-medium">{completedOrder.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Destination:</span>
                  <span className="text-white">
                    {completedOrder.county} — {completedOrder.deliveryAddress}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Paid:</span>
                  <span className="text-cyan-300 font-bold text-sm">
                    KES {completedOrder.totalAmount.toLocaleString()}
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-400">
                You will receive an SMS dispatch alert with rider contact once parcel leaves our Nairobi hub.
              </p>
              <button
                onClick={handleReset}
                className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition-colors shadow-lg shadow-cyan-500/20"
              >
                Continue Shopping
              </button>
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
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Kenya Delivery & M-Pesa Details
                </h4>

                {errorMessage && (
                  <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                    {errorMessage}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Kelvin Otieno"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">M-Pesa Phone</label>
                    <input
                      type="tel"
                      required
                      placeholder="0712345678"
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
                    <label className="block text-xs font-medium text-slate-300 mb-1">Exact Address</label>
                    <input
                      type="text"
                      required
                      placeholder="Estate, building, room"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                {/* Price Breakdown */}
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Hardware Subtotal</span>
                    <span className="text-white font-medium">KES {subtotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Shipping ({county})</span>
                    <span className="text-white font-medium">KES {shippingFee.toLocaleString()}</span>
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
                  {stkStatus === "prompting" ? (
                    <>
                      <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      Sending STK Prompt to {phone || "Phone"}...
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
