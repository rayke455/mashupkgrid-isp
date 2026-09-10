"use client";

import { useState, useEffect, useRef } from "react";
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
import { getApiBaseUrl } from "@/lib/api-client";

interface DonationGift {
  id: string;
  emoji: string;
  label: string;
  amount: number;
  desc: string;
}

const DONATION_GIFTS: DonationGift[] = [
  { id: "chai", emoji: "🫖", label: "Chai & Mandazi", amount: 50, desc: "Quick boost" },
  { id: "coffee", emoji: "☕", label: "Coffee", amount: 100, desc: "Coding fuel" },
  { id: "snack", emoji: "🍟", label: "Snack / Bites", amount: 250, desc: "Dev break" },
  { id: "lunch", emoji: "🍕", label: "Dev Lunch", amount: 500, desc: "Power through" },
  { id: "bundle", emoji: "⚡", label: "Data Bundle", amount: 1000, desc: "High-speed testing" },
  { id: "server", emoji: "🚀", label: "Cloud Server", amount: 2000, desc: "Host MikroTik nodes" },
];

interface SupporterItem {
  id: string;
  name: string;
  giftLabel: string;
  amount: number;
  message?: string;
  timeAgo: string;
}

const INITIAL_SUPPORTERS: SupporterItem[] = [
  {
    id: "1",
    name: "Brian M.",
    giftLabel: "🍟 Snack / Bites",
    amount: 250,
    message: "Loving the new MikroTik captive portal updates! Keep it up!",
    timeAgo: "10m ago",
  },
  {
    id: "2",
    name: "Faith W.",
    giftLabel: "🍕 Dev Lunch",
    amount: 500,
    message: "Thank you for the anti-tunneling scripts. Saved our WISP network!",
    timeAgo: "45m ago",
  },
  {
    id: "3",
    name: "Anonymous ISP Tech",
    giftLabel: "🫖 Chai & Mandazi",
    amount: 50,
    message: "Small chai for the late-night coding sessions 🫖",
    timeAgo: "2h ago",
  },
  {
    id: "4",
    name: "Dennis Kipkorir",
    giftLabel: "⚡ Data Bundle",
    amount: 1000,
    message: "Proud to support open telecom software in Kenya. Cheers!",
    timeAgo: "5h ago",
  },
  {
    id: "5",
    name: "Meshack O.",
    giftLabel: "☕ Coffee",
    amount: 100,
    message: "Best hotspot billing system!",
    timeAgo: "Yesterday",
  },
];

