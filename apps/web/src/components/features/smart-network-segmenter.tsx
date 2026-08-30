"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";
import { IconCheck, IconRouter, IconMpesa, IconShield, IconTicket } from "@/components/icons";

interface SegmentInfo {
  title: string;
  badge: string;
  tagline: string;
  recommendedHardware: string;
  typicalSubscribers: string;
  features: string[];
  workflowSteps: { step: string; desc: string }[];
  commandPreview: string;
}

const SEGMENTS: Record<"ftth" | "wisp" | "hotspot" | "multitenant", SegmentInfo> = {
  ftth: {
    title: "Prepaid Home Fiber (FTTH / GPON)",
    badge: "Most Popular for Urban ISPs",
    tagline: "Automate residential fiber subscribers with PPPoE authentication, optical signal tracking, and instant Safaricom M-Pesa renewals.",
    recommendedHardware: "MikroTik CCR2004-16G-2S+ / CCR2116",
    typicalSubscribers: "200 - 15,000 Subscribers",
    features: [
      "Sub-second PPPoE user creation via RouterOS API",
      "Dynamic queue speed caps (10M / 20M / 50M / 100M)",
      "Automated cutoff at 23:59 on expiry date with grace periods",
      "Instant un-throttle within 2 seconds of M-Pesa STK confirmation",
      "Dual-stack IPv4 CGNAT + IPv6 Prefix Delegation (/48 - /64)",
    ],
    workflowSteps: [
      { step: "1. Fiber Drop", desc: "Customer ONT connects to your OLT & MikroTik PPPoE Server." },
      { step: "2. Auto-Invoice", desc: "Billing engine generates recurring monthly invoice with SMS reminder." },
      { step: "3. 1-Click Pay", desc: "Subscriber pays via M-Pesa STK; FreeRADIUS updates queue instantly." },
    ],
    commandPreview: `/interface pppoe-server server add service-name=mashupkgrid-fiber interface=sfp-plus1 default-profile=default disabled=no authentication=pap,chap,mschap2`,
  },
  wisp: {
    title: "Fixed Wireless Access (WISP & PtMP)",
    badge: "Built for Rural & Peri-Urban Networks",
    tagline: "Manage 5GHz and 60GHz wireless links, tower sectors, and customer CPEs with automated bandwidth control and storm suppression.",
    recommendedHardware: "MikroTik RB5009UG+S+IN / CCR2004",
    typicalSubscribers: "50 - 3,500 Subscribers",
    features: [
      "Fair Usage Policy (FUP) with peak/off-peak speed boosting",
      "Wireless sector tower grouping & latency monitoring",
      "Automated SMS alerts for power cuts or tower battery backups",
      "IPoE and DHCP static binding with radius-mac-auth",
      "Integrated GIS coverage checker to validate line-of-sight",
    ],
    workflowSteps: [
      { step: "1. CPE Link", desc: "Customer dish/radio connects to sector tower AP." },
      { step: "2. MAC Binding", desc: "MikroTik DHCP leases verified against FreeRADIUS subscriber pool." },
      { step: "3. Bandwidth QoS", desc: "PCQ queue tree prioritizes zoom/gaming while capping bulk downloads." },
    ],
    commandPreview: `/queue tree add name=wisp-download parent=global max-limit=500M priority=1 queue=pcq-download-default`,
  },
  hotspot: {
    title: "Public Hotspots & Wi-Fi Vouchers",
    badge: "High Cash Flow for Cafes, Malls & Matatus",
    tagline: "Turn public Wi-Fi zones into automated revenue engines with customizable captive portals, M-Pesa paywalls, and printable QR vouchers.",
    recommendedHardware: "MikroTik hEX S (RB760iGS) / L009UiGS / cAP ax",
    typicalSubscribers: "1,000 - 50,000 Voucher Users / month",
    features: [
      "Visual Captive Portal Designer with custom sponsor video ads",
      "Instant Safaricom M-Pesa paywall (KES 10, KES 20, KES 50 passes)",
      "Batch PDF voucher generator with scannable QR codes",
      "Single-device or multi-device voucher concurrency rules",
      "Automatic session termination on time or data quota exhaustion",
    ],
    workflowSteps: [
      { step: "1. Scan & Tap", desc: "User connects to open Wi-Fi; captive portal pops up automatically." },
      { step: "2. Voucher / M-Pesa", desc: "User enters voucher code or enters phone for instant STK prompt." },
      { step: "3. Instant Access", desc: "Router grants access and enforces session timer with zero leaks." },
    ],
    commandPreview: `/ip hotspot profile set [find default=yes] use-radius=yes radius-accounting=yes login-by=http-chap,http-pap`,
  },
  multitenant: {
    title: "Carrier & Multi-Tenant Reseller ISP",
    badge: "Scale Sub-Operators Under One Platform",
    tagline: "Manage multiple WISP brands, sub-resellers, and regional fiber franchises with separate billing ledgers, custom domains, and role permissions.",
    recommendedHardware: "Cloud Hosted Engine + Multiple Edge CCR Routers",
    typicalSubscribers: "Unlimited Tenants & Edge Routers",
    features: [
      "Custom white-label domain for each sub-ISP (e.g. portal.isp.co.ke)",
      "Isolated Safaricom Paybill & M-Pesa B2C credentials per tenant",
      "Role-based staff permissions (Super Admin, Tech, Billing, Agent)",
      "Global network health overview across all connected edge routers",
      "Automated tenant billing, revenue splits, and platform subscriptions",
    ],
    workflowSteps: [
      { step: "1. Create Tenant", desc: "Provision isolated tenant organization slug in 1 click." },
      { step: "2. Add Edge Routers", desc: "Link multiple MikroTik gateways via TLS API or WireGuard tunnel." },
      { step: "3. Delegated Access", desc: "Tenant manages own packages, customers, and Paybill collections." },
    ],
    commandPreview: `/radius add address=radius.mashupkgrid.com secret=your-tenant-secret service=ppp,hotspot authentication-port=1812 accounting-port=1813`,
  },
};

