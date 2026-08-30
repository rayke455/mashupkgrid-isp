"use client";

import React, { useState, useEffect } from "react";
import { UserDashboardConfig } from "@/lib/captive-portal-plugins/types";

export function PortalUserDashboard({
  config,
  activeVoucherCode,
  expiresAt,
  dataCapMb,
  onDisconnect,
}: {
  config: UserDashboardConfig;
  activeVoucherCode?: string | null;
  expiresAt?: string | null;
  dataCapMb?: number | null;
  onDisconnect?: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState<string>("--:--");
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    if (!expiresAt) {
      setTimeLeft("Active");
      return;
    }

    const updateTimer = () => {
      const remaining = new Date(expiresAt).getTime() - Date.now();
      if (remaining <= 0) {
        setTimeLeft("Expired");
        return;
      }
      const hrs = Math.floor(remaining / (1000 * 60 * 60));
      const mins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((remaining % (1000 * 60)) / 1000);
      setTimeLeft(`${hrs > 0 ? `${hrs}h ` : ""}${mins}m ${secs}s`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (!config.enabled || !activeVoucherCode) return null;

  return (
    <div
      className={`fixed ${
        config.widgetPosition === "bottom-left"
          ? "bottom-4 left-4"
          : config.widgetPosition === "top-right"
          ? "top-4 right-4"
          : "bottom-4 right-4"
      } z-40`}
    >
      <div className="rounded-2xl bg-slate-900/95 border border-emerald-500/40 p-3.5 shadow-2xl backdrop-blur-md text-white max-w-xs transition-all duration-200">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-[10px] font-mono font-bold tracking-widest text-emerald-400 uppercase">
              Online
            </span>
          </div>
          <button
            onClick={() => setMinimized(!minimized)}
            className="text-slate-400 hover:text-white text-xs px-1"
          >
            {minimized ? "▲" : "▼"}
          </button>
        </div>

        {!minimized && (
          <div className="space-y-2 pt-1 border-t border-slate-800 text-xs">
            <div className="flex justify-between items-center text-slate-300">
              <span className="text-slate-400">Voucher PIN:</span>
              <span className="font-mono font-bold text-white bg-slate-800 px-2 py-0.5 rounded">
                {activeVoucherCode}
              </span>
            </div>

            {config.showSessionClock && (
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Time Left:</span>
                <span className="font-mono font-bold text-emerald-400">{timeLeft}</span>
              </div>
            )}

            {config.showRemainingQuota && dataCapMb && (
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Data Limit:</span>
                <span className="font-mono font-bold text-cyan-400">{dataCapMb} MB</span>
              </div>
            )}

            {config.allowDisconnectButton && onDisconnect && (
              <button
                onClick={onDisconnect}
                className="w-full mt-2 py-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-[11px] font-bold text-white transition-colors"
              >
                Disconnect Session
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
