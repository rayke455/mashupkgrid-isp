"use client";

import type { CaptiveThemeProps } from "./types";

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}M`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}H`;
  const days = Math.floor(hours / 24);
  if (days === 7) return "7D";
  if (days === 30) return "30D";
  return `${days}D`;
}

function formatPrice(priceMinor: number): string {
  const ksh = Math.round(priceMinor / 100);
  return `KES ${ksh}`;
}

export function CyberpunkNeonTheme({
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
    <div className="min-h-screen bg-black text-cyan-400 font-mono pb-24 relative overflow-x-hidden">
      {/* Cyber Grid Lines Background */}
      <div className="fixed inset-0 pointer-events-none opacity-20 bg-[linear-gradient(to_right,#06b6d4_1px,transparent_1px),linear-gradient(to_bottom,#06b6d4_1px,transparent_1px)] bg-[size:32px_32px]" />

      <div className="relative z-10 max-w-lg mx-auto px-4 pt-6">
        {/* Cyberpunk Header */}
        <div className="rounded-2xl border-2 border-cyan-500 bg-slate-950/90 p-5 shadow-[0_0_25px_rgba(6,182,212,0.3)]">
          <div className="flex items-center justify-between border-b border-cyan-500/40 pb-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-cyan-400 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              <h1 className="text-base font-black tracking-wider text-cyan-300 uppercase">
                {tenantName || "CYBER_GRID_HOTSPOT"}
              </h1>
            </div>
            <span className="rounded bg-cyan-950 border border-cyan-400 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
              SYS:ONLINE
            </span>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-cyan-500">
            <span>TERMINAL_ID: {tenantSlug.toUpperCase()}</span>
            <a href={`tel:${contactPhone}`} className="text-pink-400 font-bold hover:underline">
              {contactPhone}
            </a>
          </div>
        </div>

        {/* Status / Handshake */}
        {completingRouterLogin ? (
          <div className="mt-6 rounded-2xl border-2 border-pink-500 bg-slate-950 p-8 text-center shadow-[0_0_30px_rgba(236,72,153,0.4)]">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-pink-500 border-t-transparent mb-3" />
            <h3 className="font-bold text-pink-400 text-lg tracking-wider">CONNECTING_GATEWAY...</h3>
            <p className="text-xs text-pink-300 mt-1">Establishing encrypted tunnel session.</p>
          </div>
        ) : voucherResult || accountResult ? (
          <div className="mt-6 rounded-2xl border-2 border-emerald-500 bg-slate-950 p-8 text-center shadow-[0_0_30px_rgba(16,185,129,0.4)]">
            <div className="mx-auto h-12 w-12 rounded-full border-2 border-emerald-400 bg-emerald-950 text-emerald-400 flex items-center justify-center text-2xl font-bold mb-3">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="font-bold text-emerald-400 text-lg tracking-wider">ACCESS_GRANTED</h3>
            <p className="text-xs text-slate-300 mt-1">Internet link initialized successfully.</p>
          </div>
        ) : (
          /* Cyberpunk Packages Grid */
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                [ AVAILABLE_DATA_TIERS ]
              </span>
              <button
                type="button"
                onClick={onOpenVoucherModal}
                className="text-xs font-bold text-pink-400 hover:text-pink-300 underline"
              >
                INPUT_VOUCHER_KEY &rarr;
              </button>
            </div>

            {loadingPackages ? (
              <div className="py-12 text-center text-xs text-cyan-600">QUERYING TIERS...</div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {packages?.map((pkg, idx) => {
                  const isPop = pkg.isPopular;
                  const isPink = idx % 2 === 1;
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => onSelectPackage(pkg)}
                      className={`group relative flex flex-col justify-between rounded-xl border-2 bg-slate-950 p-4 text-left transition-all duration-150 active:scale-95 ${
                        isPop
                          ? "border-yellow-400 shadow-[0_0_22px_rgba(250,204,21,0.5)] ring-1 ring-yellow-400"
                          : isPink
                          ? "border-pink-500/80 shadow-[0_0_15px_rgba(236,72,153,0.25)] hover:border-pink-400"
                          : "border-cyan-500/80 shadow-[0_0_15px_rgba(6,182,212,0.25)] hover:border-cyan-400"
                      }`}
                    >
                      {isPop && (
                        <div className="absolute -top-2.5 right-2 rounded bg-yellow-400 text-black px-2 py-0.2 text-[8px] font-black uppercase tracking-widest shadow-md">
                          {pkg.badge || "TOP TIER"}
                        </div>
                      )}
                      <div>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                            isPink
                              ? "bg-pink-950 text-pink-300 border-pink-700"
                              : "bg-cyan-950 text-cyan-300 border-cyan-700"
                          }`}
                        >
                          {formatDuration(pkg.durationMinutes)}
                        </span>
                        <h3 className="font-bold text-sm text-white mt-2 tracking-wide">{pkg.name}</h3>
                        <p className="text-[10px] text-slate-400 mt-1 font-sans">
                          {pkg.downloadKbps ? `${Math.round(pkg.downloadKbps / 1000)}Mbps Bandwidth` : "Max Bandwidth"}
                        </p>
                      </div>

                      <div className="mt-4 pt-2 border-t border-slate-800 flex items-center justify-between">
                        <span
                          className={`text-base font-black ${
                            isPop ? "text-yellow-300" : isPink ? "text-pink-400" : "text-cyan-300"
                          }`}
                        >
                          {formatPrice(pkg.priceMinor)}
                        </span>
                        <span className="text-xs group-hover:translate-x-1 transition-transform">&gt;&gt;</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cyber Bottom Bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-slate-950 border-t-2 border-cyan-500/60 px-4 py-3 flex items-center justify-between max-w-lg mx-auto">
        <button
          type="button"
          onClick={onOpenAccountModal}
          className="text-xs text-cyan-400 hover:text-cyan-200"
        >
          [ AUTH_LOGIN ]
        </button>

        <button
          type="button"
          onClick={onOpenTvModal}
          className="text-xs text-pink-400 hover:text-pink-200"
        >
          [ TV_GATEWAY ]
        </button>
      </div>
    </div>
  );
}
