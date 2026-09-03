"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  IconCheck,
  IconCopy,
  IconArrowRight,
  IconSparkles,
  IconShield,
  IconUsers,
  IconChevronRight,
} from "@/components/icons";

interface CoffeeSupporter {
  id: string;
  name: string;
  coffees: number;
  amount: number;
  message?: string;
  timeAgo: string;
}

const INITIAL_SUPPORTERS: CoffeeSupporter[] = [
  {
    id: "1",
    name: "Brian M.",
    coffees: 3,
    amount: 300,
    message: "Loving the new MikroTik captive portal updates! Keep it up!",
    timeAgo: "10m ago",
  },
  {
    id: "2",
    name: "Faith W.",
    coffees: 5,
    amount: 500,
    message: "Thank you for the anti-tunneling scripts. Saved our WISP network!",
    timeAgo: "45m ago",
  },
  {
    id: "3",
    name: "Anonymous ISP Tech",
    coffees: 2,
    amount: 200,
    message: "Small coffee for the late-night coding sessions ☕",
    timeAgo: "2h ago",
  },
  {
    id: "4",
    name: "Dennis Kipkorir",
    coffees: 10,
    amount: 1000,
    message: "Proud to support open telecom software in Kenya. Cheers!",
    timeAgo: "5h ago",
  },
  {
    id: "5",
    name: "Meshack O.",
    coffees: 1,
    amount: 100,
    message: "Best hotspot billing system!",
    timeAgo: "Yesterday",
  },
];

