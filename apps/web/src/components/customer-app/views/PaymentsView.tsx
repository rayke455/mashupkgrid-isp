"use client";

import React, { useState } from "react";
import type { CustomerProfile, TransactionItem } from "../types";
import { BillIcon, CreditCardIcon, CheckIcon, Share2Icon } from "../icons";

interface PaymentsViewProps {
  customer: CustomerProfile;
  transactions: TransactionItem[];
  brandName?: string;
  onOpenPayModal: (type: "INTERNET" | "TV" | "OUTSTANDING_BALANCE", amount: number) => void;
}

export function PaymentsView({
  customer,
  transactions,
  brandName = "FiberConnect",
  onOpenPayModal,
}: PaymentsViewProps) {
  const [selectedTxForReceipt, setSelectedTxForReceipt] = useState<TransactionItem | null>(null);

  return (
    <div className="space-y-4 pb-24 animate-fade-in">
      {/* Header */}
      <div className="px-1 pt-2">
        <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          Payments &amp; Billing
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Fast self-service renewals with instant M-Pesa STK push.
        </p>
      </div>

      {/* 1. Quick Pay Card */}
      <div className="rounded-3xl bg-gradient-to-br from-[#090b4d] to-indigo-950 text-white p-6 shadow-xl relative overflow-hidden">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm">
            Current Account Balance
          </span>
          <span className="text-xs font-mono font-bold text-blue-200">
            {customer.accountNumber}
          </span>
        </div>

        <div className="mt-4">
          <span className="text-3xl sm:text-4xl font-black tracking-tight block">
            KES {customer.outstandingBalance > 0 ? "2,000.00" : "0.00"}
          </span>
          <span className="text-xs text-blue-200 font-semibold block mt-1">
            Next renewal due by {customer.dueDate}
          </span>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => onOpenPayModal("OUTSTANDING_BALANCE", 2000)}
            className="flex-1 py-3 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-lg transition-all active:scale-[0.99]"
          >
            Pay with M-PESA STK Push
          </button>
        </div>
      </div>

      {/* 2. Manual Paybill Details */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 shadow-sm space-y-3">
        <h3 className="text-sm font-black text-slate-900 dark:text-white">
          Manual M-Pesa Paybill / Till Option
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
            <span className="text-[10px] font-bold uppercase text-slate-400 block">Paybill Business No</span>
            <span className="text-base font-black font-mono text-slate-900 dark:text-white">400200</span>
          </div>
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
            <span className="text-[10px] font-bold uppercase text-slate-400 block">Account Number</span>
            <span className="text-base font-black font-mono text-blue-600 dark:text-blue-400">{customer.accountNumber}</span>
          </div>
        </div>
      </div>

      {/* 3. Transaction History */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-slate-900 dark:text-white">
            Payment History
          </h3>
          <span className="text-xs font-bold text-slate-400">
            {transactions.length} Total
          </span>
        </div>

        <div className="space-y-2.5">
          {transactions.map((tx) => (
            <div
              key={tx.id}
              onClick={() => setSelectedTxForReceipt(tx)}
              className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 flex items-center justify-between cursor-pointer hover:border-blue-500/40 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black text-xs shrink-0">
                  <BillIcon className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">
                    {tx.service}
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    {tx.date} • Ref: {tx.reference}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs font-black text-slate-900 dark:text-white block">
                  KES {tx.amount.toLocaleString()}
                </span>
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  ● {tx.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Digital Receipt Modal */}
      {selectedTxForReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center">
                  <CheckIcon className="w-4 h-4" />
                </div>
                <span className="text-sm font-black text-slate-900 dark:text-white">Digital Receipt</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTxForReceipt(null)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">ISP Provider</span>
                <span className="font-bold text-slate-900 dark:text-white">{brandName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Subscriber Name</span>
                <span className="font-bold text-slate-900 dark:text-white">{customer.fullName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Account Number</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">{customer.accountNumber}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Service</span>
                <span className="font-bold text-slate-900 dark:text-white">{selectedTxForReceipt.service}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Amount Paid</span>
                <span className="font-black text-base text-emerald-600 dark:text-emerald-400">
                  KES {selectedTxForReceipt.amount.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">M-Pesa Reference</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">{selectedTxForReceipt.reference}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Date</span>
                <span>{selectedTxForReceipt.date}</span>
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  window.print();
                }}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs"
              >
                Print PDF
              </button>
              <button
                type="button"
                onClick={() => {
                  const text = `Official ${brandName} Receipt: Ref ${selectedTxForReceipt.reference}, Amount KES ${selectedTxForReceipt.amount} for ${customer.fullName}`;
                  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
                }}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <Share2Icon className="w-3.5 h-3.5" />
                <span>Share WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
