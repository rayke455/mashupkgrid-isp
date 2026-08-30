"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui";

export function NetworkCablesAnimation({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  const [activeMode, setActiveMode] = useState<"both" | "fiber" | "ethernet">("both");
  const [packetCount, setPacketCount] = useState(148200);
  const [speedMode, setSpeedMode] = useState<"normal" | "turbo">("turbo");
  const [burstActive, setBurstActive] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setPacketCount((prev) => prev + Math.floor(Math.random() * 12) + 8);
    }, 400);
    return () => clearInterval(interval);
  }, []);

  const triggerBurst = () => {
    setBurstActive(true);
    setPacketCount((prev) => prev + 500);
    setTimeout(() => setBurstActive(false), 1500);
  };

  if (compact) {
    // Compact widget for Login / Register showcase sidebars
    return (
      <div className={`rounded-xl border border-slate-800 bg-slate-950/90 p-4 shadow-xl overflow-hidden ${className}`}>
        <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
            </span>
            <span className="font-bold text-white">Live Physical Layer</span>
          </div>
          <span className="text-[10px] text-cyan-400 font-mono">10G SFP+ &amp; Cat6A</span>
        </div>

        {/* Mini Optical Fiber */}
        <div className="space-y-1 mb-3">
          <div className="flex justify-between text-[11px] font-mono text-slate-400">
            <span className="flex items-center gap-1.5 text-cyan-300 font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
              Optical Fiber (Tx/Rx 1310nm)
            </span>
            <span className="text-emerald-400">-2.4 dBm</span>
          </div>
          <div className="relative h-4 w-full rounded-full bg-slate-900 border border-slate-800 overflow-hidden flex items-center px-1">
            <div className="absolute inset-x-0 h-1 bg-cyan-950" />
            {/* Animated Laser Light Core */}
            <svg className="w-full h-3 overflow-visible" preserveAspectRatio="none">
              <line
                x1="0"
                y1="6"
                x2="100%"
                y2="6"
                stroke="url(#fiberMiniGrad)"
                strokeWidth="2.5"
                className="animate-fiber-laser-fast"
              />
              <defs>
                <linearGradient id="fiberMiniGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#06b6d4" />
                  <stop offset="50%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>

        {/* Mini Cat6A Ethernet Twisted Pairs */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] font-mono text-slate-400">
            <span className="flex items-center gap-1.5 text-amber-300 font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-led-blink" />
              RJ45 Ethernet (Cat6A 10GBASE-T)
            </span>
            <span className="text-white">MTU 1500</span>
          </div>
          <div className="relative h-4 w-full rounded-full bg-slate-900 border border-slate-800 overflow-hidden flex items-center px-1">
            <div className="absolute inset-x-0 h-1 bg-amber-950" />
            <svg className="w-full h-3 overflow-visible" preserveAspectRatio="none">
              <line
                x1="0"
                y1="6"
                x2="100%"
                y2="6"
                stroke="#f59e0b"
                strokeWidth="2"
                className="animate-ethernet-pulse"
              />
            </svg>
          </div>
        </div>

        <div className="mt-3 pt-2 border-t border-slate-900 flex justify-between items-center text-[10px] font-mono text-slate-500">
          <span>Packets: {packetCount.toLocaleString()}</span>
          <span className="text-emerald-400">Zero Bit Errors</span>
        </div>
      </div>
    );
  }

  // Full High-Impact Showcase Component for Main Landing Page
  return (
    <div className={`rounded-2xl border border-slate-800 bg-slate-950/95 shadow-2xl p-6 lg:p-8 backdrop-blur-xl relative overflow-hidden ${className}`}>
      {/* Top Header & Interactive Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="info">Physical Layer Telemetry</Badge>
            <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Optics &amp; Copper Active</span>
            </span>
          </div>
          <h3 className="text-xl font-bold text-white mt-1">
            Optical Fiber &amp; 10Gbps Ethernet Data Pipeline
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Photonic single-mode laser transport &amp; Cat6A twisted-pair transmission with live RouterOS interface polling.
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
          {/* Mode Switcher */}
          <div className="inline-flex rounded-lg bg-slate-900 border border-slate-800 p-1">
            <button
              onClick={() => setActiveMode("both")}
              className={`px-3 py-1 rounded transition-all ${
                activeMode === "both" ? "bg-brand-600 text-white font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              Full Link (Optics + Copper)
            </button>
            <button
              onClick={() => setActiveMode("fiber")}
              className={`px-3 py-1 rounded transition-all ${
                activeMode === "fiber" ? "bg-cyan-600 text-white font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              Optical Wire Only
            </button>
            <button
              onClick={() => setActiveMode("ethernet")}
              className={`px-3 py-1 rounded transition-all ${
                activeMode === "ethernet" ? "bg-amber-600 text-white font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              Ethernet RJ45 Only
            </button>
          </div>

          <button
            onClick={triggerBurst}
            className={`px-3 py-1.5 rounded-lg border font-bold transition-all flex items-center gap-1.5 ${
              burstActive
                ? "bg-emerald-600 border-emerald-500 text-white shadow-glow-emerald"
                : "bg-slate-900 hover:bg-slate-800 border-slate-700 text-cyan-300"
            }`}
          >
            <span>{burstActive ? "⚡ Bursting Laser Packets!" : "Send Laser Burst"}</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* CABLE 1: OPTICAL FIBER WIRE (SINGLE-MODE OS2 1310nm / 1550nm) */}
      {/* ========================================================================= */}
      {(activeMode === "both" || activeMode === "fiber") && (
        <div className="mt-8 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xs">
                λ
              </div>
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Single-Mode Optical Fiber Wire (OS2 G.652.D)</span>
                  <span className="text-[10px] font-mono bg-cyan-950 border border-cyan-800 text-cyan-300 px-2 py-0.2 rounded">
                    Laser WDM: 1310nm / 1550nm
                  </span>
                </h4>
                <p className="text-[11px] text-slate-400">
                  Total internal reflection through 9/125µm silica glass core with low attenuation.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono text-slate-300 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
              <div>
                <span className="text-slate-500">Tx Laser: </span>
                <span className="text-cyan-400 font-bold">+2.4 dBm</span>
              </div>
              <div className="text-slate-700">|</div>
              <div>
                <span className="text-slate-500">Rx Power: </span>
                <span className="text-emerald-400 font-bold">-18.6 dBm</span>
              </div>
              <div className="text-slate-700">|</div>
              <div>
                <span className="text-slate-500">Dispersion: </span>
                <span className="text-white font-bold">0.18 ps/(nm·km)</span>
              </div>
            </div>
          </div>

          {/* Visual Optical Cable Strand with Photonic Flow */}
          <div className="relative rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-slate-800 p-6 overflow-hidden">
            {/* Ambient Optical Glow */}
            <div className="absolute inset-0 bg-radial-glow pointer-events-none opacity-40" />

            {/* Left Transceiver Module (OLT / Core Gateway) */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
              {/* SFP+ Transceiver Left */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="w-28 p-2.5 rounded-xl bg-slate-900 border-2 border-cyan-500/40 shadow-glow text-center font-mono">
                  <div className="text-[10px] text-cyan-400 font-bold">10GBASE-LR</div>
                  <div className="text-[9px] text-slate-500">SFP+ Transceiver</div>
                  <div className="mt-1.5 flex items-center justify-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
                    <span className="text-[9px] text-emerald-400 font-bold">LASER ON</span>
                  </div>
                </div>
                <div className="hidden sm:block text-slate-600 font-mono text-[10px]">
                  <span>Tx/Rx 1</span>
                </div>
              </div>

              {/* Center Fiber Strand SVG Pipeline */}
              <div className="flex-1 w-full relative py-2">
                {/* Yellow Fiber Cladding Jacket */}
                <div className="relative h-12 rounded-xl bg-gradient-to-b from-yellow-500/20 via-yellow-600/10 to-yellow-500/20 border border-yellow-500/30 flex flex-col justify-center px-4 overflow-hidden shadow-inner">
                  {/* Outer buffer layer markings */}
                  <div className="absolute top-1 left-4 text-[9px] font-mono text-yellow-500/60 uppercase tracking-widest pointer-events-none">
                    MASHUPKGRID ISP CORNING SMF-28 ULTRA OPTICAL FIBRE OS2 · LOW WATER PEAK
                  </div>

                  {/* Core Strand 1 (Tx - Cyan Laser) */}
                  <div className="relative h-2 w-full my-1 rounded-full bg-slate-950/80 overflow-hidden flex items-center">
                    <svg className="w-full h-full overflow-visible" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="laserCyan" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#06b6d4" />
                          <stop offset="30%" stopColor="#38bdf8" />
                          <stop offset="70%" stopColor="#67e8f9" />
                          <stop offset="100%" stopColor="#a5f3fc" />
                        </linearGradient>
                      </defs>
                      <line
                        x1="0"
                        y1="4"
                        x2="100%"
                        y2="4"
                        stroke="url(#laserCyan)"
                        strokeWidth={burstActive ? "5" : "3.5"}
                        className={burstActive ? "animate-fiber-laser-fast animate-photonic-glow" : "animate-fiber-laser"}
                      />
                    </svg>
                  </div>

                  {/* Core Strand 2 (Rx - Emerald/Teal Laser Reverse) */}
                  <div className="relative h-2 w-full my-1 rounded-full bg-slate-950/80 overflow-hidden flex items-center">
                    <svg className="w-full h-full overflow-visible" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="laserEmerald" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#10b981" />
                          <stop offset="40%" stopColor="#34d399" />
                          <stop offset="80%" stopColor="#6ee7b7" />
                          <stop offset="100%" stopColor="#059669" />
                        </linearGradient>
                      </defs>
                      <line
                        x1="0"
                        y1="4"
                        x2="100%"
                        y2="4"
                        stroke="url(#laserEmerald)"
                        strokeWidth="3.5"
                        className={burstActive ? "animate-fiber-laser-fast" : "animate-fiber-laser-reverse"}
                      />
                    </svg>
                  </div>
                </div>
              </div>

              {/* SFP+ Receiver Right (Core Router Port) */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="hidden sm:block text-slate-600 font-mono text-[10px]">
                  <span>sfp-plus1</span>
                </div>
                <div className="w-28 p-2.5 rounded-xl bg-slate-900 border-2 border-emerald-500/40 shadow-glow text-center font-mono">
                  <div className="text-[10px] text-emerald-400 font-bold">CCR2004 Port</div>
                  <div className="text-[9px] text-slate-500">Optic Cage 1</div>
                  <div className="mt-1.5 flex items-center justify-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="text-[9px] text-emerald-400 font-bold">10G SYNC</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CABLE 2: 10Gbps ETHERNET (CAT6A RJ45 8P8C TWISTED PAIRS) */}
      {/* ========================================================================= */}
      {(activeMode === "both" || activeMode === "ethernet") && (
        <div className="mt-10 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">
                RJ
              </div>
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Category 6A High-Speed Ethernet Cable (10GBASE-T)</span>
                  <span className="text-[10px] font-mono bg-amber-950 border border-amber-800 text-amber-300 px-2 py-0.2 rounded">
                    T568B Standard Pinout (4 Twisted Pairs)
                  </span>
                </h4>
                <p className="text-[11px] text-slate-400">
                  Balanced twisted-pair copper transmission with crosstalk rejection &amp; full-duplex framing.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono text-slate-300 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
              <div>
                <span className="text-slate-500">Frequency: </span>
                <span className="text-amber-400 font-bold">500 MHz</span>
              </div>
              <div className="text-slate-700">|</div>
              <div>
                <span className="text-slate-500">Link State: </span>
                <span className="text-emerald-400 font-bold">10,000 Mbps</span>
              </div>
              <div className="text-slate-700">|</div>
              <div>
                <span className="text-slate-500">Duplex: </span>
                <span className="text-white font-bold">Full / Auto-MDIX</span>
              </div>
            </div>
          </div>

          {/* Visual Ethernet Cable Jacket with 4 Twisted Pairs Exposed */}
          <div className="relative rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-slate-800 p-6 overflow-hidden">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
              {/* Left RJ45 Connector Plug */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="w-32 p-3 rounded-xl bg-slate-900 border-2 border-amber-500/40 shadow-glow text-center font-mono">
                  <div className="text-[10px] text-amber-400 font-bold">RJ45 8P8C Plug</div>
                  <div className="text-[9px] text-slate-400">Gold Plated Contacts</div>

                  {/* Dual Ethernet Link & Activity LEDs */}
                  <div className="mt-2 flex items-center justify-center gap-3 pt-1 border-t border-slate-800">
                    <div className="flex items-center gap-1 text-[9px] text-slate-400">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-sm" />
                      <span>LINK</span>
                    </div>
                    <div className="flex items-center gap-1 text-[9px] text-slate-400">
                      <span className="h-2 w-2 rounded-full bg-amber-400 animate-led-blink shadow-sm" />
                      <span>ACT</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Center 4 Twisted Copper Pairs */}
              <div className="flex-1 w-full relative py-1">
                <div className="relative rounded-xl bg-slate-950 border border-slate-800 p-3 space-y-2 overflow-hidden shadow-inner">
                  {/* Pair 1: Orange / Orange-White */}
                  <div className="flex items-center gap-2">
                    <span className="w-16 font-mono text-[9px] text-orange-400 shrink-0">Pairs 1 &amp; 2 (Tx)</span>
                    <div className="relative h-2 w-full rounded-full bg-slate-900 overflow-hidden flex items-center">
                      <svg className="w-full h-full overflow-visible" preserveAspectRatio="none">
                        <line
                          x1="0"
                          y1="4"
                          x2="100%"
                          y2="4"
                          stroke="#f97316"
                          strokeWidth="3"
                          className="animate-ethernet-pulse"
                        />
                      </svg>
                    </div>
                  </div>

                  {/* Pair 2: Green / Green-White */}
                  <div className="flex items-center gap-2">
                    <span className="w-16 font-mono text-[9px] text-emerald-400 shrink-0">Pairs 3 &amp; 6 (Rx)</span>
                    <div className="relative h-2 w-full rounded-full bg-slate-900 overflow-hidden flex items-center">
                      <svg className="w-full h-full overflow-visible" preserveAspectRatio="none">
                        <line
                          x1="0"
                          y1="4"
                          x2="100%"
                          y2="4"
                          stroke="#10b981"
                          strokeWidth="3"
                          className="animate-ethernet-pulse"
                        />
                      </svg>
                    </div>
                  </div>

                  {/* Pair 3: Blue / Blue-White */}
                  <div className="flex items-center gap-2">
                    <span className="w-16 font-mono text-[9px] text-blue-400 shrink-0">Pairs 4 &amp; 5 (Bi)</span>
                    <div className="relative h-2 w-full rounded-full bg-slate-900 overflow-hidden flex items-center">
                      <svg className="w-full h-full overflow-visible" preserveAspectRatio="none">
                        <line
                          x1="0"
                          y1="4"
                          x2="100%"
                          y2="4"
                          stroke="#3b82f6"
                          strokeWidth="3"
                          className="animate-ethernet-pulse"
                        />
                      </svg>
                    </div>
                  </div>

                  {/* Pair 4: Brown / Brown-White */}
                  <div className="flex items-center gap-2">
                    <span className="w-16 font-mono text-[9px] text-amber-500 shrink-0">Pairs 7 &amp; 8 (Bi)</span>
                    <div className="relative h-2 w-full rounded-full bg-slate-900 overflow-hidden flex items-center">
                      <svg className="w-full h-full overflow-visible" preserveAspectRatio="none">
                        <line
                          x1="0"
                          y1="4"
                          x2="100%"
                          y2="4"
                          stroke="#d97706"
                          strokeWidth="3"
                          className="animate-ethernet-pulse"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right RJ45 Jack (Subscriber OLT / Switch Port) */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="w-32 p-3 rounded-xl bg-slate-900 border-2 border-brand-500/40 shadow-glow text-center font-mono">
                  <div className="text-[10px] text-brand-400 font-bold">ether2-LAN</div>
                  <div className="text-[9px] text-slate-400">Subscriber Port</div>

                  {/* Dual Ethernet Link & Activity LEDs */}
                  <div className="mt-2 flex items-center justify-center gap-3 pt-1 border-t border-slate-800">
                    <div className="flex items-center gap-1 text-[9px] text-slate-400">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-sm" />
                      <span>10G</span>
                    </div>
                    <div className="flex items-center gap-1 text-[9px] text-slate-400">
                      <span className="h-2 w-2 rounded-full bg-amber-400 animate-led-blink shadow-sm" />
                      <span>BURST</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Real-time Hardware Diagnostic Telemetry Strip */}
      <div className="mt-6 pt-4 border-t border-slate-800 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono text-slate-400">
        <div>
          <span className="text-slate-500 block">Total Packet Streams:</span>
          <span className="font-bold text-white text-sm">{packetCount.toLocaleString()} frames</span>
        </div>
        <div>
          <span className="text-slate-500 block">Frame Drops / CRC Errors:</span>
          <span className="font-bold text-emerald-400 text-sm">0 (0.000%)</span>
        </div>
        <div>
          <span className="text-slate-500 block">Optical Core Wavelength:</span>
          <span className="font-bold text-cyan-400 text-sm">1310nm Single-Mode</span>
        </div>
        <div>
          <span className="text-slate-500 block">Ethernet MTU / Speed:</span>
          <span className="font-bold text-brand-400 text-sm">10 Gbps · 9000 Jumbo</span>
        </div>
      </div>
    </div>
  );
}