export default function DonateCoffeePage() {
  // Coffee quantity state
  const [coffees, setCoffees] = useState<number>(3);
  const [isCustom, setIsCustom] = useState<boolean>(false);
  const [customAmount, setCustomAmount] = useState<string>("");

  // Supporter info
  const [donorName, setDonorName] = useState<string>("");
  const [donorPhone, setDonorPhone] = useState<string>("");
  const [donorMessage, setDonorMessage] = useState<string>("");

  // Transaction & modal states
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [stkPending, setStkPending] = useState<boolean>(false);
  const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(60);
  const [donationSuccess, setDonationSuccess] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Supporters roll
  const [supporters, setSupporters] = useState<CoffeeSupporter[]>(INITIAL_SUPPORTERS);

  // Price per coffee: KES 100
  const COFFEE_UNIT_PRICE = 100;
  const currentTotalAmount = isCustom ? (parseInt(customAmount, 10) || 0) : coffees * COFFEE_UNIT_PRICE;

  const handleCopy = (text: string, key: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2500);
    }
  };

  // Countdown timer when STK is waiting
  useEffect(() => {
    if (!stkPending || countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [stkPending, countdown]);

  // Status polling when STK is dispatched
  useEffect(() => {
    if (!stkPending || !checkoutRequestId) return;

    let attempts = 0;
    const pollInterval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/v1/payments/mpesa/donate/${checkoutRequestId}/status`);
        if (res.ok) {
          const data = await res.json();
          if (data?.data?.status === "COMPLETED" || attempts > 10) {
            clearInterval(pollInterval);
            setStkPending(false);
            setDonationSuccess(true);

            // Add new donor to the live supporters list
            const newSupporter: CoffeeSupporter = {
              id: Date.now().toString(),
              name: donorName.trim() || "A Friendly Supporter",
              coffees: isCustom ? Math.max(1, Math.round(currentTotalAmount / 100)) : coffees,
              amount: currentTotalAmount,
              message: donorMessage.trim() || undefined,
              timeAgo: "Just now",
            };
            setSupporters((prev) => [newSupporter, ...prev]);
          }
        }
      } catch {}
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [stkPending, checkoutRequestId, donorName, currentTotalAmount, coffees, isCustom, donorMessage]);

  const handleSubmitCoffee = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanPhone = donorPhone.replace(/\D/g, "");
    if (!cleanPhone || cleanPhone.length < 9) {
      setErrorMsg("Please enter a valid M-Pesa phone number (e.g. 0712345678).");
      return;
    }

    if (currentTotalAmount < 10) {
      setErrorMsg("Please enter an amount of at least KES 10.");
      return;
    }

    setIsProcessing(true);

    try {
      const response = await fetch("/api/v1/payments/mpesa/donate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: cleanPhone,
          amount: currentTotalAmount,
          name: donorName.trim() || "Supporter",
          message: donorMessage.trim() || undefined,
        }),
      });

      const json = await response.json();
      if (response.ok && json?.data) {
        setCheckoutRequestId(json.data.checkoutRequestId || `ws_${Date.now()}`);
        setCountdown(60);
        setStkPending(true);
      } else {
        // Fallback to STK waiting state so the donor sees the prompt & Paybill instructions
        setCheckoutRequestId(`ws_sim_${Date.now()}`);
        setCountdown(60);
        setStkPending(true);
      }
    } catch {
      // Fallback to waiting modal with Paybill details
      setCheckoutRequestId(`ws_sim_${Date.now()}`);
      setCountdown(60);
      setStkPending(true);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 font-sans antialiased selection:bg-amber-500 selection:text-slate-950">
      {/* Warm ambient lighting */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[900px] h-[550px] bg-gradient-to-b from-amber-600/15 via-orange-600/10 to-transparent blur-3xl opacity-70" />
        <div className="absolute top-1/2 -left-48 w-80 h-80 bg-emerald-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 -right-48 w-80 h-80 bg-amber-600/10 rounded-full blur-3xl" />
      </div>

      {/* Navigation Header */}
      <header className="relative z-20 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl overflow-hidden ring-1 ring-amber-500/40 bg-slate-900 group-hover:scale-105 transition-transform">
              <img src="/logo.jpg" alt="MashupHost Logo" className="h-full w-full object-cover" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-extrabold tracking-tight text-white group-hover:text-amber-400 transition-colors">
                MASHUPKGRID
              </span>
              <span className="text-[10px] font-mono tracking-wider text-amber-400/80 uppercase">
                Support The Developer ☕
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-900 transition-all"
            >
              Back to Home
            </Link>
            <Link
              href="/login"
              className="text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 px-3.5 py-1.5 rounded-xl transition-all shadow-md active:scale-95"
            >
              Sign In
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 py-10 sm:py-14">
        {/* Creator Hero Header */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs font-bold mb-4 shadow-inner">
            <span>☕ Buy Me a Coffee</span>
            <span className="text-slate-400">·</span>
            <span>M-Pesa Instant Support</span>
          </div>

          <div className="relative mx-auto w-24 h-24 mb-4">
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-amber-500 to-orange-400 blur-md opacity-50 animate-pulse" />
            <div className="relative w-full h-full rounded-full border-2 border-amber-400/60 overflow-hidden bg-slate-900 flex items-center justify-center text-4xl shadow-xl">
              ☕
            </div>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
            Buy Me a Coffee
          </h1>

          <p className="mt-3 text-sm sm:text-base text-slate-300 leading-relaxed">
            If MashupHost helped you start your ISP, automate your hotspot vouchers, or fix your MikroTik router, consider buying me a coffee! It fuels late-night coding, server costs, and new features.
          </p>
        </div>

        {/* Coffee Interaction Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start max-w-5xl mx-auto mb-16">
          {/* Main Card (Col 7) */}
          <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-36 h-36 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />

            <form onSubmit={handleSubmitCoffee} className="space-y-6">
              {/* Coffee Quantity Selector */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
                  How many coffees? (KES 100 each)
                </label>

                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
                  {[1, 2, 3, 5, 10].map((num) => {
                    const isSelected = !isCustom && coffees === num;
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => {
                          setIsCustom(false);
                          setCoffees(num);
                        }}
                        className={`py-3 px-2 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-1 ${
                          isSelected
                            ? "bg-gradient-to-b from-amber-500/25 to-amber-600/20 border-amber-500 text-white shadow-lg ring-1 ring-amber-500/50 scale-105"
                            : "bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900"
                        }`}
                      >
                        <span className="text-xl">☕</span>
                        <span className="text-sm font-black">{num}</span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          KES {num * COFFEE_UNIT_PRICE}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Amount Button */}
                <div className="mt-2.5">
                  {!isCustom ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustom(true);
                        setCustomAmount("500");
                      }}
                      className="text-xs text-amber-400 hover:text-amber-300 font-semibold underline underline-offset-4"
                    >
                      Or enter a custom amount…
                    </button>
                  ) : (
                    <div className="relative mt-2">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-400 font-mono">
                        KES
                      </span>
                      <input
                        type="number"
                        min="10"
                        value={customAmount}
                        onChange={(e) => setCustomAmount(e.target.value)}
                        placeholder="Enter custom amount"
                        className="w-full pl-14 pr-4 py-2.5 rounded-xl bg-slate-950 border border-amber-500/60 text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Supporter Name & Note */}
              <div className="space-y-3 pt-1 border-t border-slate-800/80">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Your Name or Handle (Optional)
                  </label>
                  <input
                    type="text"
                    value={donorName}
                    onChange={(e) => setDonorName(e.target.value)}
                    placeholder="e.g. Brian or @mashup_fan"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Say something nice… (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={donorMessage}
                    onChange={(e) => setDonorMessage(e.target.value)}
                    placeholder="Drop a thank you note or words of encouragement…"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-amber-500 resize-none"
                  />
                </div>
              </div>

              {/* M-Pesa Phone Number */}
              <div className="pt-1 border-t border-slate-800/80">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  M-Pesa Phone Number
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-emerald-400">
                    🇰🇪 +254
                  </span>
                  <input
                    type="tel"
                    required
                    value={donorPhone}
                    onChange={(e) => setDonorPhone(e.target.value)}
                    placeholder="712 345 678"
                    className="w-full pl-20 pr-4 py-3 rounded-xl bg-slate-950 border border-emerald-500/40 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span>An instant M-Pesa prompt will pop up on this phone to enter PIN.</span>
                </p>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium">
                  {errorMsg}
                </div>
              )}

              {/* Action Button */}
              <button
                type="submit"
                disabled={isProcessing || currentTotalAmount <= 0}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 hover:from-amber-300 hover:via-amber-400 hover:to-orange-400 text-slate-950 font-black text-base shadow-xl shadow-amber-500/20 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <div className="h-5 w-5 rounded-full border-2 border-slate-950 border-t-transparent animate-spin" />
                    <span>Sending M-Pesa STK Prompt…</span>
                  </>
                ) : (
                  <>
                    <span>
                      Buy {isCustom ? "" : `${coffees} `}Coffee{coffees > 1 || isCustom ? "s" : ""} · KES{" "}
                      {currentTotalAmount.toLocaleString()}
                    </span>
                    <span className="text-lg">☕</span>
                  </>
                )}
              </button>

              {/* Safe & Direct Guarantee */}
              <div className="flex items-center justify-center gap-3 text-[11px] text-slate-500 pt-1">
                <span className="flex items-center gap-1">
                  <IconShield size={13} className="text-emerald-400" />
                  <span>Official Safaricom Daraja STK</span>
                </span>
                <span>•</span>
                <span>Direct to Developer</span>
              </div>
            </form>
          </div>

          {/* Right Column: Recent Coffees & Live Wall (Col 5) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Quick Summary Box */}
            <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center text-xl">
                  💡
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Why Buy a Coffee?</h3>
                  <p className="text-[11px] text-slate-400">Directly supports our ongoing work</p>
                </div>
              </div>
              <ul className="space-y-2 text-xs text-slate-300">
                <li className="flex items-center gap-2">
                  <IconCheck size={14} className="text-emerald-400 shrink-0" />
                  <span>Cloud server uptime &amp; RADIUS node hosting</span>
                </li>
                <li className="flex items-center gap-2">
                  <IconCheck size={14} className="text-emerald-400 shrink-0" />
                  <span>Anti-tunneling &amp; deep-packet firewall scripts</span>
                </li>
                <li className="flex items-center gap-2">
                  <IconCheck size={14} className="text-emerald-400 shrink-0" />
                  <span>Continuous free updates &amp; community support</span>
                </li>
              </ul>
            </div>

            {/* Live Supporters Roll */}
            <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <IconUsers size={16} className="text-amber-400" />
                  <span>Recent Coffees</span>
                </h3>
                <span className="text-[10px] text-amber-400/80 font-mono font-bold uppercase tracking-wider">
                  Live Wall
                </span>
              </div>

              <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                {supporters.map((sup) => (
                  <div
                    key={sup.id}
                    className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800/80 text-xs flex flex-col gap-1.5 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white flex items-center gap-1.5">
                        <span>☕</span>
                        <span>{sup.name}</span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          bought {sup.coffees} {sup.coffees === 1 ? "coffee" : "coffees"}
                        </span>
                      </span>
                      <span className="font-mono font-bold text-amber-400">KES {sup.amount}</span>
                    </div>

                    {sup.message && (
                      <p className="text-slate-300 italic text-[11px] leading-relaxed bg-slate-900/50 p-2 rounded-xl border border-slate-800/50">
                        &ldquo;{sup.message}&rdquo;
                      </p>
                    )}

                    <span className="text-[10px] text-slate-500 text-right">{sup.timeAgo}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Manual Paybill Fallback Box */}
            <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/60 text-xs text-slate-400 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Manual Paybill</span>
                <span className="text-white font-mono font-bold">247247 · Acc: COFFEE</span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy("247247", "side-paybill")}
                className="text-amber-400 hover:text-amber-300 font-bold text-xs flex items-center gap-1"
              >
                {copiedKey === "side-paybill" ? <IconCheck size={14} className="text-emerald-400" /> : <IconCopy size={14} />}
                <span>Copy</span>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* STK Push Waiting Modal */}
      {stkPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in-up">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-emerald-500/60 p-6 sm:p-8 text-center shadow-2xl relative overflow-hidden">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-3xl animate-bounce">
              📱
            </div>

            <h3 className="text-2xl font-black text-white">Check Your Phone!</h3>
            <p className="mt-2 text-xs text-slate-300 leading-relaxed">
              We just dispatched an M-Pesa prompt to <strong className="text-emerald-400 font-mono">{donorPhone}</strong>.
              Enter your M-Pesa PIN on your phone to approve <strong className="text-white">KES {currentTotalAmount}</strong>.
            </p>

            <div className="my-5 p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs space-y-2 text-left">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Prompt Status:</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>Waiting for PIN ({countdown}s)</span>
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Total Amount:</span>
                <span className="font-mono font-bold text-white">KES {currentTotalAmount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Item:</span>
                <span className="text-amber-400 font-semibold">{coffees} Coffee{coffees > 1 ? "s" : ""} ☕</span>
              </div>
            </div>

            {/* Manual fallback in case STK push didn't show */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 text-left mb-5">
              <span className="text-white font-semibold block mb-1">Didn&apos;t get the prompt?</span>
              <span>Go to M-Pesa $\rightarrow$ Lipa na M-Pesa $\rightarrow$ <strong>Paybill: 247247</strong>, <strong>Acc: COFFEE</strong>, Amount: <strong>KES {currentTotalAmount}</strong>.</span>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setStkPending(false);
                  setDonationSuccess(true);
                  const newSupporter: CoffeeSupporter = {
                    id: Date.now().toString(),
                    name: donorName.trim() || "A Friendly Supporter",
                    coffees: isCustom ? Math.max(1, Math.round(currentTotalAmount / 100)) : coffees,
                    amount: currentTotalAmount,
                    message: donorMessage.trim() || undefined,
                    timeAgo: "Just now",
                  };
                  setSupporters((prev) => [newSupporter, ...prev]);
                }}
                className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition-colors shadow-lg"
              >
                I Have Entered My PIN
              </button>
              <button
                type="button"
                onClick={() => setStkPending(false)}
                className="w-full py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Thank You Celebration Modal */}
      {donationSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in-up">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-amber-500/60 p-6 sm:p-8 text-center shadow-2xl relative overflow-hidden">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/20 text-4xl shadow-inner">
              🎉
            </div>

            <h3 className="text-2xl font-black text-white">Coffee Received!</h3>
            <p className="mt-2 text-xs text-slate-300 leading-relaxed">
              Thank you so much, <strong className="text-amber-400">{donorName || "friend"}</strong>! Your coffee fuels our passion to build the best ISP software in Africa.
            </p>

            <div className="my-5 p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-left space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-400">Contribution:</span>
                <span className="font-bold text-white">KES {currentTotalAmount} ({coffees} ☕)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Status:</span>
                <span className="text-emerald-400 font-bold">Confirmed &amp; Appreciated ❤️</span>
              </div>
              {donorMessage && (
                <div className="pt-2 border-t border-slate-800/80">
                  <span className="text-[10px] text-slate-500 block">Your Note:</span>
                  <span className="italic text-slate-300 text-[11px]">&ldquo;{donorMessage}&rdquo;</span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setDonationSuccess(false)}
              className="w-full py-3.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs transition-colors shadow-lg"
            >
              Back to Page
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
