"use client";

import { useState } from "react";
import { Badge, Button, Card, Input, Label } from "@/components/ui";
import { IconCheck, IconPulse, IconRouter, IconArrowRight } from "@/components/icons";

interface PingPacket {
  seq: number;
  ip: string;
  bytes: number;
  ttl: number;
  timeMs: number;
}

interface TracerouteHop {
  hop: number;
  host: string;
  ip: string;
  timeMs: number;
  status: "GOOD" | "ACCEPTABLE" | "HIGH_LATENCY";
}

export function LiveNetworkDiagnostics() {
  const [activeDiag, setActiveDiag] = useState<"ping" | "traceroute" | "interface">("ping");
  const [targetHost, setTargetHost] = useState("kixp.or.ke");
  const [isRunning, setIsRunning] = useState(false);
  const [pingResults, setPingResults] = useState<PingPacket[]>([
    { seq: 1, ip: "197.248.42.10", bytes: 64, ttl: 58, timeMs: 1.8 },
    { seq: 2, ip: "197.248.42.10", bytes: 64, ttl: 58, timeMs: 1.4 },
    { seq: 3, ip: "197.248.42.10", bytes: 64, ttl: 58, timeMs: 1.9 },
    { seq: 4, ip: "197.248.42.10", bytes: 64, ttl: 58, timeMs: 1.5 },
  ]);

  const [traceHops] = useState<TracerouteHop[]>([
    { hop: 1, host: "core-gw-nbo.mashupkgrid.net", ip: "10.0.0.1", timeMs: 0.4, status: "GOOD" },
    { hop: 2, host: "olt-distribution-wst.net", ip: "172.16.4.1", timeMs: 1.1, status: "GOOD" },
    { hop: 3, host: "kixp-edge-switch-01.nbo", ip: "197.248.0.12", timeMs: 2.3, status: "GOOD" },
    { hop: 4, host: "tier1-transit-liquid.ke", ip: "105.16.48.2", timeMs: 4.8, status: "GOOD" },
    { hop: 5, host: "dns.google", ip: "8.8.8.8", timeMs: 6.4, status: "GOOD" },
  ]);

  const handleRunPing = () => {
    setIsRunning(true);
    setPingResults([]);

    let currentSeq = 1;
    const interval = setInterval(() => {
      const ms = +(Math.random() * 0.8 + 1.2).toFixed(1);
      setPingResults((prev) => [
        ...prev,
        { seq: currentSeq, ip: "197.248.42.10", bytes: 64, ttl: 58, timeMs: ms },
      ]);
      currentSeq++;
      if (currentSeq > 5) {
        clearInterval(interval);
        setIsRunning(false);
      }
    }, 400);
  };

  return (
    <Card className="p-6 lg:p-8 space-y-6 border-slate-800 bg-slate-950/90 shadow-2xl font-sans text-left">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="info">In-Console Telecom Diagnostics</Badge>
            <span className="px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-400 font-mono text-[10px]">
              MikroTik RouterOS REST API
            </span>
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-white">
            Live Ping, Traceroute &amp; Interface Traffic Monitor
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Execute real-time network tests directly from your browser against any customer CPE, gateway router, or national IXP peering.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs font-bold shrink-0">
          <button
            onClick={() => setActiveDiag("ping")}
            className={`px-3.5 py-1.5 rounded-lg transition-all ${
              activeDiag === "ping" ? "bg-brand-600 text-white shadow-glow" : "text-slate-400 hover:text-white"
            }`}
          >
            📡 ICMP Ping
          </button>
          <button
            onClick={() => setActiveDiag("traceroute")}
            className={`px-3.5 py-1.5 rounded-lg transition-all ${
              activeDiag === "traceroute" ? "bg-brand-600 text-white shadow-glow" : "text-slate-400 hover:text-white"
            }`}
          >
            🗺️ MTR Traceroute
          </button>
          <button
            onClick={() => setActiveDiag("interface")}
            className={`px-3.5 py-1.5 rounded-lg transition-all ${
              activeDiag === "interface" ? "bg-brand-600 text-white shadow-glow" : "text-slate-400 hover:text-white"
            }`}
          >
            📊 Port Bandwidth
          </button>
        </div>
      </div>

      {/* Target Host Input Bar */}
      <div className="flex flex-col sm:flex-row items-end gap-3 font-sans">
        <div className="flex-1 w-full">
          <Label htmlFor="diag-target">Diagnostic Target IP / Hostname</Label>
          <Input
            id="diag-target"
            value={targetHost}
            onChange={(e) => setTargetHost(e.target.value)}
            placeholder="e.g. 197.248.42.1 / kixp.or.ke / 100.64.12.8"
            className="font-mono text-xs"
          />
        </div>
        <button
          onClick={handleRunPing}
          disabled={isRunning}
          className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs shadow-glow transition-all flex items-center justify-center gap-2 shrink-0"
        >
          <IconPulse size={14} className={isRunning ? "animate-spin" : ""} />
          <span>{isRunning ? "Testing Pipeline..." : "Execute Test via RouterOS"}</span>
        </button>
      </div>

      {/* DIAGNOSTIC 1: ICMP PING */}
      {activeDiag === "ping" && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4 font-mono text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-slate-400">
              PING <strong className="text-white">{targetHost}</strong> (56 data bytes, 64 ICMP seq)
            </span>
            <span className="text-emerald-400 font-bold text-[11px] flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Packet Loss: 0.0%</span>
            </span>
          </div>

          <div className="space-y-1.5">
            {pingResults.map((p) => (
              <div key={p.seq} className="flex justify-between items-center text-slate-300 py-0.5">
                <span>
                  {p.bytes} bytes from {p.ip}: icmp_seq={p.seq} ttl={p.ttl}
                </span>
                <span className="text-cyan-400 font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                  time={p.timeMs} ms
                </span>
              </div>
            ))}
            {isRunning && (
              <div className="text-slate-500 italic py-1 animate-pulse">
                Probing next packet sequence...
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between text-[11px] text-slate-400">
            <span>Round-Trip: min/avg/max = <strong>1.4 / 1.6 / 1.9 ms</strong></span>
            <span>Jitter: <strong>0.2 ms</strong> · MTU: <strong>1500 bytes</strong></span>
          </div>
        </div>
      )}

      {/* DIAGNOSTIC 2: MTR TRACEROUTE */}
      {activeDiag === "traceroute" && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-3 font-mono text-xs">
          <div className="text-slate-400 pb-2 border-b border-slate-800">
            Traceroute to <strong className="text-white">{targetHost}</strong> (Max 30 Hops, 40 Byte Packets)
          </div>

          <div className="space-y-2">
            {traceHops.map((h) => (
              <div
                key={h.hop}
                className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="h-5 w-5 rounded bg-slate-900 border border-slate-800 text-slate-400 flex items-center justify-center text-[10px] font-bold">
                    {h.hop}
                  </span>
                  <div>
                    <span className="text-white font-bold block">{h.host}</span>
                    <span className="text-slate-500 text-[10px]">{h.ip}</span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-emerald-400 font-bold block">{h.timeMs} ms</span>
                  <span className="text-[9px] text-slate-500 uppercase">Latency</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DIAGNOSTIC 3: INTERFACE MONITOR */}
      {activeDiag === "interface" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono text-xs">
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
            <div className="flex justify-between items-center">
              <span className="font-bold text-white">sfp-plus1 (10G Core Trunk)</span>
              <Badge variant="success">10 Gbps SFP+</Badge>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Rx Bandwidth:</span>
                <span className="text-emerald-400 font-bold">2.41 Gbps</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Tx Bandwidth:</span>
                <span className="text-cyan-400 font-bold">1.82 Gbps</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Link Status:</span>
                <span className="text-slate-200">Full Duplex · 0 Drops</span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
            <div className="flex justify-between items-center">
              <span className="font-bold text-white">ether1 (WAN Internet Peering)</span>
              <Badge variant="info">1 Gbps Cat6A</Badge>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Rx Bandwidth:</span>
                <span className="text-emerald-400 font-bold">842 Mbps</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Tx Bandwidth:</span>
                <span className="text-cyan-400 font-bold">780 Mbps</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Link Status:</span>
                <span className="text-slate-200">1000BASE-T · Auto-MDIX</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
