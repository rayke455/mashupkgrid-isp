"use client";

import React, { useState } from "react";
import { AnnouncementConfig } from "@/lib/captive-portal-plugins/types";

export function PortalAnnouncements({ config }: { config: AnnouncementConfig }) {
  const [modalDismissed, setModalDismissed] = useState(false);

  if (!config.enabled || !config.items || config.items.length === 0) {
    return null;
  }

  const activeItems = config.items.filter((i) => i.enabled);
  if (activeItems.length === 0) return null;

  if (config.style === "marquee") {
    return (
      <div className="w-full bg-indigo-950/80 border-b border-indigo-500/30 text-indigo-200 py-1.5 px-4 overflow-hidden relative z-30 text-xs backdrop-blur-md">
        <div
          className="flex whitespace-nowrap animate-marquee gap-8 font-medium"
          style={{ animationDuration: `${config.scrollSpeedSec || 15}s` }}
        >
          {activeItems.map((item) => (
            <span key={item.id} className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              {item.linkUrl ? (
                <a href={item.linkUrl} target="_blank" rel="noopener noreferrer" className="hover:underline font-bold">
                  {item.text}
                </a>
              ) : (
                <span>{item.text}</span>
              )}
            </span>
          ))}
        </div>
        <style jsx>{`
          @keyframes marquee {
            0% { transform: translateX(100%); }
            100% { transform: translateX(-100%); }
          }
          .animate-marquee {
            animation: marquee linear infinite;
          }
        `}</style>
      </div>
    );
  }

  if (config.style === "top-pill") {
    const item = activeItems[0]!;
    return (
      <div className="w-full flex justify-center pt-2 px-4 relative z-30 pointer-events-auto">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/90 border border-slate-700/80 shadow-lg text-xs text-slate-200 backdrop-blur-md">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-brand-500/20 text-brand-400 border border-brand-500/40">
            {item.type}
          </span>
          <span className="font-medium truncate max-w-xs sm:max-w-md">{item.text}</span>
          {item.linkUrl && (
            <a href={item.linkUrl} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:text-brand-300 font-bold ml-1">
              View &rarr;
            </a>
          )}
        </div>
      </div>
    );
  }

  if (config.style === "modal-alert" && !modalDismissed) {
    const item = activeItems[0]!;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
        <div className="rounded-2xl bg-slate-900 border border-indigo-500/40 p-6 max-w-sm w-full text-center shadow-2xl animate-zoom-in">
          <div className="w-12 h-12 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-4 border border-indigo-500/30">
            📢
          </div>
          <h4 className="text-lg font-bold text-white mb-2">Announcement</h4>
          <p className="text-xs text-slate-300 mb-6 leading-relaxed">{item.text}</p>
          <div className="flex gap-3">
            {item.linkUrl && (
              <a
                href={item.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2.5 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs transition-colors"
              >
                Learn More
              </a>
            )}
            <button
              onClick={() => setModalDismissed(true)}
              className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
