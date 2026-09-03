"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";
import { WhatsAppBotSimulator } from "./whatsapp-bot-simulator";
import { CaptivePortalDesigner } from "./captive-portal-designer";
import { CoverageMapChecker } from "./coverage-map-checker";
import { OutageAiDetector } from "./outage-ai-detector";
import { PortalSpeedometer } from "./portal-speedometer";
import { ThermalVoucherPrinter } from "@/components/vouchers/thermal-voucher-printer";
import { MobileFieldTool } from "@/components/field-tech/mobile-field-tool";
import { NocAlertSettings } from "@/components/alerts/noc-alert-settings";
import { LiveNetworkDiagnostics } from "@/components/diagnostics/live-network-diagnostics";
import { ThemePackExporter } from "@/components/hotspot/theme-pack-exporter";

type TabId =
  | "whatsapp"
  | "portal"
  | "coverage"
  | "outage"
  | "speedometer"
  | "thermal"
  | "fieldtech"
  | "noc"
  | "diagnostics"
  | "themepack";

export function TelecomInnovationsHub() {
  const [activeTab, setActiveTab] = useState<TabId>("whatsapp");

  return (
    <div className="space-y-8">
      {/* Section Header */}
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <Badge variant="info">Next-Gen Telecom Innovations Suite</Badge>
        <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
          Carrier-Grade Software Tools Built for African WISPs &amp; Fiber ISPs
        </h2>
        <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
          Explore our interactive tool suite: automated WhatsApp billing, captive portal studio, GIS coverage, optical fault detection, thermal POS vouchers, mobile field tools, Telegram NOC alerts, and live network diagnostics.
        </p>

        {/* Tab Switcher Buttons */}
        <div className="pt-4 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => setActiveTab("whatsapp")}
            className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === "whatsapp"
                ? "bg-emerald-600 border-emerald-500 text-white shadow-glow-emerald"
                : "bg-slate-950/80 border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>WhatsApp Billing</span>
          </button>

          <button
            onClick={() => setActiveTab("portal")}
            className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === "portal"
                ? "bg-brand-600 border-brand-500 text-white shadow-glow"
                : "bg-slate-950/80 border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
            <span>Portal Designer</span>
          </button>

          <button
            onClick={() => setActiveTab("thermal")}
            className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === "thermal"
                ? "bg-amber-600 border-amber-500 text-white shadow-glow"
                : "bg-slate-950/80 border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span>POS Voucher Printer</span>
          </button>

          <button
            onClick={() => setActiveTab("fieldtech")}
            className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === "fieldtech"
                ? "bg-cyan-600 border-cyan-500 text-white shadow-glow"
                : "bg-slate-950/80 border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
            <span>Mobile Field Tech</span>
          </button>

          <button
            onClick={() => setActiveTab("noc")}
            className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === "noc"
                ? "bg-cyan-600 border-cyan-500 text-white shadow-glow"
                : "bg-slate-950/80 border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
            <span>Telegram NOC Alerts</span>
          </button>

          <button
            onClick={() => setActiveTab("diagnostics")}
            className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === "diagnostics"
                ? "bg-sky-600 border-sky-500 text-white shadow-glow"
                : "bg-slate-950/80 border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
            <span>Live Ping &amp; MTR</span>
          </button>

          <button
            onClick={() => setActiveTab("coverage")}
            className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === "coverage"
                ? "bg-cyan-600 border-cyan-500 text-white shadow-glow"
                : "bg-slate-950/80 border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
            <span>GIS Coverage</span>
          </button>

          <button
            onClick={() => setActiveTab("outage")}
            className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === "outage"
                ? "bg-rose-600 border-rose-500 text-white shadow-glow"
                : "bg-slate-950/80 border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
            <span>Optical Outage Engine</span>
          </button>

          <button
            onClick={() => setActiveTab("speedometer")}
            className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === "speedometer"
                ? "bg-purple-600 border-purple-500 text-white shadow-glow"
                : "bg-slate-950/80 border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
            <span>Speedometer</span>
          </button>

          <button
            onClick={() => setActiveTab("themepack")}
            className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === "themepack"
                ? "bg-emerald-600 border-emerald-500 text-white shadow-glow-emerald"
                : "bg-slate-950/80 border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>RouterOS Theme Pack</span>
          </button>
        </div>
      </div>

      {/* Render Active Tool */}
      <div className="pt-2">
        {activeTab === "whatsapp" && <WhatsAppBotSimulator />}
        {activeTab === "portal" && <CaptivePortalDesigner />}
        {activeTab === "thermal" && <ThermalVoucherPrinter />}
        {activeTab === "fieldtech" && <MobileFieldTool />}
        {activeTab === "noc" && <NocAlertSettings />}
        {activeTab === "diagnostics" && <LiveNetworkDiagnostics />}
        {activeTab === "coverage" && <CoverageMapChecker />}
        {activeTab === "outage" && <OutageAiDetector />}
        {activeTab === "speedometer" && <PortalSpeedometer />}
        {activeTab === "themepack" && <ThemePackExporter />}
      </div>
    </div>
  );
}
