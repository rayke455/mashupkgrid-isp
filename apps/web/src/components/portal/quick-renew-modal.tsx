"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { IconCheck, IconClose, IconMpesa, IconWhatsApp } from "@/components/icons";

interface QuickRenewModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
}

interface SubscriberDetails {
  accountNumber: string;
  customerName: string;
  phone: string;
  estate: string;
  currentPlanId: string;
  currentPlanName: string;
  speed: string;
  monthlyPrice: number;
  status: "ACTIVE" | "DUE" | "EXPIRED";
  daysRemaining: number;
  expiryDate: string;
}

const RENEWAL_PLANS = [
  { id: "home_bronze", name: "Home Bronze", speed: "10 Mbps", price: 1500 },
  { id: "home_silver", name: "Home Silver", speed: "20 Mbps", price: 2500, popular: true },
  { id: "home_gold", name: "Home Gold", speed: "40 Mbps", price: 3500 },
  { id: "home_platinum", name: "Home Platinum", speed: "80 Mbps", price: 5500 },
  { id: "biz_sme", name: "Business SME (1:1 Dedicated)", speed: "50 Mbps", price: 7500 },
  { id: "biz_ultra", name: "Ultra Gigabit", speed: "1 Gbps", price: 15000 },
];

const DEMO_ACCOUNTS: Record<string, SubscriberDetails> = {
  "ACC-88921": {
    accountNumber: "ACC-88921",
    customerName: "Macharia K.",
    phone: "0724165988",
    estate: "Kilimani Heights, Apt 402, Nairobi",
    currentPlanId: "home_silver",
    currentPlanName: "Home Silver (20 Mbps)",
    speed: "20 Mbps",
    monthlyPrice: 2500,
    status: "DUE",
    daysRemaining: 2,
    expiryDate: "16 Sept 2026",
  },
  "ACC-49120": {
    accountNumber: "ACC-49120",
    customerName: "Wanjiku M.",
    phone: "0712345678",
    estate: "Utawala Estate, Court 4, Nairobi",
    currentPlanId: "home_bronze",
    currentPlanName: "Home Bronze (10 Mbps)",
    speed: "10 Mbps",
    monthlyPrice: 1500,
    status: "ACTIVE",
    daysRemaining: 18,
    expiryDate: "2 Oct 2026",
  },
  "0724165988": {
    accountNumber: "ACC-88921",
    customerName: "Macharia K.",
    phone: "0724165988",
    estate: "Kilimani Heights, Apt 402, Nairobi",
    currentPlanId: "home_silver",
    currentPlanName: "Home Silver (20 Mbps)",
    speed: "20 Mbps",
    monthlyPrice: 2500,
    status: "DUE",
    daysRemaining: 2,
    expiryDate: "16 Sept 2026",
  },
};

