"use client";

import Link from "next/link";
import { IconLock, IconShield, IconSparkles } from "@/components/icons";

export function TrialExpiredBlocker() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] py-12 px-4 text-center">
      <div className="max-w-md w-full bg-white dark:bg-obsidian-900 border border-rose-200 dark:border-rose-900/60 rounded-3xl p-8 shadow-xl relative overflow-hidden">
        {/* Top accent badge */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-rose-500 via-amber-500 to-rose-500" />
        
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 mb-6 border border-rose-200/60 dark:border-rose-800/40 shadow-inner">
          <IconLock size={32} />
        </div>

        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight mb-2">
          Your Free Trial Has Ended
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
          Your 7-day trial period has concluded. All tenant features—including MikroTik router sync, customer bandwidth control, M-Pesa billing, and hotspot voucher generation—are paused until a plan is activated.
        </p>

        <div className="space-y-3 mb-6">
          <Link
            href="/settings/billing"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 px-5 py-3 text-sm font-semibold text-white shadow-md transition-all active:scale-[0.98]"
          >
            <IconSparkles size={16} />
            <span>Activate Subscription &amp; Unlock Features</span>
          </Link>
          <Link
            href="/settings/account"
            className="flex w-full items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-obsidian-800/60 px-4 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-obsidian-800 transition-colors"
          >
            Account Profile Settings
          </Link>
        </div>

        <div className="flex items-center justify-center gap-2 text-xs text-slate-400 dark:text-slate-500">
          <IconShield size={14} className="text-emerald-500" />
          <span>Your customer and router data is safely preserved.</span>
        </div>
      </div>
    </div>
  );
}
