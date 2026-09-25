"use client";

import React from "react";
import { SocialLinksConfig } from "@/lib/captive-portal-plugins/types";

export function PortalSocialBar({ config, light = false }: { config: SocialLinksConfig; light?: boolean }) {
  if (!config.enabled) return null;

  const links = [
    { label: "Facebook", url: config.facebook, icon: "📘" },
    { label: "Instagram", url: config.instagram, icon: "📸" },
    { label: "TikTok", url: config.tiktok, icon: "🎵" },
    { label: "X", url: config.xTwitter, icon: "✖️" },
    { label: "YouTube", url: config.youtube, icon: "▶️" },
    { label: "Telegram", url: config.telegram, icon: "✈️" },
  ].filter((l) => Boolean(l.url));

  if (links.length === 0) return null;

  return (
    <div className="flex items-center justify-center gap-3 py-3 relative z-20 pointer-events-auto">
      {links.map((link, idx) => (
        <a
          key={idx}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs transition-colors ${light ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100" : "bg-slate-900/80 border border-slate-700/60 hover:border-brand-500/80 text-white shadow-md backdrop-blur-md"}`}
          title={link.label}
        >
          {link.icon}
        </a>
      ))}
    </div>
  );
}
