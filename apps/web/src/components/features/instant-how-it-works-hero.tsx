"use client";

import { useState } from "react";
import { IconCheck, IconCopy, IconArrowRight, IconPulse, IconRouter, IconMpesa } from "@/components/icons";

export function InstantHowItWorksHero() {
  const [simState, setSimState] = useState<"idle" | "stk" | "auth" | "connected">("idle");
  const [revenue, setRevenue] = useState(4820);
  const [activeUsers, setActiveUsers] = useState(48);
  const [copied, setCopied] = useState(false);

  const triggerSimulation = () => {
    if (simState !== "idle" && simState !== "connected") return;
    setSimState("stk");

    setTimeout(() => {
      setSimState("auth");
      setTimeout(() => {
        setSimState("connected");
        setRevenue((prev) => prev + 10);
        setActiveUsers((prev) => prev + 1);
      }, 1000);
    }, 1200);
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(
      `/radius add address=68.210.187.104 secret=mkg_auto_auth service=hotspot,ppp; /ip hotspot profile set [find default=yes] use-radius=yes`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full max-w-5xl mx-auto mt-8 mb-16 text-left">
      {/* 3-Step Instant Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-6">
        {/* Step 1 */}
        <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-b from-cyan-950/40 via-slate-900/90 to-slate-950 p-4 shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-cyan-500/40 transition-all">
          <div className="flex items-center gap-3 mb-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400 font-mono text-xs font-black border border-cyan-500/30">
              1
            </span>
            <span className="text-xs font-black uppercase tracking-wider text-cyan-300">
              Plug In Router (30 Sec)
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Paste our 1-line script into your MikroTik WinBox. It links your router to the cloud instantly.
          </p>
        </div>

        {/* Step 2 */}
        <div className="rounded-2xl border border-sky-500/20 bg-gradient-to-b from-sky-950/40 via-slate-900/90 to-slate-950 p-4 shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-sky-500/40 transition-all">
          <div className="flex items-center gap-3 mb-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400 font-mono text-xs font-black border border-sky-500/30">
              2
            </span>
            <span className="text-xs font-black uppercase tracking-wider text-sky-300">
              Set Prices &amp; M-Pesa
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Choose voucher rates (e.g. 1hr = KES 10, 1day = KES 50) and link your Till or Paybill number.
          </p>
        </div>

        {/* Step 3 */}
        <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-emerald-950/40 via-slate-900/90 to-slate-950 p-4 shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-emerald-500/40 transition-all">
          <div className="flex items-center gap-3 mb-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 font-mono text-xs font-black border border-emerald-500/30">
              3
            </span>
            <span className="text-xs font-black uppercase tracking-wider text-emerald-300">
              Autopilot Profits
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Customers tap your Wi-Fi, pay on their phone, and get online automatically. Money goes to you.
          </p>
        </div>
      </div>

      {/* Interactive 3-Second Live Simulation Playground */}
      <div className="rounded-3xl border border-cyan-500/30 bg-slate-950/95 shadow-2xl p-5 sm:p-7 backdrop-blur-2xl ring-1 ring-cyan-500/20 relative overflow-hidden">
        {/* Glow ambient */}
        <div className="absolute top-0 right-1/4 w-80 h-32 bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-80 h-32 bg-emerald-500/10 blur-3xl pointer-events-none" />

        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="font-bold text-white tracking-wide uppercase font-mono text-[11px]">
              Interactive 3-Second Test · See It In Action
            </span>
          </div>

          <button
            type="button"
            onClick={triggerSimulation}
            className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-black text-xs shadow-lg shadow-cyan-500/20 active:scale-95 transition-all flex items-center gap-1.5"
          >
            <span>{simState === "connected" ? "🔄 Run Again" : "▶️ Click To Test Customer Connecting"}</span>
          </button>
        </div>

        {/* 3-Column Visual Flow */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center mt-6">
          {/* Column 1: Customer Phone Mockup (4 cols) */}
          <div className="lg:col-span-4 rounded-2xl bg-slate-900 border border-slate-800 p-4 shadow-xl flex flex-col justify-between h-[280px] relative overflow-hidden">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-[10px] font-mono text-slate-400">
              <span className="flex items-center gap-1 text-cyan-400 font-bold">
                <span>📶</span>
                <span>Customer Wi-Fi</span>
              </span>
              <span>100% Signal</span>
            </div>

            {/* Phone Screen States */}
            {simState === "idle" && (
              <div className="space-y-2.5 my-auto">
                <div className="text-center">
                  <div className="text-xs font-black text-white">Select Internet Package</div>
                  <div className="text-[10px] text-slate-400">Captive portal opens automatically</div>
                </div>
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={triggerSimulation}
                    className="w-full p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/40 hover:bg-cyan-500/20 text-white text-xs font-bold flex items-center justify-between group transition-all"
                  >
                    <span>⚡ 1 Hour Unlimited</span>
                    <span className="font-mono text-cyan-400 font-black">KES 10</span>
                  </button>
                  <div className="w-full p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 text-slate-400 text-[11px] flex items-center justify-between opacity-70">
                    <span>🌟 24 Hours Unlimited</span>
                    <span className="font-mono">KES 50</span>
                  </div>
                </div>
                <div className="text-center text-[10px] text-cyan-300 font-semibold animate-pulse">
                  👆 Tap &ldquo;KES 10&rdquo; above to simulate purchase!
                </div>
              </div>
            )}

            {simState === "stk" && (
              <div className="my-auto text-center space-y-3 p-3 rounded-xl bg-slate-950 border border-emerald-500/40 animate-pulse">
                <div className="text-2xl">📱</div>
                <div className="text-xs font-black text-emerald-400">Safaricom M-Pesa Prompt</div>
                <div className="text-[10px] text-slate-300 font-mono bg-slate-900 p-2 rounded border border-slate-800">
                  Pay KES 10.00 to MashupHost? <br />
                  <span className="text-emerald-400 font-bold">PIN: •••• [Auto-Approved]</span>
                </div>
              </div>
            )}

            {(simState === "auth" || simState === "connected") && (
              <div className="my-auto text-center space-y-2 p-3 rounded-xl bg-slate-950 border border-emerald-500/40">
                <div className="h-9 w-9 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto text-lg">
                  ✓
                </div>
                <div className="text-xs font-black text-white">Connected to Internet!</div>
                <div className="text-[10px] text-emerald-400 font-mono font-bold">
                  15.0 Mbps · Voucher Activated
                </div>
                <div className="text-[9px] text-slate-400">Expires in 59m 59s</div>
              </div>
            )}

            <div className="text-[10px] text-center text-slate-500 font-mono">
              Captive Portal · Direct to Phone
            </div>
          </div>

          {/* Column 2: The 1.2s Real-Time Pulse Pipeline (4 cols) */}
          <div className="lg:col-span-4 flex flex-col items-center justify-center text-center space-y-4 py-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-cyan-500/30 text-cyan-300 font-mono text-[11px] font-bold shadow-sm">
              <IconPulse size={14} className="text-cyan-400 animate-spin" />
              <span>1.2s Real-Time Pipeline</span>
            </div>

            {/* Glowing Pipeline Connectors */}
            <div className="w-full space-y-2.5 px-2">
              <div
                className={`p-2.5 rounded-xl border text-xs font-mono font-bold flex items-center justify-between transition-all ${
                  simState === "stk" || simState === "auth" || simState === "connected"
                    ? "bg-emerald-950/60 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-500/10"
                    : "bg-slate-900/60 border-slate-800 text-slate-500"
                }`}
              >
                <span>1. Safaricom STK Push</span>
                <span>{simState !== "idle" ? "✓ KES 10 Received" : "Waiting"}</span>
              </div>

              <div
                className={`p-2.5 rounded-xl border text-xs font-mono font-bold flex items-center justify-between transition-all ${
                  simState === "auth" || simState === "connected"
                    ? "bg-cyan-950/60 border-cyan-500 text-cyan-300 shadow-md shadow-cyan-500/10"
                    : "bg-slate-900/60 border-slate-800 text-slate-500"
                }`}
              >
                <span>2. Cloud RADIUS 3.2</span>
                <span>{simState === "auth" || simState === "connected" ? "✓ Auth OK (1.8ms)" : "Ready"}</span>
              </div>

              <div
                className={`p-2.5 rounded-xl border text-xs font-mono font-bold flex items-center justify-between transition-all ${
                  simState === "connected"
                    ? "bg-emerald-950/60 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-500/10"
                    : "bg-slate-900/60 border-slate-800 text-slate-500"
                }`}
              >
                <span>3. MikroTik Router</span>
                <span>{simState === "connected" ? "✓ Speed Un-throttled" : "Standby"}</span>
              </div>
            </div>

            <div className="text-[10px] text-slate-400">
              Zero manual staff work. 100% automated by code.
            </div>
          </div>

          {/* Column 3: Your Owner Dashboard (4 cols) */}
          <div className="lg:col-span-4 rounded-2xl bg-slate-900 border border-slate-800 p-4 shadow-xl flex flex-col justify-between h-[280px] relative overflow-hidden">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-[10px] font-mono text-slate-400">
              <span className="flex items-center gap-1 text-emerald-400 font-bold">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span>Your ISP Owner Dashboard</span>
              </span>
              <span className="text-slate-500">Live Telemetry</span>
            </div>

            <div className="space-y-3 my-auto">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-400 font-mono">Total Collected Today (M-Pesa)</div>
                <div className="text-2xl font-black font-mono text-emerald-400 flex items-center justify-between">
                  <span>KES {revenue.toLocaleString()}.00</span>
                  {simState === "connected" && (
                    <span className="text-xs font-bold text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-full animate-bounce">
                      +KES 10.00
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Active Users</div>
                  <div className="font-black text-white text-base mt-0.5">{activeUsers} Online</div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Router Health</div>
                  <div className="font-black text-cyan-400 text-base mt-0.5">100% Online</div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[10px] font-mono text-slate-400">
              <span>Money straight to your Till/Paybill</span>
              <span className="text-emerald-400 font-bold">0% Leakage</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
