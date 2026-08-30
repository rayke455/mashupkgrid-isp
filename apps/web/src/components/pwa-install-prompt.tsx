"use client";

import { useState, useEffect } from "react";
import { IconCheck } from "@/components/icons";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowPrompt(false);
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  if (!showPrompt || isInstalled) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 animate-in slide-in-from-bottom-5 duration-300">
      <div className="rounded-2xl border border-cyan-500/40 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-xl flex items-center gap-3.5 ring-1 ring-cyan-500/20">
        <div className="h-10 w-10 shrink-0 rounded-xl overflow-hidden ring-1 ring-cyan-500/50 bg-slate-900 flex items-center justify-center">
          <img src="/logo.jpg" alt="Mashupkgrid Logo" className="h-full w-full object-cover" />
        </div>

        <div className="flex-1 min-w-0 font-sans">
          <h4 className="text-xs font-bold text-white leading-tight">Install Mashupkgrid Console</h4>
          <p className="text-[11px] text-slate-400 truncate mt-0.5">
            Add to home screen for field ops &amp; offline alerts
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleInstallClick}
            className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-glow transition-all"
          >
            Install
          </button>
          <button
            onClick={() => setShowPrompt(false)}
            className="h-7 w-7 rounded-lg text-slate-500 hover:text-white flex items-center justify-center text-xs"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
