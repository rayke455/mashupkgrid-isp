"use client";

import React, { useEffect, useState } from "react";
import { LoadingScreenConfig } from "@/lib/captive-portal-plugins/types";
import { MascotRenderer } from "./MascotGallery";

export function PortalLoadingScreen({
  config,
  visible,
}: {
  config: LoadingScreenConfig;
  visible: boolean;
}) {
  const [progress, setProgress] = useState(15);

  useEffect(() => {
    if (!visible) {
      setProgress(15);
      return;
    }
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 92) return prev;
        return prev + Math.floor(Math.random() * 12) + 6;
      });
    }, 120);
    return () => clearInterval(interval);
  }, [visible]);

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
        {config.loadingTitle || "Authenticating Wi-Fi Session…"}
      </h3>
      <p className="text-xs text-slate-400 mb-6 max-w-xs">
        {config.loadingSubtitle || "Contacting core RADIUS accounting engine"}
      </p>

      {/* Progress bar */}
      <div className="w-64 max-w-full h-2 rounded-full bg-slate-800 overflow-hidden p-0.5 border border-slate-700">
        <div
          className="h-full rounded-full transition-all duration-200"
          style={{
            width: `${progress}%`,
            backgroundColor: config.progressBarColor || "#10b981",
            boxShadow: `0 0 12px ${config.progressBarColor || "#10b981"}`,
          }}
        />
      </div>

      <span className="text-[11px] font-mono text-slate-500 mt-3">{progress}%</span>
    </div>
  );
}
