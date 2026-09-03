"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui";
import { IconCheck } from "@/components/icons";

export function PortalSpeedometer() {
  const [testing, setTesting] = useState(false);
  const [stage, setStage] = useState<"idle" | "ping" | "download" | "upload" | "done">("idle");
  const [downloadSpeed, setDownloadSpeed] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [ping, setPing] = useState(0);
  const [jitter, setJitter] = useState(0);

  const startTest = () => {
    setTesting(true);
    setStage("ping");
    setDownloadSpeed(0);
    setUploadSpeed(0);
    setPing(0);
    setJitter(0);

    // Stage 1: Ping (0 - 800ms)
    setTimeout(() => {
      setPing(2.1);
      setJitter(0.3);
      setStage("download");
    }, 800);
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (stage === "download") {
      let current = 0;
      interval = setInterval(() => {
        current += Math.random() * 14 + 4;
        if (current >= 94.8) {
          current = 94.8;
          clearInterval(interval);
          setDownloadSpeed(94.8);
          setTimeout(() => setStage("upload"), 600);
        } else {
          setDownloadSpeed(Math.round(current * 10) / 10);
        }
      }, 80);
    } else if (stage === "upload") {
      let current = 0;
      interval = setInterval(() => {
        current += Math.random() * 12 + 4;
        if (current >= 92.4) {
          current = 92.4;
          clearInterval(interval);
          setUploadSpeed(92.4);
          setStage("done");
          setTesting(false);
        } else {
          setUploadSpeed(Math.round(current * 10) / 10);
        }
      }, 80);
    }
    return () => clearInterval(interval);
  }, [stage]);

  // Current display speed on needle
  const activeSpeed = stage === "download" ? downloadSpeed : stage === "upload" ? uploadSpeed : stage === "done" ? downloadSpeed : 0;
  // Map 0 - 100 Mbps to -90 to +90 degrees rotation
  const needleAngle = -90 + (Math.min(activeSpeed, 100) / 100) * 180;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/95 shadow-2xl p-6 lg:p-8 backdrop-blur-xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="info">In-Portal Speedometer</Badge>
            <span className="text-xs font-mono text-cyan-400 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
              <span>Direct Peering Test Server</span>
            </span>
          </div>
          <h3 className="text-xl font-bold text-white mt-1">
            Subscriber Speedometer &amp; Real-Time Bandwidth Engine
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Embed an Ookla-grade HTML5 bandwidth speedometer directly into customer self-service portals, testing to local cache servers with 0 latency bias.
          </p>
        </div>

        <button
          onClick={startTest}
          disabled={testing}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-cyan-600 hover:from-brand-500 hover:to-cyan-500 text-white font-bold text-xs shadow-glow transition-all disabled:opacity-50"
        >
          {testing ? "Testing Link..." : "Start Speed Test"}
        </button>
      </div>

      {/* Main Grid */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left: Speedometer Gauge Dial Graphic */}
        <div className="lg:col-span-7 flex flex-col items-center justify-center">
          <div className="relative w-72 h-44 sm:w-80 sm:h-48 overflow-hidden flex items-end justify-center">
            {/* Speedometer Arc SVG */}
            <svg className="w-full h-full" viewBox="0 0 200 120">
              <defs>
                <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#06b6d4" />
                  <stop offset="50%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
              </defs>

              {/* Background Arc */}
              <path
                d="M 20 100 A 80 80 0 0 1 180 100"
                fill="none"
                stroke="#1e293b"
                strokeWidth="14"
                strokeLinecap="round"
              />

              {/* Active Colored Arc */}
              <path
                d="M 20 100 A 80 80 0 0 1 180 100"
                fill="none"
                stroke="url(#gaugeGrad)"
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray="251.2"
                strokeDashoffset={251.2 - (Math.min(activeSpeed, 100) / 100) * 251.2}
                className="transition-all duration-100"
              />

              {/* Needle Pivot Center */}
              <circle cx="100" cy="100" r="8" fill="#0f172a" stroke="#06b6d4" strokeWidth="3" />
            </svg>

            {/* Rotating Gauge Needle */}
            <div
              className="absolute bottom-0 w-1.5 h-28 bg-gradient-to-t from-cyan-400 to-white rounded-full origin-bottom shadow-glow transition-transform duration-100 ease-out"
              style={{ transform: `rotate(${needleAngle}deg)` }}
            />
          </div>

          {/* Speed Digital Readout */}
          <div className="text-center mt-3 space-y-0.5 font-mono">
            <div className="text-4xl sm:text-5xl font-black text-white tracking-tight">
              {activeSpeed.toFixed(1)}
              <span className="text-sm font-normal text-cyan-400 ml-1.5">Mbps</span>
            </div>
            <div className="text-xs text-slate-400">
              {stage === "idle" && "Ready to benchmark local connection"}
              {stage === "ping" && "Measuring KIXP peering latency..."}
              {stage === "download" && "Testing Downstream Throughput..."}
              {stage === "upload" && "Testing Upstream Throughput..."}
              {stage === "done" && "Benchmark Complete · Full Duplex"}
            </div>
          </div>
        </div>

        {/* Right: Metrics Strip & ISP Speed Certificate */}
        <div className="lg:col-span-5 space-y-4 text-left font-mono text-xs">
          {/* Latency & Throughput Matrix */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <span className="text-slate-400 text-[11px] block">Ping to KIXP</span>
              <span className="text-xl font-bold text-emerald-400">{ping > 0 ? `${ping} ms` : "--"}</span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <span className="text-slate-400 text-[11px] block">Jitter</span>
              <span className="text-xl font-bold text-white">{jitter > 0 ? `${jitter} ms` : "--"}</span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <span className="text-slate-400 text-[11px] block">Download</span>
              <span className="text-xl font-bold text-cyan-400">{downloadSpeed > 0 ? `${downloadSpeed} Mbps` : "--"}</span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <span className="text-slate-400 text-[11px] block">Upload</span>
              <span className="text-xl font-bold text-emerald-400">{uploadSpeed > 0 ? `${uploadSpeed} Mbps` : "--"}</span>
            </div>
          </div>

          {/* ISP Verified Certificate Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3 shadow-inner">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-white font-bold flex items-center gap-1.5">
                <IconCheck size={14} className="text-emerald-400" />
                <span>Verified Speed Certificate</span>
              </span>
              <span className="text-[10px] text-brand-400">MikroTik QoS Tier</span>
            </div>

            <div className="space-y-1.5 text-slate-300 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">RADIUS Profile:</span>
                <span className="font-bold text-white">Gold Home 100M Plan</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Framing Protocol:</span>
                <span className="font-bold text-white">PPPoE / MTU 1492</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Packet Loss:</span>
                <span className="font-bold text-emerald-400">0.00% (Lossless)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Server Host:</span>
                <span className="font-bold text-slate-300">Nairobi Data Center 01</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
