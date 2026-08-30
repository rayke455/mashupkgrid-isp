"use client";

import React, { useState } from "react";
import { QrCodeConfig } from "@/lib/captive-portal-plugins/types";

export function PortalQrModal({
  config,
  isOpen,
  onClose,
  onVoucherScanned,
}: {
  config: QrCodeConfig;
  isOpen: boolean;
  onClose: () => void;
  onVoucherScanned?: (code: string) => void;
}) {
  const [tab, setTab] = useState<"wifi" | "scanner">("wifi");
  const [manualCode, setManualCode] = useState("");

  if (!config.enabled || !isOpen) return null;

  // Standard Wi-Fi connection QR payload
  const wifiString = `WIFI:T:${config.encryption || "nopass"};S:${config.ssid || "FREE-WIFI"};P:${config.password || ""};;`;
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(wifiString)}&bgcolor=0f172a&color=38bdf8`;

  const handleManualScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim() && onVoucherScanned) {
      onVoucherScanned(manualCode.trim().toUpperCase());
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="rounded-3xl bg-slate-900 border border-cyan-500/40 p-6 max-w-sm w-full text-center shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg w-8 h-8 flex items-center justify-center rounded-full bg-slate-800"
        >
          ✕
        </button>

        {/* Tab switcher */}
        <div className="flex rounded-xl bg-slate-950 p-1 mb-6 border border-slate-800">
          <button
            onClick={() => setTab("wifi")}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
              tab === "wifi" ? "bg-cyan-600 text-white shadow-md" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            📶 Connect Wi-Fi
          </button>
          <button
            onClick={() => setTab("scanner")}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
              tab === "scanner" ? "bg-cyan-600 text-white shadow-md" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            📷 Scan Voucher
          </button>
        </div>

        {tab === "wifi" ? (
          <div>
            <h4 className="text-base font-bold text-white mb-1">Scan to Join Wi-Fi</h4>
            <p className="text-xs text-slate-400 mb-4">
              Open your phone camera to join <strong className="text-cyan-400">{config.ssid}</strong>
            </p>
            <div className="flex justify-center p-4 rounded-2xl bg-slate-950 border border-slate-800 mb-4 inline-block">
              <img src={qrApiUrl} alt="Wi-Fi QR Code" className="w-44 h-44 rounded-lg" />
            </div>
            <p className="text-[11px] text-slate-500">Works on all iPhone and Android camera apps</p>
          </div>
        ) : (
          <div>
            <h4 className="text-base font-bold text-white mb-1">Redeem Voucher QR</h4>
            <p className="text-xs text-slate-400 mb-4">
              Scan barcode or enter the printed scratch-card voucher
            </p>
            <form onSubmit={handleManualScan} className="space-y-4">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                placeholder="Scan or enter PIN (e.g. A9X2K7B4)"
                className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-cyan-500/50 text-white text-center font-mono font-bold tracking-widest text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
                autoFocus
              />
              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg transition-all"
              >
                Apply Voucher Code
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
