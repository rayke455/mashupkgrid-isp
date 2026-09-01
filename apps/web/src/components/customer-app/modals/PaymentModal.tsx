"use client";

import React, { useState } from "react";
import { PhoneIcon, CheckIcon, BillIcon, ShieldCheckIcon } from "../icons";

interface PaymentModalProps {
  isOpen: boolean;
  serviceType: "INTERNET" | "TV" | "OUTSTANDING_BALANCE";
  amount: number;
  packageName?: string;
  defaultPhone?: string;
  brandName?: string;
  onClose: () => void;
  onSuccess: (receipt: any) => void;
}

export function PaymentModal({
  isOpen,
  serviceType,
  amount,
  packageName,
  // Empty, not a sample number: this value is pre-filled into the field an M-Pesa STK push is
  // sent to, so a customer who tapped Pay without editing it would have pushed a payment prompt
  // to a stranger's handset.
  defaultPhone = "",
  brandName = "FiberConnect",
  onClose,
  onSuccess,
}: PaymentModalProps) {
  const [phone, setPhone] = useState(defaultPhone);
  const [step, setStep] = useState<"form" | "stk-sent" | "success">("form");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleInitiateMpesa = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    setTimeout(() => {
      setLoading(false);
      setStep("stk-sent");

      // Auto-simulate PIN confirmation on phone
      setTimeout(() => {
        setStep("success");
      }, 2500);
    }, 800);
  };

  const handleFinish = () => {
    onSuccess({
      amount,
      service: packageName || (serviceType === "INTERNET" ? "Fiber 50Mbps Renewal" : "Service Payment"),
      reference: "QGH" + Math.floor(1000000 + Math.random() * 9000000),
      date: "Just now",
    });
    setStep("form");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl relative">
        {step === "form" && (
          <form onSubmit={handleInitiateMpesa} className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center font-black text-xs">
                  M
                </span>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  M-PESA Instant Pay
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
              <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300 block">
                Total Amount Due
              </span>
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                KES {amount.toLocaleString()}.00
              </span>
              {packageName && (
                <span className="text-xs text-slate-500 dark:text-slate-400 block mt-0.5">
                  For {packageName}
                </span>
              )}
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                M-Pesa Phone Number
              </label>
              <div className="relative mt-1">
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0724 165 988"
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-sm outline-none focus:border-emerald-500"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                An M-Pesa STK push prompt will appear on this phone screen.
              </span>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md transition-all active:scale-[0.99]"
              >
                {loading ? "Sending STK..." : "Send STK Push"}
              </button>
            </div>
          </form>
        )}

        {step === "stk-sent" && (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 flex items-center justify-center mx-auto animate-bounce">
              <PhoneIcon className="w-8 h-8" />
            </div>
            <div>
              <h4 className="text-lg font-black text-slate-900 dark:text-white">
                Check Your Phone
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Please enter your M-Pesa PIN on <span className="font-bold">{phone}</span> to complete payment of KES {amount}.
              </p>
            </div>
            <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>Awaiting PIN confirmation...</span>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="text-center py-4 space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-lg">
              <CheckIcon className="w-9 h-9" />
            </div>
            <div>
              <h4 className="text-xl font-black text-slate-900 dark:text-white">
                Payment Successful 🎉
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Your fiber service has been renewed and activated automatically.
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-xs text-left space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Amount</span>
                <span className="font-bold text-slate-900 dark:text-white">KES {amount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Status</span>
                <span className="font-bold text-emerald-600">Active (30 Days)</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleFinish}
              className="w-full py-3 rounded-2xl bg-[#090b4d] text-white font-bold text-xs shadow-md"
            >
              Done &amp; View Receipt
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
