"use client";

import React, { useState, useEffect } from "react";
import { AdvertisementConfig } from "@/lib/captive-portal-plugins/types";
import { trackPortalEvent } from "@/lib/captive-portal-plugins/analytics-tracker";

export function PortalAds({ config }: { config: AdvertisementConfig }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const activeAds = (config.ads || []).filter((ad) => ad.enabled);

  useEffect(() => {
    if (!config.enabled || activeAds.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % activeAds.length);
    }, (config.rotationIntervalSec || 8) * 1000);
    return () => clearInterval(interval);
  }, [config.enabled, config.rotationIntervalSec, activeAds.length]);

  if (!config.enabled || dismissed || activeAds.length === 0) {
    return null;
  }

  const currentAd = activeAds[currentIndex] || activeAds[0]!;

  const handleClick = () => {
    trackPortalEvent("ad_click", { adId: currentAd.id, title: currentAd.title });
  };

  return (
    <div className="w-full max-w-md mx-auto my-3 px-4 relative z-20">
      <div className="rounded-2xl border border-amber-500/30 bg-slate-900/90 p-3 shadow-xl backdrop-blur-md relative overflow-hidden group hover:border-amber-500/60 transition-all">
        {/* Background glow */}
        <div className="absolute -right-10 -bottom-10 w-28 h-28 rounded-full bg-amber-500/10 blur-xl pointer-events-none" />

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
              {currentAd.badge || "SPONSORED"}
            </span>
          </div>
          {config.allowDismiss && (
            <button
              onClick={() => setDismissed(true)}
              className="text-slate-500 hover:text-slate-300 text-xs px-1"
              title="Dismiss ad"
            >
              ✕
            </button>
          )}
        </div>

        <a
          href={currentAd.targetUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleClick}
          className="block mt-2"
        >
          {currentAd.imageUrl && (
            <img
              src={currentAd.imageUrl}
              alt={currentAd.title}
              className="w-full h-24 object-cover rounded-xl mb-2 border border-slate-800"
              loading="lazy"
            />
          )}
          <h5 className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">
            {currentAd.title}
          </h5>
          <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
            {currentAd.description}
          </p>
        </a>
      </div>
    </div>
  );
}
