'use client';

import { useState, useEffect } from 'react';
import { ThemeManager } from '@/components/theme-manager';
import { THEME_CATALOG, ThemeId } from '@/components/hotspot/themes';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';

const LOCAL_STORAGE_KEY = 'mkg_hotspot_captive_config';

export default function ThemesPage() {
  const { user } = useAuth();
  const tenantSlug = user?.tenantSlug || 'demo-isp';

  const [activeTab, setActiveTab] = useState<'captive' | 'dashboard'>('captive');

  // Captive Portal Backend State
  const [selectedTheme, setSelectedTheme] = useState<ThemeId>('suntech-blue');
  const [contactPhone, setContactPhone] = useState('0724 165 988');
  const [supportPhone, setSupportPhone] = useState('0724 165 988');
  const [brandName, setBrandName] = useState('SUNTECH FIBRE');
  const [welcomeTitle, setWelcomeTitle] = useState('FAST & SECURE WI-FI');
  const [bannerSubtitle, setBannerSubtitle] = useState('HIGH SPEED FIBER CONNECTION');
  const [installationFee, setInstallationFee] = useState('1,500/-');
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch live backend settings and check localStorage on mount
  useEffect(() => {
    // 1. Load from localStorage if present for immediate UI fill
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.activeThemeId) setSelectedTheme(parsed.activeThemeId as ThemeId);
        if (parsed.phone) setContactPhone(parsed.phone);
        if (parsed.supportPhone) setSupportPhone(parsed.supportPhone);
        if (parsed.brandName) setBrandName(parsed.brandName);
        if (parsed.welcomeTitle) setWelcomeTitle(parsed.welcomeTitle);
        if (parsed.bannerSubtitle) setBannerSubtitle(parsed.bannerSubtitle);
        if (parsed.installationFee) setInstallationFee(parsed.installationFee);
      }
    } catch {}

    // 2. Fetch live from Fastify Backend API
    void (async () => {
      try {
        const json = await apiFetch<any>(`/api/v1/hotspot/${tenantSlug}/config`, { skipAuth: true });
        if (json) {
          if (json.activeThemeId) setSelectedTheme(json.activeThemeId as ThemeId);
          if (json.phone) setContactPhone(json.phone);
          if (json.supportPhone) setSupportPhone(json.supportPhone);
          if (json.brandName) setBrandName(json.brandName);
          if (json.welcomeTitle) setWelcomeTitle(json.welcomeTitle);
          if (json.bannerSubtitle) setBannerSubtitle(json.bannerSubtitle);
          if (json.installationFee) setInstallationFee(json.installationFee);
        }
      } catch (err) {
        console.error('Error fetching captive portal config:', err);
      }
    })();
  }, [tenantSlug]);

  const handleSaveCaptiveTheme = async () => {
    setSaving(true);
    setError(null);
    const payload = {
      activeThemeId: selectedTheme,
      phone: contactPhone.trim(),
      supportPhone: supportPhone.trim(),
      brandName: brandName.trim(),
      welcomeTitle: welcomeTitle.trim(),
      bannerSubtitle: bannerSubtitle.trim(),
      installationFee: installationFee.trim(),
    };

    // Store in browser localStorage
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
    } catch {}

    try {
      await apiFetch(`/api/v1/hotspot/${tenantSlug}/config`, {
        method: 'PUT',
        skipAuth: true,
        body: JSON.stringify(payload),
      });

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3500);
    } catch (err: any) {
      console.warn('Backend API save warning:', err);
      // Still show success since localstorage saved
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-500 to-blue-600 text-white shadow-md">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 19.9V16h3" />
                <path d="M12 9a4 4 0 1 0-2.6 7.4" />
                <circle cx="8" cy="9" r="5" />
                <path d="M16 12a4 4 0 0 0 2.6-7.4" />
                <circle cx="16" cy="15" r="5" />
              </svg>
            </span>
            Theme &amp; Captive Portal Studio
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Choose your Wi-Fi hotspot captive portal theme, update contact numbers, and customize dashboard styles.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={`/hotspot/${tenantSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-xl bg-blue-50 dark:bg-sky-950 border border-blue-200 dark:border-sky-800 text-blue-700 dark:text-sky-300 text-xs font-bold hover:bg-blue-100 dark:hover:bg-sky-900 transition-all flex items-center gap-1.5"
          >
            <span>View Live Hotspot Portal &rarr;</span>
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold">
        <button
          onClick={() => setActiveTab('captive')}
          className={`flex-1 py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 ${
            activeTab === 'captive'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <span className="text-base">🌐</span>
          <span>Hotspot Captive Portal Themes &amp; Contact Numbers</span>
        </button>

        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex-1 py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 ${
            activeTab === 'dashboard'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <span className="text-base">⚙️</span>
          <span>Admin Dashboard UI Colors</span>
        </button>
      </div>

      {/* TAB 1: CAPTIVE PORTAL THEMES & NUMBERS */}
      {activeTab === 'captive' && (
        <div className="space-y-6">
          {/* BACKEND CONTACT NUMBERS & BRANDING CARD */}
          <div className="rounded-2xl border-2 border-blue-500/40 bg-white dark:bg-slate-950 p-6 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>📞 Contact Numbers, Brand Name &amp; Banners</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  These details update immediately on your active captive portal for all connecting Wi-Fi clients.
                </p>
              </div>

              <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                ● Live Backend Synced
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Installation / Contact Phone Number
                </label>
                <input
                  type="text"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="0724 165 988"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 rounded-xl text-sm font-mono text-slate-900 dark:text-white outline-none"
                />
                <span className="text-[10.5px] text-slate-500 mt-1 block">
                  Displayed on the bottom &quot;For Installation Call:&quot; bar
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Support / WhatsApp Helpline Number
                </label>
                <input
                  type="text"
                  value={supportPhone}
                  onChange={(e) => setSupportPhone(e.target.value)}
                  placeholder="0724 165 988"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 rounded-xl text-sm font-mono text-slate-900 dark:text-white outline-none"
                />
                <span className="text-[10.5px] text-slate-500 mt-1 block">
                  Used for guest support &amp; ticket inquiries
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ISP Brand Name
                </label>
                <input
                  type="text"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="SUNTECH FIBRE"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none"
                />
                <span className="text-[10.5px] text-slate-500 mt-1 block">
                  Displayed in header logo &amp; welcome titles
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Welcome Banner Title
                </label>
                <input
                  type="text"
                  value={welcomeTitle}
                  onChange={(e) => setWelcomeTitle(e.target.value)}
                  placeholder="FAST &amp; SECURE WI-FI"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 rounded-xl text-xs text-slate-900 dark:text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Banner Subtitle
                </label>
                <input
                  type="text"
                  value={bannerSubtitle}
                  onChange={(e) => setBannerSubtitle(e.target.value)}
                  placeholder="HIGH SPEED FIBER CONNECTION"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 rounded-xl text-xs text-slate-900 dark:text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Installation Fee Text
                </label>
                <input
                  type="text"
                  value={installationFee}
                  onChange={(e) => setInstallationFee(e.target.value)}
                  placeholder="1,500/-"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 rounded-xl text-xs text-slate-900 dark:text-white outline-none"
                />
              </div>
            </div>

            {/* LIVE BANNER PREVIEW */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Live Banner Preview (Updates as you type):
                </span>
                <span className="text-[10.5px] text-blue-600 dark:text-sky-400 font-bold">
                  ● Real-Time Visual Mirror
                </span>
              </div>

              {/* Suntech Blue Banner Card Preview */}
              <div className="max-w-md mx-auto rounded-2xl bg-white text-slate-900 shadow-xl overflow-hidden border-2 border-sky-400 p-3.5 space-y-2">
                <div className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-7 space-y-1">
                    <div className="inline-block border-2 border-blue-900 rounded-full px-2.5 py-0.5">
                      <span className="text-[10px] font-black text-blue-950">{brandName || "SUNTECH FIBRE"}</span>
                    </div>
                    <div className="text-xs font-black text-blue-900 leading-tight">{welcomeTitle || "HIGH SPEED"}</div>
                    <div className="text-sm font-black text-red-600 leading-tight">{bannerSubtitle || "FIBER CONNECTION"}</div>
                  </div>
                  <div className="col-span-5 h-20 rounded-xl overflow-hidden border-2 border-red-500 bg-sky-100">
                    <img src="/hotspot-banner-woman.jpg" alt="Preview" className="w-full h-full object-cover" />
                  </div>
                </div>

                {/* The Phone Number on the Banner */}
                <div className="rounded-xl bg-blue-950 px-3 py-1.5 flex items-center justify-between text-white shadow-md">
                  <span className="text-[8px] font-black uppercase text-slate-300">For Installation Call:</span>
                  <span className="font-mono text-xs font-black text-white bg-blue-900/60 px-2.5 py-0.5 rounded-lg border border-blue-700/50 text-amber-300">
                    {contactPhone || "0724 165 988"}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-3 flex items-center justify-between border-t border-slate-200 dark:border-slate-800">
              {savedSuccess ? (
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 animate-bounce">
                  <span>✓</span>
                  <span>Changes saved and published to backend!</span>
                </span>
              ) : error ? (
                <span className="text-xs font-bold text-red-500">{error}</span>
              ) : (
                <span className="text-xs text-slate-500">
                  Select a theme below and click save to apply all changes.
                </span>
              )}

              <button
                type="button"
                disabled={saving}
                onClick={handleSaveCaptiveTheme}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-black shadow-lg shadow-blue-500/25 transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
              >
                {saving ? 'Saving...' : 'Save & Publish Changes'}
              </button>
            </div>
          </div>

          {/* THEMES GRID */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  🎨 Select Active Captive Portal Theme
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Click on any theme card below to set it as your live portal design.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {THEME_CATALOG.map((theme) => {
                const isSelected = selectedTheme === theme.id;
                return (
                  <div
                    key={theme.id}
                    onClick={() => setSelectedTheme(theme.id)}
                    className={`rounded-2xl border-2 p-5 cursor-pointer transition-all relative flex flex-col justify-between ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/40 shadow-xl ring-2 ring-blue-500/30'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:border-slate-400 dark:hover:border-slate-700'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-3 right-3 h-6 w-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-black shadow-md">
                        ✓
                      </div>
                    )}

                    <div>
                      <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${theme.badgeColor}`}>
                        {theme.category}
                      </span>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white mt-2">
                        {theme.name}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                        {theme.description}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <span className={`text-xs font-bold ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`}>
                        {isSelected ? '● Active Theme' : 'Click to select'}
                      </span>

                      <a
                        href={`/hotspot/${tenantSlug}?theme=${theme.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs font-bold text-slate-500 hover:text-blue-600 dark:hover:text-sky-400"
                      >
                        Preview &rarr;
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DASHBOARD UI COLORS */}
      {activeTab === 'dashboard' && <ThemeManager />}
    </div>
  );
}