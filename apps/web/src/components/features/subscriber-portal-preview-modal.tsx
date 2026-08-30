"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";
import { IconCheck, IconMpesa } from "@/components/icons";

export function SubscriberPortalPreviewModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [stkTriggered, setStkTriggered] = useState(false);

  const handlePay = () => {
    setStkTriggered(true);
    setTimeout(() => setStkTriggered(false), 3000);
  };

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="px-6 py-3 rounded-xl border border-slate-700 hover:border-slate-500 bg-slate-800/80 hover:bg-slate-700/80 text-white font-bold text-sm transition-all flex items-center gap-2 shadow-lg"
      >
        <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
        <span>Preview Subscriber Portal</span>
      </button>

      {/* Modal Backdrop */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-950 shadow-2xl p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto text-left font-sans animate-in fade-in zoom-in-95 duration-200">
            {/* Top Bar */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="text-white font-bold">portal.nairobibroadband.co.ke</span>
                <span>(Subscriber Self-Service)</span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="h-8 w-8 rounded-full bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-sm"
              >
                ✕
              </button>
            </div>

            {/* Subscriber Header Card */}
            <div className="rounded-2xl bg-gradient-to-r from-brand-600/20 via-indigo-600/20 to-emerald-600/20 border border-slate-800 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-lg font-bold text-white">Brian Kimani</h4>
                  <Badge variant="success">Active Online</Badge>
                </div>
                <div className="text-xs font-mono text-slate-400 mt-0.5">
                  Account: ACC-89210 · PPPoE IP: 100.64.12.8 · Router: CCR2004
                </div>
              </div>

              <div className="text-right font-mono">
                <div className="text-[10px] text-slate-400">Plan Renewal Due</div>
                <div className="text-xl font-black text-emerald-400">KES 3,500</div>
              </div>
            </div>

            {/* Active Subscription & M-Pesa STK Renew Card */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2">
                <span className="text-[11px] font-mono text-slate-500 uppercase block">Active Package</span>
                <div className="text-base font-black text-white">Gold Home Fiber 50M</div>
                <div className="text-xs text-slate-400">50 Mbps Down / 50 Mbps Up (Uncapped)</div>
                <div className="text-[11px] font-mono text-cyan-400 pt-1">Expires: Sept 1, 2026 (In 3 Days)</div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2 flex flex-col justify-between">
                <div>
                  <span className="text-[11px] font-mono text-slate-500 uppercase block">Instant M-Pesa Payment</span>
                  <div className="text-xs text-slate-300">Prompt sent to registered phone (0712***081)</div>
                </div>

                {stkTriggered ? (
                  <div className="p-2.5 rounded-lg bg-emerald-950 border border-emerald-500/50 text-center text-xs font-mono text-emerald-300 flex items-center justify-center gap-1.5 animate-pulse">
                    <IconCheck size={14} />
                    <span>STK Prompt Dispatched! Check Phone.</span>
                  </div>
                ) : (
                  <button
                    onClick={handlePay}
                    className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-glow-emerald transition-all flex items-center justify-center gap-2"
                  >
                    <IconMpesa size={16} />
                    <span>Renew Now for KES 3,500</span>
                  </button>
                )}
              </div>
            </div>

            {/* Live Speed & Wi-Fi Management Strip */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between text-slate-400 pb-2 border-b border-slate-800">
                <span className="text-white font-semibold">Self-Service Actions</span>
                <span className="text-emerald-400">Zero Support Calls</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 text-[10px] block">Wi-Fi Password</span>
                  <span className="text-white font-bold">Change Online</span>
                </div>
                <div className="p-2 rounded bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 text-[10px] block">Invoice PDF</span>
                  <span className="text-cyan-400 font-bold">Download</span>
                </div>
                <div className="p-2 rounded bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 text-[10px] block">Speed Upgrade</span>
                  <span className="text-brand-400 font-bold">1-Click 100M</span>
                </div>
              </div>
            </div>

            <div className="text-center pt-2">
              <button
                onClick={() => setIsOpen(false)}
                className="text-xs font-mono text-slate-400 hover:text-white transition-colors"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
