"use client";

import React from "react";
import { LoadingScreenConfig } from "@/lib/captive-portal-plugins/types";
import { MascotRenderer } from "./MascotGallery";

export function PortalLoadingScreen({
  config,
  visible,
}: {
  config: LoadingScreenConfig;
  visible: boolean;
}) {
  /**
   * An indeterminate bar, not a percentage.
   *
   * This previously counted up in random increments to 92% and sat there. Nothing measured it —
   * the page is waiting on the browser to hand off to the router, which either happens or does
   * not, with no progress to report. A number that climbs to 100% and then keeps spinning tells
   * the customer the system is working when it has actually failed, and it is the reason a
   * stuck hand-off looked like a slow one.
   */

  if (!config.enabled || !visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-md p-6 text-center animate-fade-in">
      <div className="relative mb-6">
        {config.showMascot && (
          <div className="animate-bounce">
            <MascotRenderer
              characterId={config.mascotCharacterId || "speedy-cheetah"}
              size={110}
            />
          </div>
        )}
        <div className="absolute -inset-4 rounded-full bg-brand-500/20 blur-xl -z-10 animate-pulse" />
      </div>

      <h3 className="text-xl font-black text-white mb-2 tracking-tight">
        {config.loadingTitle || "Connecting you to the Wi-Fi…"}
      </h3>
      <p className="text-xs text-slate-400 mb-6 max-w-xs">
        {/* Says what is actually happening. The old copy claimed to be "contacting core RADIUS
            accounting engine", which is not what this moment is: the payment is already done and
            the page is handing the device over to the router. */}
        {config.loadingSubtitle || "Handing your device over to the router"}
      </p>

      {/* Indeterminate: a sweep that shows work is in progress without claiming to know how far
          along it is, because nothing here can know that. */}
      <div className="w-64 max-w-full h-2 rounded-full bg-slate-800 overflow-hidden p-0.5 border border-slate-700">
        <div
          className="h-full w-1/3 rounded-full animate-pulse"
          style={{
            backgroundColor: config.progressBarColor || "#10b981",
            boxShadow: `0 0 12px ${config.progressBarColor || "#10b981"}`,
          }}
        />
      </div>

      <span className="text-[11px] text-slate-500 mt-3">This takes a moment…</span>
    </div>
  );
}
