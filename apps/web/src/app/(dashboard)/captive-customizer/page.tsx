"use client";

import React, { useState, useEffect } from "react";
import {
  CaptivePortalPluginsState,
  MascotConfig,
  MascotCharacterId,
  MascotAnimation,
  EdgeZone,
} from "@/lib/captive-portal-plugins/types";
import {
  getCaptivePortalPluginsState,
  saveCaptivePortalPluginsState,
  resetCaptivePortalPluginsState,
  exportPluginsConfigJson,
  importPluginsConfigJson,
} from "@/lib/captive-portal-plugins/plugin-registry";
import { MascotRenderer } from "@/components/hotspot/plugins/MascotGallery";
import { portalSoundEngine } from "@/lib/captive-portal-plugins/sound-effects";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api-client";

type TabId =
  | "appearance"
  | "mascots"
  | "switchboard"
  | "content"
  | "audio"
  | "languages"
  | "analytics"
  | "code"
  | "backup";

export default function CaptiveCustomizerPage() {
  const { user } = useAuth();
  const tenantSlug = user?.tenantSlug || "demo-isp";

  const [state, setState] = useState<CaptivePortalPluginsState>(getCaptivePortalPluginsState());
  const [activeTab, setActiveTab] = useState<TabId>("appearance");
  const [savedToast, setSavedToast] = useState(false);
  const [selectedMascotIndex, setSelectedMascotIndex] = useState(0);
  const [importJsonText, setImportJsonText] = useState("");
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // Backend Captive Portal Config States
  const [contactPhone, setContactPhone] = useState("0724 165 988");
  const [supportPhone, setSupportPhone] = useState("0724 165 988");
  const [brandName, setBrandName] = useState("SUNTECH FIBRE");
  const [welcomeTitle, setWelcomeTitle] = useState("FAST & SECURE WI-FI");
  const [bannerSubtitle, setBannerSubtitle] = useState("HIGH SPEED FIBER CONNECTION");
  const [activeThemeId, setActiveThemeId] = useState("suntech-blue");
  const [installationFee, setInstallationFee] = useState("1,500/-");

  useEffect(() => {
    setState(getCaptivePortalPluginsState());

    // Fetch live backend settings for this specific tenant
    void (async () => {
      try {
        const json = await apiFetch<any>(`/api/v1/hotspot/${tenantSlug}/config`, { skipAuth: true });
        if (json) {
          if (json.phone) setContactPhone(json.phone);
          if (json.supportPhone) setSupportPhone(json.supportPhone);
          if (json.brandName) setBrandName(json.brandName);
          if (json.welcomeTitle) setWelcomeTitle(json.welcomeTitle);
          if (json.bannerSubtitle) setBannerSubtitle(json.bannerSubtitle);
          if (json.activeThemeId) setActiveThemeId(json.activeThemeId);
          if (json.installationFee) setInstallationFee(json.installationFee);
        }
      } catch (err) {
        console.error("Could not fetch backend hotspot config:", err);
      }
    })();
  }, [tenantSlug]);

  const handleSave = async () => {
    saveCaptivePortalPluginsState(state);

    const payload = {
      phone: contactPhone.trim(),
      supportPhone: supportPhone.trim(),
      brandName: brandName.trim(),
      welcomeTitle: welcomeTitle.trim(),
      bannerSubtitle: bannerSubtitle.trim(),
      activeThemeId: activeThemeId,
      installationFee: installationFee.trim(),
    };

    // Store in browser localStorage
    try {
      localStorage.setItem("mkg_hotspot_captive_config", JSON.stringify(payload));
    } catch {}

    // Persist to backend API for this specific tenant
    try {
      // Saving the captive-portal config is a staff write (see the PUT route in
      // apps/api/src/routes/hotspot.ts) — it must carry the caller's bearer token. Only the
      // matching GET is public.
      await apiFetch(`/api/v1/hotspot/${tenantSlug}/config`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error("Could not save to backend:", err);
    }

    portalSoundEngine.playSuccess();
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 3000);
  };

  const handleReset = () => {
    if (confirm("Reset all captive portal plugin customizations to default factory settings?")) {
      const reset = resetCaptivePortalPluginsState();
      setState(reset);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 3000);
    }
  };

  const updatePluginToggle = (pluginKey: string, val: boolean) => {
    setState((prev) => ({
      ...prev,
      pluginMasterToggles: {
        ...prev.pluginMasterToggles,
        [pluginKey]: val,
      },
    }));
  };

  const selectedMascot = state.mascots[selectedMascotIndex] || state.mascots[0];

  const updateSelectedMascot = (patch: Partial<MascotConfig>) => {
    setState((prev) => {
      const updated = [...prev.mascots];
      if (updated[selectedMascotIndex]) {
        updated[selectedMascotIndex] = { ...updated[selectedMascotIndex]!, ...patch };
      }
      return { ...prev, mascots: updated };
    });
  };

  const handleImportJson = () => {
    if (!importJsonText.trim()) return;
    const ok = importPluginsConfigJson(importJsonText.trim());
    if (ok) {
      setState(getCaptivePortalPluginsState());
      setImportStatus("Import successful! All 30 plugins restored.");
      portalSoundEngine.playSuccess();
    } else {
      setImportStatus("Invalid JSON configuration format.");
      portalSoundEngine.playError();
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 text-white shadow-lg">
              🎭
            </span>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              Captive Portal Studio &amp; 30 Plugins
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Visual editor, cartoon edge mascots, animations, and modular plugin suite for your Wi-Fi hotspot.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleReset}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all"
          >
            Reset Defaults
          </button>
          <a
            href="/hotspot/demo-isp"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 rounded-xl bg-indigo-950 border border-indigo-500/40 hover:bg-indigo-900 text-indigo-200 text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <span>Live Portal &rarr;</span>
          </a>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white text-xs font-black shadow-lg shadow-brand-500/25 transition-all flex items-center gap-2"
          >
            <span>Save &amp; Publish</span>
            {savedToast && <span className="text-emerald-300">✓</span>}
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 p-1.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs font-bold">
        {[
          { id: "appearance" as TabId, label: "🎨 Appearance & Theme" },
          { id: "mascots" as TabId, label: "🎭 Cartoon Edge Mascots" },
          { id: "switchboard" as TabId, label: "🧩 30 Plugins Switchboard" },
          { id: "content" as TabId, label: "📢 Ads & Announcements" },
          { id: "audio" as TabId, label: "🔊 Sound FX Synthesizer" },
          { id: "languages" as TabId, label: "🌐 English & Swahili" },
          { id: "analytics" as TabId, label: "📊 Hotspot Analytics" },
          { id: "code" as TabId, label: "💻 Custom CSS / JS" },
          { id: "backup" as TabId, label: "💾 Backup & Restore" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-xl transition-all ${
              activeTab === t.id
                ? "bg-brand-600 text-white shadow-md shadow-brand-600/30"
                : "text-slate-400 hover:text-white hover:bg-slate-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB 1: APPEARANCE & THEME */}
      {activeTab === "appearance" && (
        <div className="space-y-6">
          {/* BACKEND CONTACT & BRANDING CONFIG */}
          <div className="rounded-2xl border-2 border-brand-500/40 bg-slate-950 p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>📞 Captive Portal Live Contact Numbers &amp; Branding</span>
              </h3>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/40">
                Direct Backend Sync
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Changes made here are stored in the backend and immediately updated on your live captive portal header, contact bars, and installation badges.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Installation / Contact Phone Number
                </label>
                <input
                  type="text"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="0724 165 988"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 focus:border-brand-500 rounded-xl text-xs text-white font-mono outline-none"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">Displays on &quot;For Installation Call:&quot;</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Support / WhatsApp Phone Number
                </label>
                <input
                  type="text"
                  value={supportPhone}
                  onChange={(e) => setSupportPhone(e.target.value)}
                  placeholder="0724 165 988"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 focus:border-brand-500 rounded-xl text-xs text-white font-mono outline-none"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">Used for customer ticket helpline</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  ISP Brand Name
                </label>
                <input
                  type="text"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="SUNTECH FIBRE"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 focus:border-brand-500 rounded-xl text-xs text-white font-bold outline-none"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">Displayed on portal logo &amp; header</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Default Portal Theme
                </label>
                <select
                  value={activeThemeId}
                  onChange={(e) => setActiveThemeId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 focus:border-brand-500 rounded-xl text-xs text-white outline-none"
                >
                  <option value="suntech-blue">Suntech Blue (Red Jacket Boy Denim)</option>
                  <option value="gold-energy">Gold Energy (SPICEZCOM 3D Boy)</option>
                  <option value="modern-glass">Modern Glass</option>
                  <option value="vibrant-retail">Vibrant Retail</option>
                  <option value="hospitality-clean">Hospitality Clean</option>
                  <option value="cyberpunk-neon">Cyberpunk Neon</option>
                </select>
                <span className="text-[10px] text-slate-500 mt-1 block">Default theme for visitors</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Welcome Banner Title
                </label>
                <input
                  type="text"
                  value={welcomeTitle}
                  onChange={(e) => setWelcomeTitle(e.target.value)}
                  placeholder="FAST &amp; SECURE WI-FI"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 focus:border-brand-500 rounded-xl text-xs text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Banner Subtitle
                </label>
                <input
                  type="text"
                  value={bannerSubtitle}
                  onChange={(e) => setBannerSubtitle(e.target.value)}
                  placeholder="HIGH SPEED FIBER CONNECTION"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 focus:border-brand-500 rounded-xl text-xs text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Installation Fee Text
                </label>
                <input
                  type="text"
                  value={installationFee}
                  onChange={(e) => setInstallationFee(e.target.value)}
                  placeholder="1,500/-"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 focus:border-brand-500 rounded-xl text-xs text-white outline-none"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 space-y-5">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>🎨 Colors &amp; Gradients</span>
              </h3>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Primary Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={state.theme.primaryColor}
                    onChange={(e) =>
                      setState((prev) => ({ ...prev, theme: { ...prev.theme, primaryColor: e.target.value } }))
                    }
                    className="w-8 h-8 rounded-lg border-0 bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={state.theme.primaryColor}
                    onChange={(e) =>
                      setState((prev) => ({ ...prev, theme: { ...prev.theme, primaryColor: e.target.value } }))
                    }
                    className="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Secondary Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={state.theme.secondaryColor}
                    onChange={(e) =>
                      setState((prev) => ({ ...prev, theme: { ...prev.theme, secondaryColor: e.target.value } }))
                    }
                    className="w-8 h-8 rounded-lg border-0 bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={state.theme.secondaryColor}
                    onChange={(e) =>
                      setState((prev) => ({ ...prev, theme: { ...prev.theme, secondaryColor: e.target.value } }))
                    }
                    className="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Accent Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={state.theme.accentColor}
                    onChange={(e) =>
                      setState((prev) => ({ ...prev, theme: { ...prev.theme, accentColor: e.target.value } }))
                    }
                    className="w-8 h-8 rounded-lg border-0 bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={state.theme.accentColor}
                    onChange={(e) =>
                      setState((prev) => ({ ...prev, theme: { ...prev.theme, accentColor: e.target.value } }))
                    }
                    className="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-white font-mono"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Background Gradient CSS</label>
              <input
                type="text"
                value={state.theme.backgroundGradient}
                onChange={(e) =>
                  setState((prev) => ({ ...prev, theme: { ...prev.theme, backgroundGradient: e.target.value } }))
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Border Radius (px)</label>
                <input
                  type="range"
                  min="4"
                  max="32"
                  value={state.theme.borderRadiusPx}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      theme: { ...prev.theme, borderRadiusPx: parseInt(e.target.value) },
                    }))
                  }
                  className="w-full"
                />
                <span className="text-xs text-slate-400 font-mono">{state.theme.borderRadiusPx}px</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Shadow Style</label>
                <select
                  value={state.theme.shadowIntensity}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      theme: {
                        ...prev.theme,
                        shadowIntensity: e.target.value as "none" | "subtle" | "neon-glow" | "deep",
                      },
                    }))
                  }
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white"
                >
                  <option value="none">None</option>
                  <option value="subtle">Subtle Soft</option>
                  <option value="neon-glow">Neon Glow (Recommended)</option>
                  <option value="deep">Deep Shadow</option>
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 space-y-5">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>✨ Background Visual FX</span>
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Animated Background Style</label>
              <select
                value={state.backgroundFx.effectType}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    backgroundFx: {
                      ...prev.backgroundFx,
                      effectType: e.target.value as any,
                    },
                  }))
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white"
              >
                <option value="particles">Interactive Particle Web</option>
                <option value="floating-bubbles">Floating Neon Bubbles</option>
                <option value="stars">Twinkling Cyber Stars</option>
                <option value="cyber-grid">Neon Cyberpunk Grid</option>
                <option value="gradient-shift">Animated 4-Color Gradient</option>
                <option value="custom-media">Custom Background Image/Video</option>
              </select>
            </div>

            {state.backgroundFx.effectType === "custom-media" && (
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Media URL (Image or MP4)</label>
                <input
                  type="text"
                  value={state.backgroundFx.customMediaUrl || ""}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      backgroundFx: { ...prev.backgroundFx, customMediaUrl: e.target.value },
                    }))
                  }
                  placeholder="https://..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Particle Density</label>
                <input
                  type="range"
                  min="10"
                  max="60"
                  value={state.backgroundFx.density}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      backgroundFx: { ...prev.backgroundFx, density: parseInt(e.target.value) },
                    }))
                  }
                  className="w-full"
                />
                <span className="text-xs text-slate-400 font-mono">{state.backgroundFx.density}</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Particle Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={state.backgroundFx.color}
                    onChange={(e) =>
                      setState((prev) => ({
                        ...prev,
                        backgroundFx: { ...prev.backgroundFx, color: e.target.value },
                      }))
                    }
                    className="w-8 h-8 rounded-lg border-0 bg-transparent cursor-pointer"
                  />
                  <span className="text-xs text-slate-400 font-mono">{state.backgroundFx.color}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* TAB 2: MASCOTS & CARTOON EDGE MANAGER */}
      {activeTab === "mascots" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Mascot list & selector */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white">Edge Mascots</h3>
              <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={state.mascotsMasterEnabled}
                  onChange={(e) => setState((prev) => ({ ...prev, mascotsMasterEnabled: e.target.checked }))}
                  className="rounded border-slate-700 text-brand-600 focus:ring-brand-500"
                />
                <span>Master Enable</span>
              </label>
            </div>

            <div className="space-y-2">
              {state.mascots.map((m, idx) => (
                <div
                  key={m.id}
                  onClick={() => setSelectedMascotIndex(idx)}
                  className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    selectedMascotIndex === idx
                      ? "border-brand-500 bg-brand-500/10 text-white"
                      : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <MascotRenderer characterId={m.characterId} customImageUrl={m.customImageUrl} size={36} />
                    <div>
                      <h4 className="text-xs font-bold text-white">{m.name}</h4>
                      <p className="text-[10px] text-slate-400 uppercase font-mono">{m.zone}</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={m.enabled}
                    onChange={(e) => {
                      e.stopPropagation();
                      setState((prev) => {
                        const copy = [...prev.mascots];
                        if (copy[idx]) copy[idx] = { ...copy[idx]!, enabled: e.target.checked };
                        return { ...prev, mascots: copy };
                      });
                    }}
                    className="rounded border-slate-700 text-brand-600 focus:ring-brand-500"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Mascot properties editor */}
          {selectedMascot && (
            <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-950 p-6 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <MascotRenderer
                    characterId={selectedMascot.characterId}
                    customImageUrl={selectedMascot.customImageUrl}
                    size={48}
                  />
                  <div>
                    <h3 className="text-base font-bold text-white">{selectedMascot.name}</h3>
                    <p className="text-xs text-slate-400">Position &amp; Physics Configuration</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Character Model</label>
                  <select
                    value={selectedMascot.characterId}
                    onChange={(e) => updateSelectedMascot({ characterId: e.target.value as MascotCharacterId })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-medium"
                  >
                    <optgroup label="Featured 3D Cartoon Characters">
                      <option value="yellow-boy">Yellow Hoodie Boy (Original from Screenshot)</option>
                      <option value="tom-cat">Tom (Blue-Grey Mischief Cat)</option>
                      <option value="jerry-mouse">Jerry (Brown Mouse with Cheese)</option>
                      <option value="spongebob">SpongeBob (Yellow Sea Sponge)</option>
                      <option value="ben-10">Ben 10 (Omnitrix Alien Hero)</option>
                      <option value="spider-hero">Spider Hero (Web Slinger)</option>
                      <option value="mickey-mouse">Mickey Mouse (Magic Ears)</option>
                      <option value="bugs-bunny">Bugs Bunny (Carrot Rabbit)</option>
                      <option value="wendy-girl">Wendy (Explorer Girl with Cap)</option>
                    </optgroup>
                    <optgroup label="Anime & Gaming 3D Mascots">
                      <option value="sonic-speed">Sonic (Speed Hedgehog)</option>
                      <option value="electric-mouse">Pikachu (Electric Rodent)</option>
                      <option value="super-plumber">Mario (Red Cap Plumber)</option>
                      <option value="ninja-shinobi">Naruto (Shinobi Ninja)</option>
                      <option value="saiyan-warrior">Goku (Golden Saiyan)</option>
                      <option value="blue-robot-cat">Doraemon (Pocket Robot Cat)</option>
                      <option value="cyber-android">Mega Man (Blue Android)</option>
                      <option value="cyber-girl">Cyber Girl (Neon Visor)</option>
                    </optgroup>
                    <optgroup label="Superheroes & Fantasy">
                      <option value="dark-knight">Batman (Dark Knight)</option>
                      <option value="iron-avenger">Iron Avenger (Armor Tech)</option>
                      <option value="green-ogre">Shrek (Friendly Green Ogre)</option>
                      <option value="yellow-minion">Minion (One-Eye Capsule)</option>
                      <option value="ninja-turtle">Ninja Turtle (Green Hero)</option>
                    </optgroup>
                    <optgroup label="Classic Toons & Adventure">
                      <option value="spinach-sailor">Popeye (Sailor Man)</option>
                      <option value="mystery-dog">Scooby (Detective Dog)</option>
                      <option value="savanna-lion">Simba (Savanna Lion King)</option>
                      <option value="kung-fu-panda">Po (Kung Fu Panda)</option>
                      <option value="sailor-duck">Donald (Sailor Duck)</option>
                      <option value="pink-starfish">Patrick (Pink Starfish)</option>
                      <option value="speedy-cheetah">Speedy Cheetah (Speed Goggles)</option>
                      <option value="space-astronaut">Cosmic Astronaut (Explorer)</option>
                    </optgroup>
                    <optgroup label="Custom">
                      <option value="custom">Custom Uploaded Image (PNG/SVG/GIF)</option>
                    </optgroup>
                  </select>
                </div>

                {selectedMascot.characterId === "custom" && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Custom Image URL</label>
                    <input
                      type="text"
                      value={selectedMascot.customImageUrl || ""}
                      onChange={(e) => updateSelectedMascot({ customImageUrl: e.target.value })}
                      placeholder="https://..."
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Screen Zone</label>
                  <select
                    value={selectedMascot.zone}
                    onChange={(e) => updateSelectedMascot({ zone: e.target.value as EdgeZone })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white"
                  >
                    <option value="top-left">Top-Left Corner</option>
                    <option value="top-right">Top-Right Corner</option>
                    <option value="left-center">Left Edge (Centered)</option>
                    <option value="right-center">Right Edge (Centered)</option>
                    <option value="bottom-left">Bottom-Left Corner</option>
                    <option value="bottom-right">Bottom-Right Corner</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Physics Animation Preset</label>
                  <select
                    value={selectedMascot.animation}
                    onChange={(e) => updateSelectedMascot({ animation: e.target.value as MascotAnimation })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white"
                  >
                    <option value="float">Float (Smooth Levitating)</option>
                    <option value="bounce">Bounce (Playful Hop)</option>
                    <option value="wiggle">Wiggle (Side to Side)</option>
                    <option value="shake">Shake (Energetic)</option>
                    <option value="swing">Swing (Pendulum)</option>
                    <option value="pulse">Pulse (Breathing Glow)</option>
                    <option value="rotate">Rotate (Continuous Spin)</option>
                    <option value="slide">Slide (Horizontal Drift)</option>
                    <option value="fade">Fade (Ghostly Pulse)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Desktop Size ({selectedMascot.sizePx}px)
                  </label>
                  <input
                    type="range"
                    min="50"
                    max="180"
                    value={selectedMascot.sizePx}
                    onChange={(e) => updateSelectedMascot({ sizePx: parseInt(e.target.value) })}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Mobile Size ({selectedMascot.mobileSizePx}px)
                  </label>
                  <input
                    type="range"
                    min="40"
                    max="120"
                    value={selectedMascot.mobileSizePx}
                    onChange={(e) => updateSelectedMascot({ mobileSizePx: parseInt(e.target.value) })}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Rotation ({selectedMascot.rotationDeg}&deg;)
                  </label>
                  <input
                    type="range"
                    min="-45"
                    max="45"
                    value={selectedMascot.rotationDeg}
                    onChange={(e) => updateSelectedMascot({ rotationDeg: parseInt(e.target.value) })}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Animation Cycle ({selectedMascot.animationSpeedSec}s)
                  </label>
                  <input
                    type="range"
                    min="1.0"
                    max="8.0"
                    step="0.2"
                    value={selectedMascot.animationSpeedSec}
                    onChange={(e) => updateSelectedMascot({ animationSpeedSec: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center gap-6">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedMascot.hideOnMobile}
                    onChange={(e) => updateSelectedMascot({ hideOnMobile: e.target.checked })}
                    className="rounded border-slate-700 text-brand-600 focus:ring-brand-500"
                  />
                  <span>Hide this character on small mobile phones</span>
                </label>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: 30 PLUGINS SWITCHBOARD */}
      {activeTab === "switchboard" && (
        <div className="space-y-4">
          <p className="text-xs text-slate-400">
            Every feature on your captive portal is fully modular. You can independently enable or disable any of the 30 plugins below.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { key: "theme", name: "1. Advanced Theme", desc: "Unlimited color schemes, dark/light modes & typography." },
              { key: "customizer", name: "2. Live Page Customizer", desc: "Interactive title, subtitle, branding & logo." },
              { key: "animation", name: "3. Animation Engine", desc: "Page entrance, card physics & micro-animations." },
              { key: "backgroundFx", name: "4. Animated Background", desc: "Particles, stars, floating bubbles & gradient shift." },
              { key: "mascots", name: "5-10. Cartoon Mascot Suite", desc: "Edge characters, 6 collision zones & physics presets." },
              { key: "loginUi", name: "11. Login UI Customizer", desc: "Voucher, member & pay-as-you-go tabs." },
              { key: "buttonEffects", name: "12. Button Effects", desc: "Neon click ripple, glow & hover pulse." },
              { key: "loadingScreen", name: "13. Loading Splash Screen", desc: "Animated mascot loader during RADIUS auth." },
              { key: "ads", name: "14. Advertisement Plugin", desc: "Rotating sponsor banners & click tracking." },
              { key: "announcements", name: "15. Announcements", desc: "Top scrolling ticker & promotional pills." },
              { key: "sound", name: "16. Music & Sound FX", desc: "Web Audio synthesizer clicks & success chimes." },
              { key: "language", name: "17. Language Suite", desc: "English & Swahili toggle with phrase editor." },
              { key: "mobileOpt", name: "18. Mobile Optimization", desc: "Compact card mode & 48px touch targets." },
              { key: "qrCode", name: "19. QR Code Suite", desc: "Wi-Fi camera connect & voucher QR scanner." },
              { key: "packageDisplay", name: "20. Package Display", desc: "Grid/Carousel cards with BEST VALUE badges." },
              { key: "paymentUi", name: "21. Payment UI Suite", desc: "M-Pesa STK radar wave & confetti celebration." },
              { key: "userDashboard", name: "22. User Dashboard Widget", desc: "Live session clock, remaining MB & disconnect." },
              { key: "notification", name: "23. Notification Toasts", desc: "Animated alerts with sound cues." },
              { key: "support", name: "24. Support Speed-Dial", desc: "1-Click WhatsApp, phone dialer & FAQ modal." },
              { key: "social", name: "25. Social Media Bar", desc: "Facebook, Instagram, TikTok, X & YouTube links." },
              { key: "analytics", name: "26. Analytics Tracker", desc: "Portal impressions, voucher attempts & conversion stats." },
              { key: "customCss", name: "28. Custom CSS Injector", desc: "Scoped CSS styling sandbox." },
              { key: "customJs", name: "29. Custom JavaScript", desc: "Safe script runner for custom tracking tags." },
              { key: "backup", name: "30. Backup & Restore", desc: "1-Click JSON export, import & factory reset." },
            ].map((p) => {
              const isEnabled = state.pluginMasterToggles[p.key] !== false;
              return (
                <div
                  key={p.key}
                  className={`p-4 rounded-2xl border transition-all ${
                    isEnabled
                      ? "border-emerald-500/40 bg-slate-950 shadow-md"
                      : "border-slate-800 bg-slate-900/40 opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <h4 className="text-xs font-bold text-white">{p.name}</h4>
                    <button
                      onClick={() => updatePluginToggle(p.key, !isEnabled)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-colors ${
                        isEnabled
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                          : "bg-slate-800 text-slate-500 border border-slate-700"
                      }`}
                    >
                      {isEnabled ? "ACTIVE" : "OFF"}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{p.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: ADS & ANNOUNCEMENTS */}
      {activeTab === "content" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Announcements */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 space-y-4">
            <h3 className="text-base font-bold text-white">📢 Announcement Banner</h3>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Display Style</label>
              <select
                value={state.announcements.style}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    announcements: { ...prev.announcements, style: e.target.value as any },
                  }))
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white"
              >
                <option value="top-pill">Top Pill Badge</option>
                <option value="marquee">Scrolling Ticker (Marquee)</option>
                <option value="modal-alert">Popup Modal Alert</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Announcement Message</label>
              <textarea
                rows={2}
                value={state.announcements.items[0]?.text || ""}
                onChange={(e) =>
                  setState((prev) => {
                    const items = [...prev.announcements.items];
                    if (items[0]) items[0] = { ...items[0], text: e.target.value };
                    return { ...prev, announcements: { ...prev.announcements, items } };
                  })
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white"
              />
            </div>
          </div>

          {/* Advertisements */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 space-y-4">
            <h3 className="text-base font-bold text-white">⚡ Sponsor &amp; Promo Ads</h3>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Ad Title</label>
              <input
                type="text"
                value={state.ads.ads[0]?.title || ""}
                onChange={(e) =>
                  setState((prev) => {
                    const copy = [...prev.ads.ads];
                    if (copy[0]) copy[0] = { ...copy[0], title: e.target.value };
                    return { ...prev, ads: { ...prev.ads, ads: copy } };
                  })
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Ad Description</label>
              <textarea
                rows={2}
                value={state.ads.ads[0]?.description || ""}
                onChange={(e) =>
                  setState((prev) => {
                    const copy = [...prev.ads.ads];
                    if (copy[0]) copy[0] = { ...copy[0], description: e.target.value };
                    return { ...prev, ads: { ...prev.ads, ads: copy } };
                  })
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Target Click URL</label>
              <input
                type="text"
                value={state.ads.ads[0]?.targetUrl || ""}
                onChange={(e) =>
                  setState((prev) => {
                    const copy = [...prev.ads.ads];
                    if (copy[0]) copy[0] = { ...copy[0], targetUrl: e.target.value };
                    return { ...prev, ads: { ...prev.ads, ads: copy } };
                  })
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: SOUND FX */}
      {activeTab === "audio" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 space-y-6 max-w-2xl">
          <h3 className="text-base font-bold text-white">🔊 Web Audio Sound FX Synthesizer</h3>
          <p className="text-xs text-slate-400">
            Procedurally synthesized audio cues for interactive user feedback. Zero file downloads required.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Master Volume ({Math.round((state.sound.masterVolume || 0.6) * 100)}%)
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={state.sound.masterVolume}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    sound: { ...prev.sound, masterVolume: parseFloat(e.target.value) },
                  }))
                }
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => portalSoundEngine.playClick(state.sound.masterVolume)}
                className="py-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-brand-500 text-white text-xs font-bold transition-all"
              >
                ▶ Test Click Sound
              </button>

              <button
                type="button"
                onClick={() => portalSoundEngine.playSuccess(state.sound.masterVolume)}
                className="py-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500 text-white text-xs font-bold transition-all"
              >
                ▶ Test Success Chime
              </button>

              <button
                type="button"
                onClick={() => portalSoundEngine.playError(state.sound.masterVolume)}
                className="py-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-rose-500 text-white text-xs font-bold transition-all"
              >
                ▶ Test Error Buzz
              </button>

              <button
                type="button"
                onClick={() => portalSoundEngine.playMascotGreeting(state.sound.masterVolume)}
                className="py-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-purple-500 text-white text-xs font-bold transition-all"
              >
                ▶ Test Mascot Greeting
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: LANGUAGES */}
      {activeTab === "languages" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 space-y-5 max-w-2xl">
          <h3 className="text-base font-bold text-white">🌐 Multi-Language (English &amp; Swahili)</h3>
          <p className="text-xs text-slate-400">
            Allow hotspot subscribers to switch between English and Kiswahili seamlessly.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Default Language</label>
              <select
                value={state.language.defaultLanguage}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    language: { ...prev.language, defaultLanguage: e.target.value as "en" | "sw" },
                  }))
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white"
              >
                <option value="en">English (Default)</option>
                <option value="sw">Kiswahili (Swahili)</option>
              </select>
            </div>

            <div className="flex items-center pt-5">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={state.language.allowUserSwitch}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      language: { ...prev.language, allowUserSwitch: e.target.checked },
                    }))
                  }
                  className="rounded border-slate-700 text-brand-600 focus:ring-brand-500"
                />
                <span>Show EN/SW toggle button on portal</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: ANALYTICS */}
      {activeTab === "analytics" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white">📊 Hotspot Activity &amp; Conversion Analytics</h3>
            <span className="text-xs text-slate-400 font-mono">
              Total Recorded Events: {state.analytics.events?.length || 0}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[11px] text-slate-400">Portal Visits</span>
              <p className="text-xl font-black text-brand-400 mt-1">
                {(state.analytics.events || []).filter((e) => e.type === "impression").length}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[11px] text-slate-400">Voucher Logins</span>
              <p className="text-xl font-black text-emerald-400 mt-1">
                {(state.analytics.events || []).filter((e) => e.type === "voucher_success").length}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[11px] text-slate-400">Package Selections</span>
              <p className="text-xl font-black text-indigo-400 mt-1">
                {(state.analytics.events || []).filter((e) => e.type === "package_click").length}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[11px] text-slate-400">Ad Clicks</span>
              <p className="text-xl font-black text-amber-400 mt-1">
                {(state.analytics.events || []).filter((e) => e.type === "ad_click").length}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 8: CUSTOM CODE */}
      {activeTab === "code" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Custom Scoped CSS</h3>
              <input
                type="checkbox"
                checked={state.customCss.enabled}
                onChange={(e) =>
                  setState((prev) => ({ ...prev, customCss: { ...prev.customCss, enabled: e.target.checked } }))
                }
              />
            </div>
            <textarea
              rows={10}
              value={state.customCss.cssContent}
              onChange={(e) =>
                setState((prev) => ({ ...prev, customCss: { ...prev.customCss, cssContent: e.target.value } }))
              }
              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-mono"
            />
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Custom JavaScript (Sandboxed)</h3>
              <input
                type="checkbox"
                checked={state.customJs.enabled}
                onChange={(e) =>
                  setState((prev) => ({ ...prev, customJs: { ...prev.customJs, enabled: e.target.checked } }))
                }
              />
            </div>
            <textarea
              rows={10}
              value={state.customJs.jsContent}
              onChange={(e) =>
                setState((prev) => ({ ...prev, customJs: { ...prev.customJs, jsContent: e.target.value } }))
              }
              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-mono"
            />
          </div>
        </div>
      )}

      {/* TAB 9: BACKUP & RESTORE */}
      {activeTab === "backup" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 space-y-5 max-w-2xl">
          <h3 className="text-base font-bold text-white">💾 Backup, Export &amp; Import Customizations</h3>
          <p className="text-xs text-slate-400">
            Export your entire mascot layout, theme colors, and 30-plugin configurations to a JSON file.
          </p>

          <div className="flex gap-3">
            <button
              onClick={() => {
                const json = exportPluginsConfigJson();
                const blob = new Blob([json], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `captive-portal-config-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
              }}
              className="px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold shadow-lg transition-all"
            >
              📥 Download Backup JSON
            </button>
          </div>

          <div className="pt-4 border-t border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-slate-300">Restore Configuration from JSON</h4>
            <textarea
              rows={4}
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              placeholder="Paste backup JSON content here..."
              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-mono"
            />
            <button
              onClick={handleImportJson}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all"
            >
              Restore Configuration
            </button>
            {importStatus && <p className="text-xs text-brand-400 font-bold">{importStatus}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
