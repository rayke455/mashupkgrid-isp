"use client";

import type { CaptiveThemeProps } from "./types";

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} Mins`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} Hour${hours > 1 ? "s" : ""}`;
  const days = Math.floor(hours / 24);
  if (days === 7) return "Weekly";
  if (days === 30) return "Monthly";
  return `${days} Days`;
}

function formatPrice(priceMinor: number): string {
  const ksh = Math.round(priceMinor / 100);
  return `KES ${ksh}`;
}

export function VibrantRetailTheme({
  tenantSlug,
  tenantName,
  contactPhone,
  packages,
  loadingPackages,
  onSelectPackage,
  onOpenVoucherModal,
  onOpenAccountModal,
  onOpenTvModal,
  voucherResult,
  accountResult,
  completingRouterLogin,
}: CaptiveThemeProps) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans pb-24">
      {/* Top Colorful Header */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white pt-8 pb-14 px-4 shadow-lg">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-blue-200">
              COMMUNITY WI-FI HOTSPOT
            </span>
            <h1 className="text-2xl font-black tracking-tight">{tenantName || "Super Wi-Fi"}</h1>
            <p className="text-xs text-blue-100 mt-0.5">Fast, Unlimited &amp; Reliable Internet</p>
          </div>
          <div className="h-12 w-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white shadow-md">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.55a11 11 0 0 1 14.08 0" />
              <path d="M1.42 9a16 16 0 0 1 21.16 0" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" strokeWidth="3" />
            </svg>
          </div>
        </div>
      </div>

      {/* Main Content Card Container */}
      <div className="max-w-lg mx-auto px-4 -mt-8">
        {/* Support Pill */}
        <div className="rounded-xl bg-white p-3 shadow-md border border-slate-200/80 flex items-center justify-between mb-4">
          <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
            <svg className="w-4 h-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            Need Help? Call:
          </span>
          <a href={`tel:${contactPhone}`} className="font-mono text-xs font-black text-blue-600 hover:underline">
            {contactPhone}
          </a>
        </div>

        {/* Status / Handshake */}
        {completingRouterLogin ? (
          <div className="rounded-2xl bg-white border border-blue-200 p-8 text-center shadow-lg">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mb-3" />
            <h3 className="font-bold text-slate-900 text-lg">Logging In...</h3>
            <p className="text-xs text-slate-500 mt-1">Please wait while your connection is established.</p>
          </div>
        ) : voucherResult || accountResult ? (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-300 p-8 text-center shadow-lg">
            <div className="mx-auto h-12 w-12 rounded-full bg-emerald-600 text-white flex items-center justify-center text-2xl font-black mb-3">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="font-bold text-emerald-800 text-lg">You are Connected!</h3>
            <p className="text-xs text-emerald-600 mt-1">Your device is authorized to browse.</p>
          </div>
        ) : (
          /* Retail Packages Grid */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-700">Select Internet Plan</h2>
              <button
                type="button"
                onClick={onOpenVoucherModal}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 underline"
              >
                Redeem Voucher
              </button>
            </div>

            {loadingPackages ? (
              <div className="py-12 text-center text-xs text-slate-400">Loading packages...</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {packages?.map((pkg) => {
                  const isPop = pkg.isPopular;
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => onSelectPackage(pkg)}
                      className={`relative flex flex-col justify-between rounded-2xl bg-white p-3.5 border-2 shadow-sm active:scale-95 transition-all text-left group ${
                        isPop
                          ? "border-blue-600 shadow-blue-500/15 ring-2 ring-blue-500/20"
                          : "border-slate-200 hover:border-blue-500 hover:shadow-md"
                      }`}
                    >
                      {isPop && (
                        <div className="absolute -top-2.5 right-2 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-2 py-0.5 text-[8.5px] font-black uppercase text-white shadow-xs">
                          {pkg.badge || "HOT DEAL"}
                        </div>
                      )}
                      <div>
                        <span className="inline-block rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700 uppercase">
                          {formatDuration(pkg.durationMinutes)}
                        </span>
                        <h3 className="font-black text-sm text-slate-900 mt-2 line-clamp-1">{pkg.name}</h3>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {pkg.downloadKbps ? `${Math.round(pkg.downloadKbps / 1000)} Mbps Speed` : "High Speed"}
                        </p>
                      </div>

                      <div className="mt-4 pt-2 border-t border-slate-100 flex items-center justify-between">
                        <span className="font-black text-base text-emerald-600">{formatPrice(pkg.priceMinor)}</span>
                        <span className="text-xs text-blue-600 group-hover:translate-x-1 transition-transform">&rarr;</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Retail Bottom Nav */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 px-4 py-3 shadow-lg flex items-center justify-between max-w-lg mx-auto">
        <button
          type="button"
          onClick={onOpenAccountModal}
          className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          Account Login
        </button>

        <button
          type="button"
          onClick={onOpenTvModal}
          className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
            <polyline points="17 2 12 7 7 2" />
          </svg>
          Connect TV
        </button>
      </div>
    </div>
  );
}
