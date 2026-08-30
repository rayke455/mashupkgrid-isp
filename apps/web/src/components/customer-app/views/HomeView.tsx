"use client";

import React from "react";
import type { CustomerProfile } from "../types";
import { RouterIcon, TvIcon, BillIcon, ArrowRightIcon, SpeedometerIcon, ShieldCheckIcon, Share2Icon } from "../icons";

interface HomeViewProps {
  customer: CustomerProfile;
  brandName?: string;
  onNavigateTab: (tab: "services" | "payments" | "support" | "profile") => void;
  onOpenPayModal: (type: "INTERNET" | "TV" | "OUTSTANDING_BALANCE", amount: number) => void;
  onOpenSpeedTest: () => void;
}

export function HomeView({
  customer,
  brandName = "FiberConnect",
  onNavigateTab,
  onOpenPayModal,
  onOpenSpeedTest,
}: HomeViewProps) {
  // Smart Greeting Calculation
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return { text: `Good morning, ${customer.fullName}`, emoji: "👋" };
    if (hour < 17) return { text: `Good afternoon, ${customer.fullName}`, emoji: "🌤️" };
    if (hour < 21) return { text: `Good evening, ${customer.fullName}`, emoji: "🌙" };
    return { text: `Good night, ${customer.fullName}`, emoji: "✨" };
  };

  const greeting = getGreeting();

  return (
    <div className="space-y-4 pb-24 animate-fade-in">
      {/* Header Greeting matching Screenshot */}
      <div className="pt-2 px-1">
        <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
          <span>{greeting.text}</span>
          <span>{greeting.emoji}</span>
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          Here is a quick overview of your account status.
        </p>
      </div>

      {/* 1. INTERNET CARD matching Screenshot */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 shadow-sm hover:shadow-md transition-all">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-sm">
              <RouterIcon className="w-6 h-6" />
            </div>
            <div>
              <span className="font-bold text-base text-slate-900 dark:text-white block">Internet</span>
              <span className="text-[11px] font-semibold text-slate-400">Fiber Unlimited Home</span>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Active
          </span>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-2 gap-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">SPEED</span>
            <span className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
              {customer.internetService.speedMbps} Mbps
            </span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">EXPIRES</span>
            <span className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
              {customer.internetService.expiresAt.replace(" 2026", "")}
            </span>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigateTab("services")}
            className="w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-200 font-bold text-xs transition-all"
          >
            Manage Package &amp; Speed
          </button>
        </div>
      </div>

      {/* 2. TV CARD matching Screenshot */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 shadow-sm hover:shadow-md transition-all">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-sm">
              <TvIcon className="w-6 h-6" />
            </div>
            <div>
              <span className="font-bold text-base text-slate-900 dark:text-white block">TV</span>
              <span className="text-[11px] font-semibold text-slate-400">{customer.tvService.channelsCount}+ Channels HD</span>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Active
          </span>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-2 gap-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">PLAN</span>
            <span className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
              {customer.tvService.packageName.replace(" Package", "")}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">EXPIRES</span>
            <span className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
              {customer.tvService.expiresAt.replace(" 2026", "")}
            </span>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigateTab("services")}
            className="w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-200 font-bold text-xs transition-all"
          >
            View Channels &amp; Upgrades
          </button>
        </div>
      </div>

      {/* 3. OUTSTANDING BALANCE CARD matching Screenshot */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 shadow-sm hover:shadow-md transition-all">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-11 h-11 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-100 dark:border-rose-900 flex items-center justify-center text-rose-500 shadow-sm">
            <BillIcon className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block">Outstanding Balance</span>
            <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              KES {customer.outstandingBalance > 0 ? "2,000.00" : "0.00"}
              <span className="text-xs font-semibold text-slate-400 ml-1.5">($45.00)</span>
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800/80 mb-3">
          <span>Due date</span>
          <span className="font-bold text-slate-700 dark:text-slate-200">Due by {customer.dueDate}</span>
        </div>

        <button
          type="button"
          onClick={() => onOpenPayModal("OUTSTANDING_BALANCE", 2000)}
          className="w-full h-12 py-3 px-4 rounded-2xl bg-[#090b4d] hover:bg-[#060835] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-950/20 transition-all active:scale-[0.99]"
        >
          <span>Pay Now</span>
          <ArrowRightIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Quick Shortcuts Bar */}
      <div className="pt-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1 mb-2 block">
          Quick Tools &amp; Actions
        </span>
        <div className="grid grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={onOpenSpeedTest}
            className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-left hover:border-blue-500/50 transition-all shadow-sm group"
          >
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <SpeedometerIcon className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">Speed Test</span>
            <span className="text-[10px] text-slate-400">Test Live Latency</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab("support")}
            className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-left hover:border-emerald-500/50 transition-all shadow-sm group"
          >
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <ShieldCheckIcon className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">System Status</span>
            <span className="text-[10px] text-emerald-500 font-semibold">● 100% Online</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab("profile")}
            className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-left hover:border-amber-500/50 transition-all shadow-sm group"
          >
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <Share2Icon className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">Refer &amp; Earn</span>
            <span className="text-[10px] text-amber-500 font-semibold">Earn KES 100</span>
          </button>
        </div>
      </div>
    </div>
  );
}