export default function DonateCoffeePage() {
  // Donation gift / amount state
  const [selectedGiftId, setSelectedGiftId] = useState<string>("coffee");
  const [donationAmount, setDonationAmount] = useState<number>(100);
  const [customAmountText, setCustomAmountText] = useState<string>("");
  const [isCustom, setIsCustom] = useState<boolean>(false);

  // Supporter info
  const [donorName, setDonorName] = useState<string>("");
  const [donorPhone, setDonorPhone] = useState<string>("");
  const [donorMessage, setDonorMessage] = useState<string>("");

  // Direct navigation / focus for phone number
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const [highlightPhone, setHighlightPhone] = useState<boolean>(false);

  const focusAndScrollToPhone = () => {
    setHighlightPhone(true);
    setTimeout(() => {
      if (phoneInputRef.current) {
        phoneInputRef.current.focus();
        phoneInputRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 60);
    setTimeout(() => {
      setHighlightPhone(false);
    }, 2200);
  };

  // Transaction & modal states
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [stkPending, setStkPending] = useState<boolean>(false);
  const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(60);
  const [donationSuccess, setDonationSuccess] = useState<boolean>(false);
  const [isVerifyingPin, setIsVerifyingPin] = useState<boolean>(false);
  const [verifyStatusMessage, setVerifyStatusMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Supporters roll
  const [supporters, setSupporters] = useState<SupporterItem[]>(INITIAL_SUPPORTERS);

  // M-Pesa gateway config (fetched from API)
  const [mpesaConfig, setMpesaConfig] = useState<{ paybill: string | null; accountReference: string; enabled: boolean }>(
    { paybill: null, accountReference: "COFFEE", enabled: false }
  );

  // Fetch the donate M-Pesa gateway config on mount
  useEffect(() => {
    const baseUrl = getApiBaseUrl();
    fetch(`${baseUrl}/api/v1/payments/mpesa/donate/config`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.data) setMpesaConfig(json.data);
      })
      .catch(() => {});
  }, []);

  const currentGift = DONATION_GIFTS.find((g) => g.id === selectedGiftId);
  const currentGiftLabel = isCustom
    ? `Support Tip 💝 (KES ${donationAmount.toLocaleString()})`
    : `${currentGift?.emoji || "☕"} ${currentGift?.label || "Coffee"}`;

  const handleSelectGift = (gift: DonationGift) => {
    setSelectedGiftId(gift.id);
    setDonationAmount(gift.amount);
    setIsCustom(false);
    setCustomAmountText("");
    setErrorMsg(null);
    focusAndScrollToPhone();
  };

  const handleCustomAmountChange = (val: string) => {
    setCustomAmountText(val);
    const parsed = parseInt(val, 10) || 0;
    setDonationAmount(parsed);
    setIsCustom(true);
    setSelectedGiftId("");
    setErrorMsg(null);
  };

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

  // Status polling when STK is dispatched (accelerated: 1.2s initial, 1.5s interval)
  useEffect(() => {
    if (!stkPending || !checkoutRequestId) return;

    let attempts = 0;
    let isCancelled = false;
    let intervalId: any = null;

    const checkStatus = async () => {
      try {
        const baseUrl = getApiBaseUrl();
        const res = await fetch(`${baseUrl}/api/v1/payments/mpesa/donate/${checkoutRequestId}/status`);
        if (res.ok) {
          const data = await res.json();
          const status = data?.data?.status;

          if (status === "COMPLETED") {
            if (isCancelled) return true;
            if (intervalId) clearInterval(intervalId);
            setStkPending(false);
            setDonationSuccess(true);

            // Add new donor to the live supporters list
            const newSupporter: SupporterItem = {
              id: Date.now().toString(),
              name: donorName.trim() || "A Friendly Supporter",
              giftLabel: currentGiftLabel,
              amount: donationAmount,
              message: donorMessage.trim() || undefined,
              timeAgo: "Just now",
            };
            setSupporters((prev) => [newSupporter, ...prev]);
            return true;
          } else if (status === "FAILED" || status === "CANCELLED") {
            if (isCancelled) return true;
            if (intervalId) clearInterval(intervalId);
            setVerifyStatusMessage(
              status === "CANCELLED"
                ? "❌ M-Pesa prompt was cancelled on the phone. Please try again."
                : (data?.data?.resultDesc ? `❌ ${data.data.resultDesc}` : "❌ M-Pesa payment was not completed. Please try again.")
            );
            return true;
          }
        }
      } catch {}
      return false;
    };

    // Quick initial check at 1.5s
    const initialTimer = setTimeout(async () => {
      if (isCancelled) return;
      const done = await checkStatus();
      if (done) return;

      // Accelerated polling every 1.5s
      intervalId = setInterval(async () => {
        if (isCancelled) {
          clearInterval(intervalId);
          return;
        }
        attempts++;
        const finished = await checkStatus();
        if (finished || attempts > 38) {
          clearInterval(intervalId);
        }
      }, 1500);
    }, 1500);

    return () => {
      isCancelled = true;
      clearTimeout(initialTimer);
      if (intervalId) clearInterval(intervalId);
    };
  }, [stkPending, checkoutRequestId, donorName, donationAmount, currentGiftLabel, donorMessage]);

  // Accurate verification when the user explicitly clicks "I Have Entered My PIN"
  const handleVerifyPinManually = async () => {
    if (!checkoutRequestId) return;
    setIsVerifyingPin(true);
    setVerifyStatusMessage(null);

    try {
      const baseUrl = getApiBaseUrl();

      // Check up to 3 times (1.5s apart) with ?verify=true to actively query Daraja if callback hasn't arrived
      for (let i = 0; i < 3; i++) {
        const res = await fetch(`${baseUrl}/api/v1/payments/mpesa/donate/${checkoutRequestId}/status?verify=true`);
        if (res.ok) {
          const data = await res.json();
          const status = data?.data?.status;

          if (status === "COMPLETED") {
            setIsVerifyingPin(false);
            setStkPending(false);
            setDonationSuccess(true);

            const newSupporter: SupporterItem = {
              id: Date.now().toString(),
              name: donorName.trim() || "A Friendly Supporter",
              giftLabel: currentGiftLabel,
              amount: donationAmount,
              message: donorMessage.trim() || undefined,
              timeAgo: "Just now",
            };
            setSupporters((prev) => [newSupporter, ...prev]);
            return;
          } else if (status === "FAILED" || status === "CANCELLED") {
            setIsVerifyingPin(false);
            setVerifyStatusMessage(
              status === "CANCELLED"
                ? "❌ M-Pesa transaction was cancelled on your phone. Please try again."
                : (data?.data?.resultDesc ? `❌ ${data.data.resultDesc}` : "❌ M-Pesa reported payment was not completed. Please try again.")
            );
            return;
          }
        }
        if (i < 2) await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      // If still pending after 3 active inquiries:
      setIsVerifyingPin(false);
      setVerifyStatusMessage(
        "⚠️ Payment has not been confirmed by M-Pesa yet. If you already entered your PIN, please give Safaricom a few seconds to complete. The page will celebrate as soon as M-Pesa confirms!"
      );
    } catch {
      setIsVerifyingPin(false);
      setVerifyStatusMessage("Network error checking payment status. Will keep retrying automatically...");
    }
  };

  const handleSubmitDonation = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setVerifyStatusMessage(null);

    // Accept Kenyan numbers: 07XXXXXXXX, 01XXXXXXXX, 7XXXXXXXX, 1XXXXXXXX, 254XXXXXXXX
    const cleanDigits = donorPhone.replace(/\D/g, "");
    if (!/^(0[71]\d{8}|[71]\d{8}|254[71]\d{8})$/.test(cleanDigits)) {
      setErrorMsg("Please enter a valid Kenyan phone number starting with 07 or 01 (e.g. 0712345678).");
      return;
    }

    if (donationAmount < 10) {
      setErrorMsg("Please enter an amount of at least KES 10.");
      return;
    }

    // Instant optimistic modal feedback
    setIsProcessing(true);
    setCheckoutRequestId(null);
    setCountdown(60);
    setStkPending(true);

    try {
      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/v1/payments/mpesa/donate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: cleanDigits,
          amount: donationAmount,
          name: donorName.trim() || "Supporter",
          message: donorMessage.trim() || undefined,
        }),
      });

      const json = await response.json();
      if (response.ok && json?.data?.checkoutRequestId) {
        setCheckoutRequestId(json.data.checkoutRequestId);
        setIsProcessing(false);
      } else {
        setStkPending(false);
        setIsProcessing(false);
        const errorMsg =
          json?.error?.message ||
          json?.message ||
          json?.data?.fallbackMessage ||
          "Could not send M-Pesa STK prompt to your phone. Please check the number or use Paybill directly.";
        setErrorMsg(errorMsg);
      }
    } catch (err: any) {
      setStkPending(false);
      setIsProcessing(false);
      setErrorMsg("Network error connecting to payment gateway. Please check your connection.");
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

        {/* Donation Interaction Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start max-w-5xl mx-auto mb-16">
          {/* Main Card (Col 7) */}
          <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-36 h-36 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />

            <form onSubmit={handleSubmitDonation} className="space-y-6">
              {/* Gift & Amount Selection */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                    Choose a treat or custom amount
                  </label>
                  <span className="text-xs font-mono font-black text-amber-400">
                    KES {donationAmount.toLocaleString()}
                  </span>
                </div>

                {/* 6 Preset Gifts */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-3.5">
                  {DONATION_GIFTS.map((gift) => {
                    const isSelected = !isCustom && selectedGiftId === gift.id;
                    return (
                      <button
                        key={gift.id}
                        type="button"
                        onClick={() => handleSelectGift(gift)}
                        className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between gap-1.5 ${
                          isSelected
                            ? "bg-gradient-to-b from-amber-500/25 to-amber-600/20 border-amber-500 text-white shadow-lg ring-1 ring-amber-500/50 scale-[1.02]"
                            : "bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900"
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-2xl">{gift.emoji}</span>
                          <span className="text-xs font-mono font-bold text-amber-400">
                            KES {gift.amount}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs font-black block text-white">{gift.label}</span>
                          <span className="text-[10px] text-slate-400 block truncate">{gift.desc}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Prominent Custom Amount Input */}
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/90 space-y-1.5">
                  <label className="block text-[11px] font-semibold text-slate-400">
                    Or enter any custom amount you like:
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-400 font-mono">
                      KES
                    </span>
                    <input
                      type="number"
                      min="10"
                      step="10"
                      value={customAmountText}
                      onChange={(e) => handleCustomAmountChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          focusAndScrollToPhone();
                        }
                      }}
                      placeholder="e.g. 20, 75, 300, 1500..."
                      className={`w-full pl-14 pr-4 py-2.5 rounded-xl bg-slate-900 border text-white font-bold text-sm focus:outline-none transition-all ${
                        isCustom
                          ? "border-amber-500 ring-1 ring-amber-500/50"
                          : "border-slate-800 focus:border-amber-500"
                      }`}
                    />
                  </div>
                  {isCustom && donationAmount > 0 && (
                    <button
                      type="button"
                      onClick={focusAndScrollToPhone}
                      className="mt-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors"
                    >
                      <span>Next: Enter phone number for KES {donationAmount.toLocaleString()}</span>
                      <IconChevronRight size={13} />
                    </button>
                  )}
                </div>
              </div>

              {/* Step 2: M-Pesa Phone Number — Direct next step after choosing treat */}
              <div
                id="phone-input-section"
                className={`pt-4 pb-1 border-t transition-all duration-500 rounded-2xl ${
                  highlightPhone
                    ? "bg-emerald-500/10 p-3.5 border-emerald-500/60 ring-2 ring-emerald-400/40"
                    : "border-slate-800/80"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-[11px] font-mono">
                      2
                    </span>
                    <span>M-Pesa Phone Number</span>
                  </label>
                  <span className="text-[11px] font-mono text-emerald-400 font-medium">
                    07XX... or 01XX...
                  </span>
                </div>
                <div className="relative">
                  <input
                    ref={phoneInputRef}
                    type="tel"
                    required
                    value={donorPhone}
                    onChange={(e) => setDonorPhone(e.target.value)}
                    placeholder="0712 345 678 or 0110 123 456"
                    className={`w-full px-4 py-3.5 rounded-xl bg-slate-950 border font-mono text-base focus:outline-none transition-all placeholder:text-slate-600 ${
                      highlightPhone
                        ? "border-emerald-400 text-white ring-2 ring-emerald-400/60 shadow-lg shadow-emerald-500/20"
                        : "border-emerald-500/40 text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    }`}
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Enter your phone number. Safaricom will send an instant PIN prompt on your screen.</span>
                </p>
              </div>

              {/* Step 3: Supporter Details (Optional) */}
              <div className="space-y-3 pt-3 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-slate-400 text-[11px] font-mono">
                      3
                    </span>
                    <span>Supporter Details (Optional)</span>
                  </span>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Your Name or Handle
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
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Say something nice…
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

              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium">
                  {errorMsg}
                </div>
              )}

              {/* Action Button */}
              <button
                type="submit"
                disabled={isProcessing || donationAmount <= 0}
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
                      Send {currentGiftLabel} · KES {donationAmount.toLocaleString()}
                    </span>
                    <span className="text-lg">⚡</span>
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
                  <h3 className="text-sm font-bold text-white">Why Support?</h3>
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
                  <span>Recent Supporters</span>
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
                        <span>{sup.giftLabel}</span>
                        <span className="text-[10px] text-slate-400 font-normal">by {sup.name}</span>
                      </span>
                      <span className="font-mono font-bold text-amber-400">
                        KES {sup.amount.toLocaleString()}
                      </span>
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
                <span className="text-white font-mono font-bold">
                  {mpesaConfig.paybill || "—"} · Acc: {mpesaConfig.accountReference}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(mpesaConfig.paybill || "", "side-paybill")}
                className="text-amber-400 hover:text-amber-300 font-bold text-xs flex items-center gap-1"
              >
                {copiedKey === "side-paybill" ? (
                  <IconCheck size={14} className="text-emerald-400" />
                ) : (
                  <IconCopy size={14} />
                )}
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
            {isProcessing && !checkoutRequestId ? (
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20 text-3xl animate-pulse ring-4 ring-amber-500/30">
                ⚡
              </div>
            ) : (
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-3xl animate-bounce">
                📱
              </div>
            )}

            <h3 className="text-2xl font-black text-white">
              {isProcessing && !checkoutRequestId ? "Connecting to Safaricom…" : "Check Your Phone!"}
            </h3>
            <p className="mt-2 text-xs text-slate-300 leading-relaxed">
              {isProcessing && !checkoutRequestId ? (
                <>
                  Triggering direct M-Pesa prompt to{" "}
                  <strong className="text-amber-400 font-mono">{donorPhone}</strong>. Please keep
                  your phone unlocked!
                </>
              ) : (
                <>
                  We just dispatched an M-Pesa prompt to{" "}
                  <strong className="text-emerald-400 font-mono">{donorPhone}</strong>. Enter your
                  M-Pesa PIN on your phone to approve{" "}
                  <strong className="text-white">KES {donationAmount.toLocaleString()}</strong>.
                </>
              )}
            </p>

            <div className="my-5 p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs space-y-2 text-left">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Prompt Status:</span>
                {isProcessing && !checkoutRequestId ? (
                  <span className="text-amber-400 font-bold flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                    <span>Dispatched · Handset Ping…</span>
                  </span>
                ) : (
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>Waiting for PIN ({countdown}s)</span>
                  </span>
                )}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Total Amount:</span>
                <span className="font-mono font-bold text-white">
                  KES {donationAmount.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Item:</span>
                <span className="text-amber-400 font-semibold">{currentGiftLabel}</span>
              </div>
            </div>

            {/* Inline verification feedback message if PIN check was pressed or failed */}
            {verifyStatusMessage && (
              <div
                className={`p-3.5 rounded-2xl text-xs text-left mb-4 leading-relaxed font-medium border ${
                  verifyStatusMessage.includes("❌")
                    ? "bg-red-500/10 border-red-500/30 text-red-400"
                    : "bg-amber-500/10 border-amber-500/30 text-amber-300"
                }`}
              >
                {verifyStatusMessage}
              </div>
            )}

            {/* Manual fallback in case STK push didn't show */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 text-left mb-5">
              <span className="text-white font-semibold block mb-1">Didn&apos;t get the prompt?</span>
              <span>
                Go to M-Pesa → Lipa na M-Pesa → <strong>Paybill: {mpesaConfig.paybill || "—"}</strong>,{" "}
                <strong>Acc: {mpesaConfig.accountReference}</strong>, Amount:{" "}
                <strong>KES {donationAmount.toLocaleString()}</strong>.
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={isVerifyingPin || (isProcessing && !checkoutRequestId)}
                onClick={handleVerifyPinManually}
                className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition-colors shadow-lg flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {isVerifyingPin ? (
                  <>
                    <div className="h-4 w-4 rounded-full border-2 border-slate-950 border-t-transparent animate-spin" />
                    <span>Verifying with M-Pesa…</span>
                  </>
                ) : (
                  <span>I Have Entered My PIN</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStkPending(false);
                  setVerifyStatusMessage(null);
                }}
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

            <h3 className="text-2xl font-black text-white">Support Received!</h3>
            <p className="mt-2 text-xs text-slate-300 leading-relaxed">
              Thank you so much, <strong className="text-amber-400">{donorName || "friend"}</strong>! Your support fuels our passion to build the best ISP software in Africa.
            </p>

            <div className="my-5 p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-left space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-400">Gift:</span>
                <span className="font-bold text-white">{currentGiftLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Amount:</span>
                <span className="font-mono font-bold text-amber-400">
                  KES {donationAmount.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Status:</span>
                <span className="text-emerald-400 font-bold">Confirmed by Safaricom M-Pesa ❤️</span>
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
              onClick={() => {
                setDonationSuccess(false);
                setVerifyStatusMessage(null);
              }}
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