export function SmartNetworkSegmenter() {
  const [activeSegment, setActiveSegment] = useState<"ftth" | "wisp" | "hotspot" | "multitenant">("ftth");
  const data = SEGMENTS[activeSegment];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/95 shadow-2xl p-6 lg:p-8 backdrop-blur-xl space-y-8">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <Badge variant="info">Architected for Your Specific Network</Badge>
        <h3 className="text-2xl sm:text-3xl font-black text-white">
          What Type of Internet Network Do You Operate?
        </h3>
        <p className="text-xs sm:text-sm text-slate-400">
          Whether you deploy residential FTTH fiber, rural wireless towers, or high-density public Wi-Fi hotspots, Mashupkgrid adapts to your exact architecture.
        </p>

        {/* Segment Switcher Tabs */}
        <div className="pt-3 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => setActiveSegment("ftth")}
            className={`px-4 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 ${
              activeSegment === "ftth"
                ? "bg-brand-600 border-brand-500 text-white shadow-glow"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
            <span>Prepaid Fiber (FTTH)</span>
          </button>

          <button
            onClick={() => setActiveSegment("wisp")}
            className={`px-4 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 ${
              activeSegment === "wisp"
                ? "bg-cyan-600 border-cyan-500 text-white shadow-glow"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
            <span>Wireless WISP</span>
          </button>

          <button
            onClick={() => setActiveSegment("hotspot")}
            className={`px-4 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 ${
              activeSegment === "hotspot"
                ? "bg-amber-600 border-amber-500 text-white shadow-glow"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span>Hotspots &amp; Vouchers</span>
          </button>

          <button
            onClick={() => setActiveSegment("multitenant")}
            className={`px-4 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 ${
              activeSegment === "multitenant"
                ? "bg-emerald-600 border-emerald-500 text-white shadow-glow-emerald"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>Carrier / Multi-Tenant</span>
          </button>
        </div>
      </div>

      {/* Detail Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pt-2">
        {/* Left: Solution Highlights & Features */}
        <div className="lg:col-span-6 space-y-4 text-left font-sans">
          <div>
            <div className="inline-block rounded bg-brand-500/10 border border-brand-500/20 px-2.5 py-0.5 text-[11px] font-mono text-brand-400 font-bold mb-2">
              {data.badge}
            </div>
            <h4 className="text-xl font-bold text-white">{data.title}</h4>
            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">{data.tagline}</p>
          </div>

          {/* Key Checklist */}
          <div className="space-y-2 pt-2">
            {data.features.map((feat, idx) => (
              <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-200">
                <div className="h-4 w-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 font-bold text-[10px]">
                  ✓
                </div>
                <span>{feat}</span>
              </div>
            ))}
          </div>

          {/* Hardware & Scale Specs */}
          <div className="grid grid-cols-2 gap-3 font-mono text-xs pt-2">
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-slate-500 text-[10px] block uppercase">Recommended Hardware</span>
              <span className="font-bold text-white text-[11px] block">{data.recommendedHardware}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-slate-500 text-[10px] block uppercase">Proven Scale</span>
              <span className="font-bold text-cyan-400 text-[11px] block">{data.typicalSubscribers}</span>
            </div>
          </div>
        </div>

        {/* Right: Operational Workflow & MikroTik Terminal Box */}
        <div className="lg:col-span-6 space-y-4 text-left font-mono text-xs">
          {/* 3 Step Flow */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-3 shadow-xl">
            <span className="text-xs font-bold text-white uppercase tracking-wider block font-sans">
              Automated Subscriber Lifecycle Flow
            </span>

            <div className="space-y-2.5">
              {data.workflowSteps.map((wf, idx) => (
                <div key={idx} className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80">
                  <div className="h-6 w-6 rounded-md bg-brand-600/30 border border-brand-500/50 text-brand-400 font-bold flex items-center justify-center shrink-0 text-xs">
                    {idx + 1}
                  </div>
                  <div>
                    <span className="text-white font-bold block">{wf.step}</span>
                    <span className="text-slate-400 text-[11px] font-sans leading-tight block mt-0.5">{wf.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Terminal Command Snippet */}
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400 pb-1.5 border-b border-slate-900">
              <span className="flex items-center gap-1.5 text-white">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span>RouterOS Command</span>
              </span>
              <span className="text-slate-500">Winbox Terminal</span>
            </div>
            <div className="bg-black/50 rounded p-2 text-cyan-300 font-mono text-[10px] break-all leading-relaxed">
              {data.commandPreview}
            </div>
            <div className="text-[10px] text-slate-500 text-right font-mono">
              Ready for deployment via Winbox terminal
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
