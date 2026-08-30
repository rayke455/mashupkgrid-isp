"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";

export function OutageAiDetector() {
  const [outageState, setOutageState] = useState<"healthy" | "cut" | "repaired">("healthy");
  const [splicingProgress, setSplicingProgress] = useState(0);

  const triggerCut = () => {
    setOutageState("cut");
    setSplicingProgress(0);
  };

  const triggerRepair = () => {
    setOutageState("repaired");
    let progress = 0;
    const interval = setInterval(() => {
      progress += 25;
      setSplicingProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        setTimeout(() => setOutageState("healthy"), 1200);
      }
    }, 400);
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/95 shadow-2xl p-6 lg:p-8 backdrop-blur-xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant={outageState === "healthy" ? "success" : "danger"}>
              {outageState === "healthy" ? "AI Telemetry Active" : "Fiber Cut Alert"}
            </Badge>
            <span className="text-xs font-mono text-cyan-400 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
              <span>OTDR Micro-Reflection Monitoring</span>
            </span>
          </div>
          <h3 className="text-xl font-bold text-white mt-1">
            AI Optical Outage &amp; Fiber Cut Pinpointer
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Cross-correlate sub-second optical signal drops (dBm) and simultaneous PPPoE disconnects to locate physical fiber cuts and dispatch repair crews automatically.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3 text-xs font-mono">
          {outageState === "healthy" ? (
            <button
              onClick={triggerCut}
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold transition-all shadow-glow flex items-center gap-2"
            >
              <span className="h-2 w-2 rounded-full bg-white animate-ping" />
              <span>Simulate Fiber Cut (Trunk-B)</span>
            </button>
          ) : (
            <button
              onClick={triggerRepair}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-glow-emerald flex items-center gap-2"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-300" />
              <span>Splice Fiber &amp; Restore Link</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Grid */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Optical Network Topology Diagram */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-slate-800 p-6 space-y-6 overflow-hidden">
            <div className="flex items-center justify-between text-xs font-mono border-b border-slate-800/80 pb-3">
              <span className="text-slate-400">Backbone Trunk: Nairobi Westlands Feeder #04</span>
              <span className={outageState === "healthy" ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                {outageState === "healthy" ? "Optical Link: UP (0.21 dB/km)" : "Optical Link: SEVERED (LOS)"}
              </span>
            </div>

            {/* Topology Line Diagram */}
            <div className="relative py-4">
              <div className="flex items-center justify-between text-center relative z-10">
                {/* Node 1: OLT Core */}
                <div className="w-24 space-y-1">
                  <div className="mx-auto h-12 w-12 rounded-xl bg-slate-900 border-2 border-cyan-500/40 flex items-center justify-center text-cyan-400 font-bold text-xs shadow-glow">
                    OLT-01
                  </div>
                  <div className="text-[10px] font-mono text-slate-400">Core Exchange</div>
                  <div className="text-[9px] font-mono text-emerald-400">Tx: +2.4 dBm</div>
                </div>

                {/* Cable Segment 1 */}
                <div className="flex-1 mx-2 relative flex items-center">
                  <div className="h-1.5 w-full bg-cyan-950 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 w-full animate-pulse" />
                  </div>
                </div>

                {/* Node 2: The Cut Point Indicator */}
                <div className="w-28 space-y-1">
                  <div
                    className={`mx-auto h-12 w-12 rounded-xl flex items-center justify-center font-bold text-xs transition-all ${
                      outageState === "healthy"
                        ? "bg-slate-900 border-2 border-emerald-500/40 text-emerald-400"
                        : "bg-rose-950 border-2 border-rose-500 text-rose-400 animate-ping"
                    }`}
                  >
                    {outageState === "healthy" ? "Trunk-B" : "CUT!"}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400">Waiyaki Way</div>
                  <div className="text-[9px] font-mono text-slate-500">KM 4.28 mark</div>
                </div>

                {/* Cable Segment 2 */}
                <div className="flex-1 mx-2 relative flex items-center">
                  <div
                    className={`h-1.5 w-full rounded-full transition-all ${
                      outageState === "healthy" ? "bg-cyan-950 overflow-hidden" : "bg-rose-950"
                    }`}
                  >
                    {outageState === "healthy" && (
                      <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 w-full animate-pulse" />
                    )}
                  </div>
                </div>

                {/* Node 3: Splitter & Subscribers */}
                <div className="w-24 space-y-1">
                  <div
                    className={`mx-auto h-12 w-12 rounded-xl flex items-center justify-center font-bold text-xs transition-all ${
                      outageState === "healthy"
                        ? "bg-slate-900 border-2 border-emerald-500/40 text-emerald-400"
                        : "bg-slate-900 border-2 border-rose-500 text-rose-400"
                    }`}
                  >
                    1:64 DP
                  </div>
                  <div className="text-[10px] font-mono text-slate-400">64 Clients</div>
                  <div className="text-[9px] font-mono text-rose-400">
                    {outageState === "healthy" ? "Rx: -18.6 dBm" : "Rx: -inf (LOS)"}
                  </div>
                </div>
              </div>
            </div>

            {/* Repair Progress Bar if repairing */}
            {outageState === "repaired" && (
              <div className="space-y-1 text-xs font-mono pt-2">
                <div className="flex justify-between text-slate-300">
                  <span>Fusion Splicer Alignment Progress:</span>
                  <span className="text-emerald-400 font-bold">{splicingProgress}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                    style={{ width: `${splicingProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Real-time Optical Metrics */}
          <div className="grid grid-cols-3 gap-3 font-mono text-xs">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 space-y-1">
              <span className="text-slate-500 text-[11px] block">Active PPPoE Sessions</span>
              <span className={`text-xl font-bold ${outageState === "healthy" ? "text-white" : "text-rose-400"}`}>
                {outageState === "healthy" ? "1,482" : "1,418 (-64)"}
              </span>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 space-y-1">
              <span className="text-slate-500 text-[11px] block">Mean Time to Pinpoint</span>
              <span className="text-xl font-bold text-cyan-400">&lt; 1.4s</span>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 space-y-1">
              <span className="text-slate-500 text-[11px] block">Estimated Cut Location</span>
              <span className="text-sm font-bold text-white truncate">
                {outageState === "healthy" ? "None (0 faults)" : "Waiyaki Way KM 4.28"}
              </span>
            </div>
          </div>
        </div>

        {/* Right: AI Diagnostic Report & Automated Dispatch Feed */}
        <div className="lg:col-span-5 space-y-4 text-left font-mono text-xs">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-white font-bold flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                <span>Automated Incident Root-Cause Engine</span>
              </span>
              <span className="text-[10px] text-slate-500">Incident #INC-8921</span>
            </div>

            {outageState === "healthy" ? (
              <div className="space-y-2 text-slate-300 py-2">
                <div className="flex items-center gap-2 text-emerald-400">
                  <span>✓</span>
                  <span>All 12 Optical Trunk routes operating at optimal dBm</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <span>✓</span>
                  <span>Zero micro-bending reflectance anomalies detected</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <span>✓</span>
                  <span>MikroTik RouterOS API streaming live telemetry</span>
                </div>
              </div>
            ) : (
              <div className="space-y-3 py-1">
                <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-500/40 text-rose-300 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-rose-900 text-white text-[9px] uppercase font-mono font-bold">
                      FAULT DETECTED
                    </span>
                    <span>Physical Fiber Severance</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    OTDR reflectance spike detected exactly 4.28 km from OLT-01. 64 subscriber ONTs simultaneous Loss-Of-Signal (LOS).
                  </p>
                </div>

                {/* Automated Dispatch Actions */}
                <div className="space-y-2 text-[11px]">
                  <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-slate-300 flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 mt-1.5 shrink-0" />
                    <div>
                      <span className="text-white font-bold block">Technician Dispatched</span>
                      <span>Alerted Splicing Team Leader Kelvin via Telegram &amp; SMS.</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-slate-300 flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                    <div>
                      <span className="text-white font-bold block">Customer SMS Broadcast Sent</span>
                      <span>64 subscribers notified: &quot;Fiber repair underway. ETA: 45m&quot;</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
