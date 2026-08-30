"use client";

import React from "react";
import { SocialLinksConfig } from "@/lib/captive-portal-plugins/types";

export function PortalSocialBar({ config }: { config: SocialLinksConfig }) {
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
          className="w-8 h-8 rounded-full bg-slate-900/80 border border-slate-700/60 hover:border-brand-500/80 text-white flex items-center justify-center text-xs shadow-md backdrop-blur-md hover:scale-115 active:scale-95 transition-all"
          title={link.label}
        >
          {link.icon}
        </a>
      ))}
    </div>
  );
}
