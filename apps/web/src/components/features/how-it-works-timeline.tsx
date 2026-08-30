"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";
import { IconCheck, IconCopy, IconArrowRight } from "@/components/icons";

export function HowItWorksTimeline() {
  const [copied, setCopied] = useState(false);
  const setupScript = `/radius add address=radius.mashupkgrid.com secret=mkg_live_prod_key service=ppp,hotspot authentication-port=1812 accounting-port=1813 timeout=3000ms comment="Mashupkgrid Core"`;

  const copyScript = () => {
    navigator.clipboard.writeText(setupScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/95 shadow-2xl p-6 lg:p-8 backdrop-blur-xl space-y-8">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <Badge variant="info">Frictionless Onboarding</Badge>
        <h3 className="text-2xl sm:text-3xl font-black text-white">
          Up and Running in 3 Simple Steps
        </h3>
        <p className="text-xs sm:text-sm text-slate-400">
          No complex Linux servers or weeks of setup. Connect your MikroTik router, link your Safaricom Paybill, and start billing in under 15 minutes.
        </p>
      </div>

      {/* 3 Step Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
        {/* Step 1 */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4 relative flex flex-col justify-between shadow-xl">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="h-9 w-9 rounded-xl bg-brand-600/20 border border-brand-500/40 text-brand-400 font-bold flex items-center justify-center text-sm font-mono">
                01
              </span>
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800 px-2 py-0.5 rounded">
                30 Seconds
              </span>
            </div>
            <h4 className="text-base font-bold text-white">Connect Your MikroTik</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Paste our 1-line setup command into your Winbox terminal or SSH console. Compatible with RouterOS v7 and v6 on any CCR, RB, or CHR hardware.
            </p>
          </div>

          <div className="pt-2">
            <button
              onClick={copyScript}
              className="w-full py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] font-mono text-slate-300 flex items-center justify-center gap-1.5 transition-colors"
            >
              {copied ? <IconCheck size={13} className="text-emerald-400" /> : <IconCopy size={13} />}
              <span>{copied ? "Copied Script!" : "Copy Setup Script"}</span>
            </button>
          </div>
        </div>

        {/* Step 2 */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4 relative flex flex-col justify-between shadow-xl">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="h-9 w-9 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 font-bold flex items-center justify-center text-sm font-mono">
                02
              </span>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 rounded">
                Direct Webhook
              </span>
            </div>
            <h4 className="text-base font-bold text-white">Link Safaricom M-Pesa</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Enter your Safaricom Paybill or Till Consumer Key &amp; Secret. Incoming C2B and STK Push payments are automatically matched to subscriber balances in real time.
            </p>
          </div>

          <div className="rounded-lg bg-slate-950 p-3 border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1">
            <div className="flex justify-between">
              <span>Daraja API:</span>
              <span className="text-emerald-400 font-bold">2.0 REST</span>
            </div>
            <div className="flex justify-between">
              <span>Ledger Match:</span>
              <span className="text-white font-bold">Automatic &lt; 1s</span>
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4 relative flex flex-col justify-between shadow-xl">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="h-9 w-9 rounded-xl bg-indigo-600/20 border border-indigo-500/40 text-indigo-400 font-bold flex items-center justify-center text-sm font-mono">
                03
              </span>
              <span className="text-[10px] font-mono text-indigo-400 bg-indigo-950/60 border border-indigo-800 px-2 py-0.5 rounded">
                Complete Autopilot
              </span>
            </div>
            <h4 className="text-base font-bold text-white">Sit Back &amp; Scale</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              New subscribers are provisioned automatically. Overdue accounts are gracefully suspended with friendly captive portal reminders, and payments restore access in 2 seconds.
            </p>
          </div>

          <div className="rounded-lg bg-slate-950 p-3 border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1">
            <div className="flex justify-between">
              <span>Revenue Leakage:</span>
              <span className="text-emerald-400 font-bold">0.00%</span>
            </div>
            <div className="flex justify-between">
              <span>Manual Admin Work:</span>
              <span className="text-white font-bold">Eliminated</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
