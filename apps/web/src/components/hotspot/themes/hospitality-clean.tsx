"use client";

import type { CaptiveThemeProps } from "./types";

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""}`;
  const days = Math.floor(hours / 24);
  if (days === 7) return "1 week pass";
  if (days === 30) return "1 month pass";
  return `${days} days`;
}

function formatPrice(priceMinor: number): string {
  const ksh = Math.round(priceMinor / 100);
  return `KES ${ksh.toLocaleString()}`;
}

export function HospitalityCleanTheme({
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
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans pb-24">
      {/* Hospitality Header */}
      <div className="border-b border-slate-800 bg-slate-950/60 backdrop-blur-md pt-8 pb-6 px-4">
        <div className="max-w-lg mx-auto text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-slate-200 text-xl mb-3 border border-slate-700">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
              <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
              <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
              <path d="M10 6h4" />
              <path d="M10 10h4" />
              <path d="M10 14h4" />
              <path d="M10 18h4" />
            </svg>
          </div>
          <h1 className="text-xl font-medium tracking-tight text-white">{tenantName || "Guest Wi-Fi"}</h1>
          <p className="text-xs text-slate-400 mt-1">High-Speed Internet Access for Guests</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6">
        {/* Status / Handshake */}
        {completingRouterLogin ? (
          <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-8 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-400 border-t-white mb-3" />
            <h3 className="font-medium text-white text-base">Authenticating Access...</h3>
            <p className="text-xs text-slate-400 mt-1">Connecting to guest network.</p>
          </div>
        ) : voucherResult || accountResult ? (
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/30 p-8 text-center">
            <div className="mx-auto h-10 w-10 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center text-xl font-bold mb-3">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="font-medium text-emerald-300 text-base">Connected to Guest Wi-Fi</h3>
            <p className="text-xs text-slate-400 mt-1">Your session is now active.</p>
          </div>
        ) : (
          /* Clean Hospitality Packages List */
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Available Passes</span>
              <button
                type="button"
                onClick={onOpenVoucherModal}
                className="text-xs text-slate-300 hover:text-white underline"
              >
                Enter Guest Code
              </button>
            </div>

            {loadingPackages ? (
              <div className="py-12 text-center text-xs text-slate-500">Loading access passes...</div>
            ) : (
              <div className="space-y-2.5">
                {packages?.map((pkg) => {
                  const isPop = pkg.isPopular;
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => onSelectPackage(pkg)}
                      className={`w-full flex items-center justify-between rounded-xl p-4 text-left transition-colors active:scale-[0.99] ${
                        isPop
                          ? "border-2 border-emerald-500/80 bg-emerald-950/20 shadow-emerald-500/10"
                          : "border border-slate-800 bg-slate-800/40 hover:border-slate-600 hover:bg-slate-800/80"
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-sm text-white">{pkg.name}</h3>
                          {isPop && (
                            <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[9px] font-bold text-emerald-300">
                              {pkg.badge || "RECOMMENDED"}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {formatDuration(pkg.durationMinutes)} &bull;{" "}
                          {pkg.downloadKbps ? `${Math.round(pkg.downloadKbps / 1000)} Mbps` : "High Speed"}
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="font-bold text-sm text-white block">{formatPrice(pkg.priceMinor)}</span>
                        <span className="text-[11px] font-medium text-emerald-400 mt-0.5 block">Select &rarr;</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Terms and Support Info */}
            <div className="pt-6 text-center text-xs text-slate-500 space-y-1">
              <p>Reception &amp; Support: <a href={`tel:${contactPhone}`} className="text-slate-400 hover:underline">{contactPhone}</a></p>
              <p className="text-[11px]">By connecting, you agree to our guest network terms.</p>
            </div>
          </div>
        )}
      </div>

      {/* Hospitality Bottom Bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-slate-950/90 border-t border-slate-800 px-4 py-3 flex items-center justify-between max-w-lg mx-auto">
        <button
          type="button"
          onClick={onOpenAccountModal}
          className="text-xs text-slate-400 hover:text-white"
        >
          Staff / Resident Login
        </button>

        <button
          type="button"
          onClick={onOpenTvModal}
          className="text-xs text-slate-400 hover:text-white"
        >
          In-Room TV Setup
        </button>
      </div>
    </div>
  );
}
