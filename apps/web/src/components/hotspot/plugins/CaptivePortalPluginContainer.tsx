"use client";

import React, { useState, useEffect } from "react";
import { CaptivePortalPluginsState } from "@/lib/captive-portal-plugins/types";
import { getCaptivePortalPluginsState, fetchPublishedPluginsState } from "@/lib/captive-portal-plugins/plugin-registry";
import { apiFetch } from "@/lib/api-client";
import { EdgeMascots } from "./EdgeMascots";
import { AnimatedBackground } from "./AnimatedBackground";
import { PortalLoadingScreen } from "./PortalLoadingScreen";
import { PortalAnnouncements } from "./PortalAnnouncements";
import { PortalAds } from "./PortalAds";
import { PortalAudioController } from "./PortalAudioController";
import { PortalQrModal } from "./PortalQrModal";
import { PortalUserDashboard } from "./PortalUserDashboard";
import { PortalSupportFab } from "./PortalSupportFab";
import { PortalSocialBar } from "./PortalSocialBar";
import { PortalNotifications, ToastMessage } from "./PortalNotifications";
import { CustomCodeInjector } from "./CustomCodeInjector";
import { trackPortalEvent } from "@/lib/captive-portal-plugins/analytics-tracker";
import { portalSoundEngine } from "@/lib/captive-portal-plugins/sound-effects";

interface CaptivePortalPluginContainerProps {
  children: React.ReactNode;
  tenantSlug: string;
  activeVoucherCode?: string | null;
  voucherExpiresAt?: string | null;
  voucherDataCapMb?: number | null;
  isAuthenticating?: boolean;
  onVoucherCodeApplied?: (code: string) => void;
  onDisconnect?: () => void;
}