export function QuickRenewModal({ isOpen, onClose, initialQuery = "" }: QuickRenewModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [subscriber, setSubscriber] = useState<SubscriberDetails | null>(null);

  // Selected renewal tier
  const [selectedPlanId, setSelectedPlanId] = useState("home_silver");
  const [paymentPhone, setPaymentPhone] = useState("");

  // Payment State
  const [isPrompting, setIsPrompting] = useState(false);
  const [countdown, setCountdown] = useState(45);
  const [completedPayment, setCompletedPayment] = useState<{
    receiptNumber: string;
    accountNumber: string;
    customerName: string;
    planName: string;
    amount: number;
    newExpiryDate: string;
  } | null>(null);

  // Pre-load locally saved customer account if present
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("mkg_store_customer_account");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.accountNumber && !query) {
            setQuery(parsed.accountNumber);
          }
        }
      } catch {
        // ignore
      }
    }
  }, [query]);

  if (!isOpen) return null;

  const handleLookup = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = query.trim().toUpperCase().replace(/\s+/g, "");
    if (!q) {
      setSearchError("Please enter your Account Number (e.g. ACC-88921) or Safaricom Phone Number.");
      return;
    }

    setSearchError("");
    setIsSearching(true);

    setTimeout(() => {
      setIsSearching(false);
      // 1. Check demo accounts
      const match = DEMO_ACCOUNTS[q] || DEMO_ACCOUNTS[query.trim()];
      if (match) {
        setSubscriber(match);
        setSelectedPlanId(match.currentPlanId);
        setPaymentPhone(match.phone);
        return;
      }

      // 2. Check local storage accounts
      if (typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem("mkg_store_customer_account");
          if (raw) {
            const acc = JSON.parse(raw);
            if (
              acc.accountNumber?.toUpperCase() === q ||
              acc.phone?.replace(/\s+/g, "") === query.trim().replace(/\s+/g, "")
            ) {
              const localSub: SubscriberDetails = {
                accountNumber: acc.accountNumber,
                customerName: acc.customerName || "Valued Subscriber",
                phone: acc.phone,
                estate: "Registered Installation Address",
                currentPlanId: "home_silver",
                currentPlanName: "Home Silver (20 Mbps)",
                speed: "20 Mbps",
                monthlyPrice: 2500,
                status: "ACTIVE",
                daysRemaining: 24,
                expiryDate: "8 Oct 2026",
              };
              setSubscriber(localSub);
              setSelectedPlanId(localSub.currentPlanId);
              setPaymentPhone(localSub.phone);
              return;
            }
          }
        } catch {
          // ignore
        }
      }

      // 3. Fallback dynamically generated subscriber for any entered account number or phone
      const fallbackSub: SubscriberDetails = {
        accountNumber: q.startsWith("ACC-") ? q : `ACC-${Math.floor(10000 + Math.random() * 90000)}`,
        customerName: "Subscriber (" + (q.startsWith("ACC-") ? q : "Customer") + ")",
        phone: q.startsWith("07") || q.startsWith("01") || q.startsWith("254") ? query.trim() : "0724 165 988",
        estate: "Fiber Connected Premises, Kenya",
        currentPlanId: "home_silver",
        currentPlanName: "Home Silver (20 Mbps)",
        speed: "20 Mbps",
        monthlyPrice: 2500,
        status: "DUE",
        daysRemaining: 1,
        expiryDate: "15 Sept 2026",
      };
      setSubscriber(fallbackSub);
      setSelectedPlanId("home_silver");
      setPaymentPhone(fallbackSub.phone);
    }, 450);
  };

  const currentSelectedPlan = RENEWAL_PLANS.find((p) => p.id === selectedPlanId) || RENEWAL_PLANS[1]!;

  const handlePayRenewal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentPhone.trim()) {
      setSearchError("Please enter your M-Pesa Safaricom phone number.");
      return;
    }

    setIsPrompting(true);
    setCountdown(45);

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Simulate STK Push authorization
    setTimeout(() => {
      clearInterval(timer);
      setIsPrompting(false);

      const receipt = `QHK${Math.floor(1000000 + Math.random() * 9000000)}`;
      setCompletedPayment({
        receiptNumber: receipt,
        accountNumber: subscriber?.accountNumber || "ACC-88921",
        customerName: subscriber?.customerName || "Subscriber",
        planName: `${currentSelectedPlan.name} (${currentSelectedPlan.speed})`,
        amount: currentSelectedPlan.price,
        newExpiryDate: "14 Oct 2026",
      });
    }, 2800);
  };

  const handleReset = () => {
    setSubscriber(null);
    setCompletedPayment(null);
    setIsPrompting(false);
    setQuery("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80">
      <div className="relative w-full max-w-xl bg-gradient-to-b from-slate-900 to-slate-950 border border-emerald-500/30 rounded-xl shadow-lg overflow-hidden text-slate-100 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800/80 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <IconMpesa size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">Lipa Internet &bull; Quick Renew</h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold uppercase">
                  10s M-Pesa
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Renew your monthly fiber connection instantly without logging in.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <IconClose size={16} />
          </button>
        </div>
        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
          {/* STEP 1: PAYMENT SUCCESS SCREEN */}
          {completedPayment ? (
            <div className="space-y-6 text-center animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 text-emerald-400 text-3xl flex items-center justify-center mx-auto">
                <IconCheck size={32} />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-xl font-bold text-white">Internet Reconnected &amp; Renewed!</h3>
                <p className="text-xs text-emerald-400 font-mono font-bold">
                  M-Pesa Receipt: {completedPayment.receiptNumber}
                </p>
                <p className="text-xs text-slate-400">
                  Your MikroTik router has been updated automatically via RADIUS.
                </p>
              </div>
              {/* Receipt Summary Card */}
              <div className="p-4 rounded-2xl bg-slate-950/90 border border-emerald-500/30 text-left space-y-2.5 font-mono text-xs shadow-xl">
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">Account Number:</span>
                  <span className="text-amber-400 font-bold">{completedPayment.accountNumber}</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">Subscriber Name:</span>
                  <span className="text-white">{completedPayment.customerName}</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">Package Renewed:</span>
                  <span className="text-cyan-300 font-bold">{completedPayment.planName}</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">Amount Paid:</span>
                  <span className="text-emerald-400 font-bold text-sm">
                    KES {completedPayment.amount.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-300 pt-2 border-t border-slate-800">
                  <span className="text-slate-400">New Expiration Date:</span>
                  <span className="text-emerald-300 font-bold">{completedPayment.newExpiryDate} (+30 Days)</span>
                </div>
              </div>
              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      if (typeof window !== "undefined") window.print();
                    }}
                    className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>Print Tax Receipt</span>
                  </button>
                  <a
                    href={`https://wa.me/254703605266?text=Hello%20MashupHost%2C%20I%20just%20renewed%20account%20${encodeURIComponent(
                      completedPayment.accountNumber
                    )}%20(Receipt%20${completedPayment.receiptNumber}%20-%20KES%20${completedPayment.amount})`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2.5 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 border border-[#25D366]/40 text-emerald-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <IconWhatsApp size={14} className="text-[#25D366]" />
                    <span>Send to WhatsApp</span>
                  </a>
                </div>
                <Link
                  href="/app"
                  onClick={onClose}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-bold text-xs uppercase tracking-wide transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <span>Open Subscriber Dashboard</span>
                </Link>
                <button
                  onClick={handleReset}
                  className="w-full py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
                >
                  Renew Another Account
                </button>
              </div>
            </div>
          ) : isPrompting ? (
            /* STEP 2: STK PUSH PROMPT IN PROGRESS */
            <div className="py-10 text-center space-y-6">
              <div className="w-20 h-20 mx-auto rounded-full bg-emerald-500/10 border-2 border-emerald-500/40 flex items-center justify-center relative">
                <span className="absolute inset-0 rounded-full border-2 border-emerald-400 opacity-25" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-white">Safaricom STK Push Sent!</h3>
                <p className="text-xs text-slate-300 max-w-sm mx-auto leading-relaxed">
                  A payment prompt of{" "}
                  <strong className="text-emerald-400 font-mono">KES {currentSelectedPlan.price.toLocaleString()}</strong>{" "}
                  has been sent to your phone <strong className="text-cyan-300 font-mono">{paymentPhone}</strong>.
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-left space-y-2 max-w-sm mx-auto text-xs text-slate-300">
                <p className="font-bold text-amber-300">Quick Instructions:</p>
                <ol className="list-decimal list-inside space-y-1 text-slate-400">
                  <li>Unlock your Safaricom phone.</li>
                  <li>Verify payee is <strong>MashupHost ISP</strong>.</li>
                  <li>Enter your 4-digit <strong>M-Pesa PIN</strong> and press OK.</li>
                </ol>
              </div>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-950 border border-slate-800 font-mono text-xs text-slate-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Waiting for M-Pesa authorization... ({countdown}s)</span>
              </div>
            </div>
          ) : subscriber ? (
            /* STEP 3: SUBSCRIBER CONFIRMED -> SELECT TIER & PAY */
            <div className="space-y-5">
              {/* Subscriber Summary Banner */}
              <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{subscriber.customerName}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        subscriber.status === "ACTIVE"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                      }`}
                    >
                      {subscriber.status === "ACTIVE" ? `Active (${subscriber.daysRemaining}d left)` : "Payment Due"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono">
                    Account: <strong className="text-amber-400">{subscriber.accountNumber}</strong> &bull; {subscriber.estate}
                  </p>
                  <p className="text-xs text-slate-400">
                    Current Plan: <span className="text-cyan-300 font-bold">{subscriber.currentPlanName}</span> (Expires: {subscriber.expiryDate})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSubscriber(null)}
                  className="text-xs text-cyan-400 hover:text-cyan-300 underline shrink-0 font-medium"
                >
                  Change Account
                </button>
              </div>
              {/* Renewal Form */}
              <form onSubmit={handlePayRenewal} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                    Select Renewal Package &amp; Speed
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {RENEWAL_PLANS.map((plan) => (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setSelectedPlanId(plan.id)}
                        className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                          selectedPlanId === plan.id
                            ? "bg-amber-500/10 border-amber-400 text-white shadow-md shadow-amber-500/10 ring-1 ring-amber-400"
                            : "bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-xs font-bold text-white">{plan.name}</span>
                          <span className="text-[11px] font-mono font-bold text-amber-400">{plan.speed}</span>
                        </div>
                        <div className="flex items-baseline justify-between w-full mt-2 pt-2 border-t border-slate-800/80">
                          <span className="text-xs font-mono font-bold text-slate-200">
                            KES {plan.price.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-slate-400">30 Days</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                {/* M-Pesa Phone Input */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wider">
                    M-Pesa Safaricom Phone Number
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      required
                      placeholder="0712 345 678"
                      value={paymentPhone}
                      onChange={(e) => setPaymentPhone(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 pl-10"
                    />
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-emerald-400">
                      <IconMpesa size={16} />
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    An automated STK push prompt will be sent to this phone.
                  </p>
                </div>
                {/* Total and Submit Button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold text-xs sm:text-sm uppercase tracking-wider transition-all shadow-xl shadow-emerald-500/20 active:scale-95 flex items-center justify-center gap-2"
                  >
                    <IconMpesa size={18} />
                    <span>Lipa KES {currentSelectedPlan.price.toLocaleString()} na M-Pesa</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* STEP 4: INITIAL LOOKUP INPUT */
            <div className="space-y-5">
              <div className="space-y-2 text-center max-w-md mx-auto">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Enter your assigned <strong className="text-amber-400 font-mono">Account Number</strong> (e.g.{" "}
                  <code className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono">ACC-88921</code>) or your registered M-Pesa phone number to pull up your subscription.
                </p>
              </div>
              {searchError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs text-center">
                  {searchError}
                </div>
              )}

              <form onSubmit={handleLookup} className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Enter Account No (e.g. ACC-88921) or Phone"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="flex-1 px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                  />
                  <button
                    type="submit"
                    disabled={isSearching}
                    className="px-5 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all shadow-md active:scale-95 disabled:opacity-50 shrink-0 flex items-center gap-1.5"
                  >
                    {isSearching ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                        <span>Searching...</span>
                      </>
                    ) : (
                      <span>Find Account &rarr;</span>
                    )}
                  </button>
                </div>
              </form>
              {/* Sample Quick-Fill Chips for Instant Testing */}
              <div className="pt-2 border-t border-slate-800/80 space-y-2">
                <span className="text-[11px] text-slate-400 font-medium block">
                  Quick Demo Accounts (Click to test):
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("ACC-88921");
                      setSearchError("");
                      setSubscriber(DEMO_ACCOUNTS["ACC-88921"]!);
                      setSelectedPlanId("home_silver");
                      setPaymentPhone("0724165988");
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-amber-300 transition-colors"
                  >
                    ACC-88921 (Macharia &bull; 20 Mbps)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("ACC-49120");
                      setSearchError("");
                      setSubscriber(DEMO_ACCOUNTS["ACC-49120"]!);
                      setSelectedPlanId("home_bronze");
                      setPaymentPhone("0712345678");
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-cyan-300 transition-colors"
                  >
                    ACC-49120 (Wanjiku &bull; 10 Mbps)
                  </button>
                </div>
              </div>
              {/* Security & Authenticity Guarantees */}
              <div className="grid grid-cols-2 gap-3 pt-3 text-[11px] text-slate-400 border-t border-slate-800/80">
                <div className="flex items-center gap-2">
                  <span>Instant M-Pesa STK Push</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>Automated RADIUS Unlocking</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>Zero Login Required</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>Instant SMS Tax Receipt</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
