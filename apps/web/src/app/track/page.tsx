"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { trackOrder, HardwareOrder, getStoreAccount } from "@/lib/hardware-store";
import { IconWhatsApp, IconArrowRight, IconPackage, IconCheck, IconShield, IconUser } from "@/components/icons";

function TrackContent() {
  const searchParams = useSearchParams();
  const initialOrderId = searchParams.get("orderId") || searchParams.get("q") || "";

  const [query, setQuery] = useState(initialOrderId);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<HardwareOrder | null>(null);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [recentOrders, setRecentOrders] = useState<HardwareOrder[]>([]);

  useEffect(() => {
    // Load local recent orders if any
    try {
      const raw = localStorage.getItem("mkg_store_orders");
      if (raw) {
        setRecentOrders(JSON.parse(raw).slice(0, 3));
      }
    } catch {
      // ignore
    }

    if (initialOrderId) {
      handleSearch(initialOrderId);
    }
  }, [initialOrderId]);

  const handleSearch = async (targetQuery?: string) => {
    const q = (targetQuery || query).trim();
    if (!q) {
      setError("Please enter an Order ID (e.g. ORD-123456) or M-Pesa Receipt code.");
      return;
    }

    setLoading(true);
    setError("");
    setSearched(true);

    try {
      const res = await trackOrder(q, phone.trim() || undefined);
      if (res) {
        setOrder(res);
      } else {
        setOrder(null);
        setError("No order found matching this tracking code. Please verify the code or contact support on WhatsApp.");
      }
    } catch {
      setOrder(null);
      setError("Unable to retrieve order details right now. Please try again or chat with our team.");
    } finally {
      setLoading(false);
    }
  };

  const getStepIndex = (status: HardwareOrder["status"]) => {
    switch (status) {
      case "PENDING":
        return 0;
      case "PAID":
        return 1;
      case "PROCESSING":
        return 2;
      case "DISPATCHED":
        return 3;
      case "DELIVERED":
        return 4;
      default:
        return 1;
    }
  };

  const currentStep = order ? getStepIndex(order.status) : 0;
  const storeAccount = order?.account || getStoreAccount();

  return (
    <div className="min-h-screen bg-[#060A12] text-slate-100 font-sans selection:bg-amber-400 selection:text-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#060A12]/90 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="h-9 w-9 rounded-xl overflow-hidden border border-amber-500/40 group-hover:scale-105 transition-transform">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.jpg" alt="MashupHost Logo" className="h-full w-full object-cover" />
            </div>
            <div>
              <span className="text-lg font-black tracking-tight text-white group-hover:text-amber-400 transition-colors">
                MASHUP<span className="text-amber-400">HOST</span>
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/app"
              className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-amber-400/50 text-xs font-bold text-slate-200 hover:text-white transition-all flex items-center gap-1.5"
            >
              <IconUser size={14} />
              <span>Customer Portal</span>
            </Link>
            <a
              href="https://wa.me/254703605266?text=Hello%20MashupHost%2C%20I%20need%20help%20tracking%20my%20order"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 border border-[#25D366]/40 text-emerald-300 text-xs font-bold transition-all"
            >
              <IconWhatsApp size={14} className="text-[#25D366]" />
              <span>NOC WhatsApp</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Track Section */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold uppercase">
            <span>Nationwide Order Tracking</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            Track Your Hardware &amp; Fiber Order
          </h1>
          <p className="text-sm sm:text-base text-slate-300 max-w-xl mx-auto">
            Enter your Order ID (e.g. <span className="text-cyan-300 font-mono font-bold">ORD-123456</span>) or M-Pesa Transaction code to check real-time courier dispatch status.
          </p>
        </div>

        {/* Search Input Box */}
        <div className="p-6 rounded-3xl bg-slate-950/90 border border-slate-800 shadow-2xl space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-7">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Order ID or M-Pesa Receipt Code *
                </label>
                <input
                  type="text"
                  placeholder="e.g. ORD-849201 or QHK7294810"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-sm focus:border-cyan-400 focus:outline-none uppercase"
                />
              </div>

              <div className="sm:col-span-5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Phone Number (Optional Verification)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 0712345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-sm focus:border-cyan-400 focus:outline-none"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-cyan-500/20 active:scale-95 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                  <span>Checking Nationwide Tracking...</span>
                </>
              ) : (
                <>
                  <span>Track My Parcel</span>
                  <IconArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Recent Orders in this browser */}
          {recentOrders.length > 0 && !order && (
            <div className="pt-4 border-t border-slate-800/80 space-y-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                Recent Orders In This Browser:
              </span>
              <div className="flex flex-wrap gap-2">
                {recentOrders.map((rec) => (
                  <button
                    key={rec.id}
                    type="button"
                    onClick={() => {
                      setQuery(rec.id);
                      handleSearch(rec.id);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 text-xs font-mono font-bold flex items-center gap-2 transition-colors"
                  >
                    <span>{rec.id}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                      KES {rec.totalAmount.toLocaleString()}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Order Status Display */}
        {order && (
          <div className="space-y-6 animate-fade-in-up">
            {/* Visual Stepper Card */}
            <div className="p-6 sm:p-8 rounded-3xl bg-slate-950/90 border border-cyan-500/30 shadow-2xl space-y-8">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl sm:text-2xl font-black text-white font-mono">{order.id}</span>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold font-mono">
                      {order.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Placed on {new Date(order.createdAt).toLocaleDateString("en-KE", { dateStyle: "medium" })} &bull; Paid via M-Pesa ({order.mpesaReceiptNumber})
                  </p>
                </div>

                <a
                  href={`https://wa.me/254703605266?text=Hello%20MashupHost%2C%20I%20am%20inquiring%20about%20my%20delivery%20for%20order%20${encodeURIComponent(
                    order.id
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 border border-[#25D366]/40 text-emerald-300 font-bold text-xs flex items-center gap-2 transition-colors"
                >
                  <IconWhatsApp size={16} className="text-[#25D366]" />
                  <span>Chat With Dispatch</span>
                </a>
              </div>

              {/* Progress Stepper */}
              <div className="grid grid-cols-4 gap-2 sm:gap-4 text-center">
                {/* Step 1 */}
                <div className="space-y-2">
                  <div className={`h-2 rounded-full ${currentStep >= 1 ? "bg-emerald-400" : "bg-slate-800"}`} />
                  <span className="text-[11px] sm:text-xs font-bold block text-white">1. M-Pesa Paid</span>
                  <span className="text-[10px] text-slate-400 hidden sm:block">Verified Instantly</span>
                </div>

                {/* Step 2 */}
                <div className="space-y-2">
                  <div className={`h-2 rounded-full ${currentStep >= 2 ? "bg-emerald-400" : "bg-slate-800"}`} />
                  <span className="text-[11px] sm:text-xs font-bold block text-white">2. Processing</span>
                  <span className="text-[10px] text-slate-400 hidden sm:block">Nairobi Hub Prep</span>
                </div>

                {/* Step 3 */}
                <div className="space-y-2">
                  <div className={`h-2 rounded-full ${currentStep >= 3 ? "bg-emerald-400" : "bg-slate-800"}`} />
                  <span className="text-[11px] sm:text-xs font-bold block text-white">3. Dispatched</span>
                  <span className="text-[10px] text-slate-400 hidden sm:block">With Courier / Rider</span>
                </div>

                {/* Step 4 */}
                <div className="space-y-2">
                  <div className={`h-2 rounded-full ${currentStep >= 4 ? "bg-emerald-400" : "bg-slate-800"}`} />
                  <span className="text-[11px] sm:text-xs font-bold block text-white">4. Delivered</span>
                  <span className="text-[10px] text-slate-400 hidden sm:block">Destination Reached</span>
                </div>
              </div>

              {/* Auto-Created Store Account Banner */}
              {storeAccount && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-slate-900 to-emerald-500/10 border border-amber-500/40 text-left flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 font-black text-[10px] uppercase">
                        Linked Store Account
                      </span>
                      <span className="text-xs font-mono font-bold text-white">{storeAccount.accountNumber}</span>
                    </div>
                    <p className="text-xs text-slate-300">
                      Your store account was created automatically with your phone number ({order.phone}).
                    </p>
                  </div>

                  <Link
                    href="/app"
                    className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs uppercase tracking-wide transition-all shadow-md flex items-center gap-1.5 shrink-0"
                  >
                    <span>Open Customer Portal</span>
                    <IconArrowRight size={14} />
                  </Link>
                </div>
              )}

              {/* Order Items & Shipping Address Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Items List */}
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                  <h4 className="font-bold uppercase tracking-wider text-slate-400 font-mono">
                    Items In This Parcel ({order.items.length})
                  </h4>
                  <div className="space-y-2">
                    {order.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between items-center py-1 border-b border-slate-800/60 last:border-0">
                        <span className="text-white font-medium">
                          {it.quantity}x {it.name}
                        </span>
                        <span className="text-cyan-300 font-mono font-bold">
                          KES {(it.price * it.quantity).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="pt-2 border-t border-slate-800 flex justify-between font-bold text-sm">
                    <span className="text-slate-300">Total Paid (incl. shipping):</span>
                    <span className="text-emerald-400 font-mono">KES {order.totalAmount.toLocaleString()}</span>
                  </div>
                </div>

                {/* Delivery Destination */}
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                  <h4 className="font-bold uppercase tracking-wider text-slate-400 font-mono">
                    Delivery Destination &amp; Recipient
                  </h4>
                  <div className="space-y-1.5">
                    <p className="text-white font-bold text-sm">{order.customerName}</p>
                    <p className="text-slate-300 font-mono">{order.phone}</p>
                    <p className="text-slate-300">
                      {order.county} &bull; {order.deliveryAddress}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 space-y-1">
                    <span className="text-cyan-400 font-bold block">Delivery Dispatch:</span>
                    <span>Nairobi &amp; Kiambu deliveries completed within 24 hours. Nationwide parcels dispatched via Wells Fargo Express.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#060A12] text-white p-10 text-center">Loading tracker...</div>}>
      <TrackContent />
    </Suspense>
  );
}