export function CaptivePortalPluginContainer({
  children,
  tenantSlug,
  activeVoucherCode,
  voucherExpiresAt,
  voucherDataCapMb,
  isAuthenticating = false,
  onVoucherCodeApplied,
  onDisconnect,
}: CaptivePortalPluginContainerProps) {
  // Synchronous local default for the first paint only — for a real customer this is always the
  // factory defaults (their browser has never held this tenant's config), so it renders something
  // sane immediately without a flash of an empty state while the real, authoritative fetch below
  // is in flight.
  const [pluginsState, setPluginsState] = useState<CaptivePortalPluginsState>(() =>
    getCaptivePortalPluginsState(tenantSlug)
  );
  const [showQrModal, setShowQrModal] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [currentLang, setCurrentLang] = useState<"en" | "sw">(pluginsState.language.defaultLanguage || "en");

  useEffect(() => {
    // The authoritative fetch. This is the fix for the whole customizer: previously the only
    // state a real visitor's browser could ever have was localStorage, which is never populated
    // for anyone but the editing admin — so every real customer saw factory defaults no matter
    // what a tenant configured. Falls back to defaults on any failure (API down, tenant
    // mid-provisioning), since a captive portal must still render when the API is unreachable.
    let cancelled = false;
    void fetchPublishedPluginsState(tenantSlug, apiFetch).then((published) => {
      if (!cancelled) setPluginsState(published);
    });
    trackPortalEvent(tenantSlug, "impression", { tenantSlug });

    // Same-tab live preview for the editor only: saveCaptivePortalPluginsState dispatches this
    // event in the SAME browser tab that just saved. A real customer's tab never receives it.
    const handlePluginChange = (e: CustomEvent<CaptivePortalPluginsState>) => {
      if (e.detail) setPluginsState(e.detail);
    };

    window.addEventListener("mkg_portal_plugin_change" as unknown as keyof WindowEventMap, handlePluginChange as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener("mkg_portal_plugin_change" as unknown as keyof WindowEventMap, handlePluginChange as EventListener);
    };
  }, [tenantSlug]);

  const addToast = (type: ToastMessage["type"], message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    if (pluginsState.sound.enabled && pluginsState.notification.playAudioCue) {
      if (type === "success") portalSoundEngine.playSuccess();
      if (type === "error") portalSoundEngine.playError();
    }
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, (pluginsState.notification.durationSec || 4) * 1000);
  };

  const handleDismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const toggles = pluginsState.pluginMasterToggles || {};

  return (
    <div
      className="min-h-screen relative overflow-x-hidden flex flex-col justify-between"
      style={{
        background: toggles.theme !== false && pluginsState.theme.enabled
          ? pluginsState.theme.backgroundGradient || pluginsState.theme.backgroundColor
          : undefined,
        fontFamily: toggles.theme !== false && pluginsState.theme.enabled
          ? pluginsState.theme.fontFamily
          : undefined,
      }}
    >
      {/* 28 & 29. Custom CSS & JS Injector */}
      <CustomCodeInjector
        cssConfig={pluginsState.customCss}
        jsConfig={pluginsState.customJs}
      />

      {/* 4. Animated Background (Particles, Waves, Stars, Bubbles) */}
      {toggles.backgroundFx !== false && (
        <AnimatedBackground config={pluginsState.backgroundFx} />
      )}

      {/* 5, 6, 7, 8, 9, 10. Edge Mascot System (Cartoon Edge Physics) */}
      {toggles.mascots !== false && (
        <EdgeMascots
          mascots={pluginsState.mascots}
          masterEnabled={pluginsState.mascotsMasterEnabled}
          soundEnabled={pluginsState.sound.enabled}
        />
      )}

      {/* Top Header Bar with Language Switcher & QR Code Trigger */}
      <div className="w-full relative z-30 flex items-center justify-between px-4 py-2 pointer-events-auto">
        <div className="flex items-center gap-2">
          {toggles.language !== false && pluginsState.language.enabled && pluginsState.language.allowUserSwitch && (
            <div className="flex rounded-full bg-slate-900/80 border border-slate-700/80 p-0.5 text-[11px] font-bold backdrop-blur-md">
              <button
                onClick={() => setCurrentLang("en")}
                className={`px-2.5 py-1 rounded-full transition-all ${
                  currentLang === "en" ? "bg-brand-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                EN
              </button>
              <button
                onClick={() => setCurrentLang("sw")}
                className={`px-2.5 py-1 rounded-full transition-all ${
                  currentLang === "sw" ? "bg-brand-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                SW
              </button>
            </div>
          )}
        </div>

        {toggles.qrCode !== false && pluginsState.qrCode.enabled && (
          <button
            onClick={() => setShowQrModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/80 border border-cyan-500/40 text-cyan-300 text-xs font-bold shadow-lg backdrop-blur-md hover:bg-slate-800 transition-all"
            title="Scan Wi-Fi QR Code"
          >
            <span>📱</span>
            <span>QR Connect</span>
          </button>
        )}
      </div>

      {/* 15. Announcements (Marquee / Pill / Popup) */}
      {toggles.announcements !== false && (
        <PortalAnnouncements config={pluginsState.announcements} />
      )}

      {/* 14. Advertisements */}
      {toggles.ads !== false && (
        <PortalAds config={pluginsState.ads} tenantSlug={tenantSlug} />
      )}

      {/* Core Captive Portal Children (Login Card, Packages, Authentication Modals) */}
      <div className="relative z-10 flex-1 flex flex-col justify-center">
        {children}
      </div>

      {/* 25. Social Media Bar */}
      {toggles.social !== false && (
        <PortalSocialBar config={pluginsState.social} />
      )}

      {/* 16. Audio Sound Effects Controller */}
      {toggles.sound !== false && (
        <PortalAudioController config={pluginsState.sound} />
      )}

      {/* 22. User Dashboard Widget */}
      {toggles.userDashboard !== false && (
        <PortalUserDashboard
          config={pluginsState.userDashboard}
          activeVoucherCode={activeVoucherCode}
          expiresAt={voucherExpiresAt}
          dataCapMb={voucherDataCapMb}
          onDisconnect={onDisconnect}
        />
      )}

      {/* 24. Support Speed-Dial FAB */}
      {toggles.support !== false && (
        <PortalSupportFab config={pluginsState.support} />
      )}

      {/* 19. QR Code Modal */}
      {toggles.qrCode !== false && (
        <PortalQrModal
          config={pluginsState.qrCode}
          isOpen={showQrModal}
          onClose={() => setShowQrModal(false)}
          onVoucherScanned={(code) => {
            if (onVoucherCodeApplied) onVoucherCodeApplied(code);
            addToast("success", `Voucher code ${code} scanned successfully!`);
          }}
        />
      )}

      {/* 13. Loading Splash Screen during Authentication */}
      {toggles.loadingScreen !== false && (
        <PortalLoadingScreen
          config={pluginsState.loadingScreen}
          visible={isAuthenticating}
        />
      )}

      {/* 23. Notification Toasts */}
      {toggles.notification !== false && (
        <PortalNotifications
          config={pluginsState.notification}
          toasts={toasts}
          onDismiss={handleDismissToast}
        />
      )}
    </div>
  );
}
