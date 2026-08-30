"use client";

import React, { useEffect, useState } from "react";
import { SoundConfig } from "@/lib/captive-portal-plugins/types";
import { portalSoundEngine } from "@/lib/captive-portal-plugins/sound-effects";

export function PortalAudioController({ config }: { config: SoundConfig }) {
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (!config.enabled || muted) return;

    // Attach global click sound listener to all buttons and tabs
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "BUTTON" ||
        target.closest("button") ||
        target.tagName === "A" ||
        target.closest("a")
      ) {
        if (config.buttonClicks) {
          portalSoundEngine.playClick(config.masterVolume || 0.5);
        }
      }
    };

    window.addEventListener("click", handleGlobalClick, { capture: true });
    return () => window.removeEventListener("click", handleGlobalClick, { capture: true });
  }, [config.enabled, config.buttonClicks, config.masterVolume, muted]);

  if (!config.enabled) return null;

  return (
    <div className="fixed bottom-4 left-4 z-40">
      <button
        onClick={() => setMuted(!muted)}
        className="w-8 h-8 rounded-full bg-slate-900/80 border border-slate-700/80 text-slate-300 hover:text-white flex items-center justify-center text-xs shadow-lg backdrop-blur-md transition-transform hover:scale-110 active:scale-95"
        title={muted ? "Unmute Portal Sounds" : "Mute Portal Sounds"}
      >
        {muted ? "🔇" : "🔊"}
      </button>
    </div>
  );
}
