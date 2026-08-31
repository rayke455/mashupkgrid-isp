"use client";

import type { CaptiveThemeProps } from "./types";

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} Mins`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} Hour${hours > 1 ? "s" : ""}`;
  const days = Math.floor(hours / 24);
  if (days === 7) return "1 Week";
  if (days === 30) return "1 Month";
  return `${days} Days`;
}

function formatPrice(priceMinor: number): string {
  const ksh = Math.round(priceMinor / 100);
  return `KES ${ksh}`;
}

export function ModernGlassTheme({
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
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24 relative overflow-x-hidden">
      {/* Luminous Glow Lights */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-32 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 left-1/4 w-96 h-96 bg-emerald-600/15 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-lg mx-auto px-4 pt-6">
        {/* Modern Glass Brand Header */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-500 p-0.5 shadow-lg flex items-center justify-center">
                <div className="h-full w-full bg-slate-950/80 rounded-2xl flex items-center justify-center text-purple-400">
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </div>
              </div>
              <div>
                <h1 className="font-extrabold text-lg text-white tracking-tight leading-tight">
                  {tenantName || "High-Speed Hotspot"}
                </h1>
                <p className="text-xs text-purple-400 font-medium">Gigabit Fiber Wi-Fi</p>
              </div>
            </div>
            <div className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Online
            </div>
          </div>

          <div className="mt-5 rounded-2xl bg-slate-900/60 border border-white/5 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Customer Support</span>
              <a href={`tel:${contactPhone}`} className="font-mono text-purple-400 font-bold hover:underline">
                {contactPhone}
              </a>
            </div>
          </div>
        </div>

        {/* Status / Handshake */}
        {completingRouterLogin ? (
          <div className="mt-6 rounded-3xl border border-purple-500/40 bg-purple-950/40 p-8 text-center backdrop-blur-xl">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-purple-500 border-t-transparent mb-3" />
            <h3 className="font-bold text-white text-lg">Authenticating Session...</h3>
            <p className="text-xs text-purple-300 mt-1">Routing your connection to the gateway.</p>
          </div>
        ) : voucherResult || accountResult ? (
          <div className="mt-6 rounded-3xl border border-emerald-500/40 bg-emerald-950/40 p-8 text-center backdrop-blur-xl">
            <div className="mx-auto h-12 w-12 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center text-2xl font-black mb-3">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="font-bold text-emerald-400 text-lg">Connected to Internet</h3>
            <p className="text-xs text-slate-300 mt-1">Your device is authorized and active.</p>
          </div>
        ) : (
          /* Glass Packages Cards */
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-bold text-slate-300">Choose Your Internet Pass</h2>
              <button
                type="button"
                onClick={onOpenVoucherModal}
                className="text-xs font-semibold text-purple-400 hover:text-purple-300"
              >
                Have a Voucher?
              </button>
            </div>

            {loadingPackages ? (
              <div className="py-12 text-center text-slate-500 text-xs">Loading plans…</div>
            ) : !packages || packages.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">No active packages found.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {packages.map((pkg) => {
                  const isPop = pkg.isPopular;
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => onSelectPackage(pkg)}
                      className={`group relative flex items-center justify-between rounded-2xl border p-4 text-left backdrop-blur-lg transition-all duration-200 active:scale-98 hover:scale-[1.02] ${
                        isPop
                          ? "border-purple-500/60 bg-gradient-to-r from-purple-950/40 via-indigo-950/30 to-purple-950/40 shadow-lg shadow-purple-500/10"
                          : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                      }`}
                    >
                      {isPop && (
                        <span className="absolute -top-2.5 right-4 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-md">
                          Most Popular
                        </span>
                      )}
                      <div>
                        <h3 className="font-bold text-white text-sm group-hover:text-purple-300 transition-colors">
                          {pkg.name}
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {formatDuration(pkg.durationMinutes)} • {pkg.downloadKbps ? `${Math.round(pkg.downloadKbps / 1000)}Mbps` : "Unlimited Speed"}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="block font-extrabold text-base text-purple-400">
                          {formatPrice(pkg.priceMinor)}
                        </span>
                        <span className="mt-1.5 inline-block rounded-full bg-purple-500/20 border border-purple-500/40 px-2.5 py-0.5 text-[10px] font-bold text-purple-300 group-hover:bg-purple-500 group-hover:text-white transition-colors">
                          Buy Now
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Bottom Bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-slate-950/80 border-t border-white/10 px-4 py-3 backdrop-blur-xl flex items-center justify-between max-w-lg mx-auto">
        <button
          type="button"
          onClick={onOpenAccountModal}
          className="text-xs font-medium text-slate-400 hover:text-white flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          Member Login
        </button>

        <button
          type="button"
          onClick={onOpenTvModal}
          className="text-xs font-medium text-slate-400 hover:text-white flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
            <polyline points="17 2 12 7 7 2" />
          </svg>
          Connect TV / Console
        </button>
      </div>
    </div>
  );
}
