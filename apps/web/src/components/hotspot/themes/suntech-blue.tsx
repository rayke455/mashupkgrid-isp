"use client";

import React from "react";
import type { CaptiveThemeProps } from "./types";

function WifiIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" strokeWidth="3" />
    </svg>
  );
}

function PhoneIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function CheckIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function RefreshIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

function TvIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
      <polyline points="17 2 12 7 7 2" />
    </svg>
  );
}

function formatDurationTitle(name: string, minutes: number): string {
  if (name && name.length <= 12) return name;
  if (minutes === 90) return "1hour30mins";
  if (minutes < 60) return `${minutes}mins`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}hours`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "24hours";
  if (days === 2) return "2days";
  if (days === 7) return "weekly";
  if (days === 14) return "2weeks";
  if (days === 30) return "monthly";
  return `${days}days`;
}

function formatPriceKsh(priceMinor: number): string {
  const ksh = Math.round(priceMinor / 100);
  return `KSH:${ksh}/-`;
}

// 3D Cartoon Boy in Red Jacket Pointing Finger
function RedJacketBoySvg({ className = "w-16 h-20" }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 3D Drop Shadow */}
      <ellipse cx="45" cy="95" rx="22" ry="4" fill="#000" fillOpacity="0.35" filter="blur(2px)" />

      {/* Legs & Dark Jeans */}
      <path d="M35 58 L32 88 L38 88 L42 62 Z" fill="#1e293b" />
      <path d="M44 58 L48 88 L54 88 L48 62 Z" fill="#0f172a" />

      {/* Red & White Sneakers */}
      <path d="M28 88 C28 85 38 85 40 88 L41 93 L28 93 Z" fill="#dc2626" />
      <rect x="28" y="92" width="13" height="3" rx="1.5" fill="#ffffff" />
      <path d="M46 88 C46 85 56 85 58 88 L59 93 L46 93 Z" fill="#dc2626" />
      <rect x="46" y="92" width="13" height="3" rx="1.5" fill="#ffffff" />

      {/* Red Jacket Body & Black T-Shirt */}
      <path d="M28 35 C28 28 58 28 58 35 L56 60 C56 62 30 62 30 60 Z" fill="#dc2626" />
      {/* Inner Black T-Shirt with white collar */}
      <path d="M37 32 L49 32 L47 58 L39 58 Z" fill="#0f172a" />
      <path d="M40 32 Q43 36 46 32" stroke="#ffffff" strokeWidth="1.5" fill="none" />
      {/* White Zipper / Trim */}
      <path d="M36 32 L37 60" stroke="#ffffff" strokeWidth="1.5" />
      <path d="M49 32 L48 60" stroke="#ffffff" strokeWidth="1.5" />

      {/* Right Arm hanging / resting */}
      <path d="M56 34 Q62 44 58 54 Q55 56 52 52 Q54 44 50 36 Z" fill="#dc2626" />
      <circle cx="58" cy="54" r="3.5" fill="#fbcfe8" />

      {/* Left Arm pointing at Signboard */}
      {/* Upper Arm */}
      <path d="M30 35 Q20 38 14 42 Q12 45 16 46 Q22 43 30 40 Z" fill="#dc2626" />
      {/* Forearm & Pointing Hand */}
      <path d="M14 42 Q6 40 2 38 Q1 41 5 43 Q10 44 15 46 Z" fill="#fbcfe8" />
      {/* Index Finger pointing left */}
      <path d="M3 38 L-4 38 C-6 38 -6 41 -4 41 L2 41 Z" fill="#fbcfe8" />

      {/* Head & Face */}
      <circle cx="43" cy="22" r="14" fill="#fed7aa" />
      {/* Hair (Spiky 3D Dark Brown Hair) */}
      <path d="M30 20 C29 8 57 8 56 20 C54 12 48 10 43 11 C38 10 32 12 30 20 Z" fill="#451a03" />
      <path d="M33 13 L36 8 L39 12 L43 7 L47 12 L50 8 L53 14" stroke="#451a03" strokeWidth="2" strokeLinejoin="round" fill="#451a03" />

      {/* Expressive Eyes */}
      <ellipse cx="38" cy="21" rx="2.5" ry="3.5" fill="#ffffff" />
      <circle cx="38.5" cy="21" r="1.8" fill="#1e1b4b" />
      <circle cx="39" cy="20.5" r="0.6" fill="#ffffff" />

      <ellipse cx="48" cy="21" rx="2.5" ry="3.5" fill="#ffffff" />
      <circle cx="47.5" cy="21" r="1.8" fill="#1e1b4b" />
      <circle cx="47" cy="20.5" r="0.6" fill="#ffffff" />

      {/* Eyebrows */}
      <path d="M35 16 Q38 14 41 16" stroke="#451a03" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M45 16 Q48 14 51 16" stroke="#451a03" strokeWidth="1.5" strokeLinecap="round" fill="none" />

      {/* Smile with White Teeth */}
      <path d="M39 27 Q43 32 47 27 Z" fill="#dc2626" />
      <path d="M40 27 Q43 29 46 27" fill="#ffffff" />

      {/* Ears */}
      <circle cx="29" cy="22" r="3" fill="#fbcfe8" />
      <circle cx="57" cy="22" r="3" fill="#fbcfe8" />
    </svg>
  );
}

export function SuntechBlueTheme({
  tenantSlug,
  tenantName,
  contactPhone,
  supportPhone,
  welcomeTitle,
  bannerSubtitle,
  installationFee,
  fiberRates,
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
  const displayName = tenantName.toUpperCase();
  const titleText = welcomeTitle || "HIGH SPEED";
  const subText = bannerSubtitle || "FIBER CONNECTION";
  const phoneToDisplay = contactPhone || supportPhone || "0724 165 988";

  const defaultRates = [
    { speed: "10MBPS", price: "1,500/-" },
    { speed: "15MBPS", price: "2,000/-" },
    { speed: "20MBPS", price: "2,500/-" },
    { speed: "30MBPS", price: "3,000/-" },
  ];
  const ratesToDisplay = fiberRates && fiberRates.length > 0 ? fiberRates : defaultRates;

  return (
    <div className="min-h-screen bg-[#0284c7] text-white relative overflow-x-hidden font-sans pb-24 select-none">
      {/* Rich Denim Texture & Ambient Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 opacity-40 bg-[radial-gradient(#0369a1_1px,transparent_1px)] [background-size:16px_16px]" />

      <div className="relative z-10 max-w-lg mx-auto px-3.5 pt-3">
        {/* Top Header Card matching Suntech Fibre Screenshot */}
        <div className="rounded-3xl bg-white text-slate-900 shadow-2xl overflow-hidden relative border-2 border-sky-400">
          <div className="p-4 relative z-10">
            {/* 3 Red Header Dots */}
            <div className="flex items-center gap-1 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-600 inline-block" />
              <span className="w-1.5 h-1.5 rounded-full bg-red-600 inline-block" />
              <span className="w-1.5 h-1.5 rounded-full bg-red-600 inline-block" />
            </div>

            <div className="grid grid-cols-12 gap-2">
              {/* Left Column: Brand, Tagline, and 4-tier Fibre Price Grid */}
              <div className="col-span-7 space-y-2">
                {/* Suntech Fibre Logo */}
                <div>
                  <div className="inline-block border-2 border-blue-900 rounded-full px-3 py-0.5">
                    <span className="text-xs font-black tracking-wider text-blue-950">
                      {displayName.includes("FIBRE") ? displayName : `${displayName} FIBRE`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="rounded bg-blue-900 text-white px-1.5 py-0.2 text-[8px] font-black tracking-widest flex items-center gap-0.5">
                      <WifiIcon className="w-2.5 h-2.5" /> Wi Fi
                    </span>
                  </div>
                </div>

                {/* Dynamic Welcome Title & Subtitle */}
                <div>
                  <h1 className="text-base font-black text-blue-900 tracking-tight leading-none uppercase">
                    {titleText}
                  </h1>
                  <h2 className="text-lg font-black text-red-600 tracking-tight leading-none uppercase mt-0.5">
                    {subText}
                  </h2>
                  <p className="text-[8.5px] font-bold text-slate-500 mt-1">Fast • Reliable • Unlimited</p>
                </div>

                {/* 4-Box Home Fibre Pricing Table matching Screenshot */}
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  {ratesToDisplay.map((r, idx) => (
                    <div key={idx} className="rounded-md border border-blue-800 overflow-hidden text-center bg-white shadow-2xs">
                      <div className="bg-blue-900 text-white text-[8px] font-black py-0.5">{r.speed}</div>
                      <div className="text-[10.5px] font-black text-red-600 py-0.5">{r.price}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: Woman in Red Hijab + Denim Jacket with Laptop */}
              <div className="col-span-5 relative flex items-center justify-center">
                <div className="w-full h-44 rounded-2xl overflow-hidden shadow-md border-2 border-red-500 bg-sky-100 relative">
                  <img
                    src="/hotspot-banner-woman.jpg"
                    alt="Subscriber"
                    className="w-full h-full object-cover"
                  />
                  {/* Bottom Red Swish */}
                  <div className="absolute bottom-0 inset-x-0 h-4 bg-gradient-to-r from-red-600 to-red-700 transform -skew-y-3" />
                </div>
              </div>
            </div>

            {/* Bottom Navy Contact Bar matching Screenshot */}
            <div className="mt-3 rounded-xl bg-blue-950 px-3 py-2 flex items-center justify-between text-white shadow-md">
              <div className="flex items-center gap-1.5 text-white">
                <span className="h-5 w-5 rounded-full bg-blue-800 text-white flex items-center justify-center">
                  <PhoneIcon className="w-3 h-3" />
                </span>
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-200">
                  For Installation Call:
                </span>
              </div>
              <a
                href={`tel:${phoneToDisplay}`}
                className="font-mono text-sm font-black tracking-wider text-white hover:text-red-400"
              >
                {phoneToDisplay}
              </a>
            </div>
          </div>
        </div>

        {/* Handshake & Status */}
        {completingRouterLogin ? (
          <div className="mt-6 rounded-2xl bg-blue-950/90 border border-red-500 p-6 text-center shadow-2xl backdrop-blur-md">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-red-500 border-t-transparent mb-3" />
            <p className="text-lg font-black text-white">Connecting Gateway Router…</p>
            <p className="text-xs text-slate-300 mt-1">Please hold on while we authenticate your device.</p>
          </div>
        ) : voucherResult || accountResult ? (
          <div className="mt-6 rounded-2xl bg-emerald-900/90 border border-emerald-400 p-6 text-center shadow-2xl backdrop-blur-md">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-slate-950 text-2xl font-black mb-2">
              <CheckIcon className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-black text-emerald-300">You Are Connected!</h2>
            <p className="text-xs text-slate-200 mt-1">Your internet session is active.</p>
          </div>
        ) : (
          /* 3x3 Blue Ripped Denim Cards with 3D Red Jacket Boy pointing at Signboard */
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5 drop-shadow-sm">
                <span className="h-2 w-2 rounded-full bg-red-400 animate-ping" />
                Select Your Wi-Fi Package
              </span>
              <button
                type="button"
                onClick={onOpenVoucherModal}
                className="text-xs font-bold text-sky-100 hover:text-white underline drop-shadow-sm"
              >
                Use Voucher
              </button>
            </div>

            {loadingPackages ? (
              <div className="py-16 text-center text-sky-200 text-xs">Loading packages…</div>
            ) : !packages || packages.length === 0 ? (
              <div className="py-12 text-center text-sky-200 text-xs bg-blue-900/60 rounded-2xl border border-blue-800">
                No active packages available.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2.5">
                {packages.map((pkg, idx) => {
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => onSelectPackage(pkg)}
                      className="group relative flex flex-col justify-between rounded-2xl p-1 text-center shadow-xl transition-all duration-150 active:scale-95 hover:scale-[1.04] overflow-hidden"
                      style={{ minHeight: "128px" }}
                    >
                      {/* Ripped Denim Blue Paper Outer Frame */}
                      <div className="absolute inset-0 bg-[#0284c7] border-2 border-sky-300/40 rounded-2xl z-0" />

                      {/* Jagged Ripped Edge Shadow Effect */}
                      <div className="absolute inset-1.5 rounded-xl bg-gradient-to-br from-red-600 via-red-600 to-red-700 shadow-inner z-0 overflow-hidden">
                        {/* Torn Paper Jagged Edge Highlights */}
                        <div className="absolute -top-1 inset-x-0 h-2 bg-sky-200 opacity-60 transform -rotate-1" />
                        <div className="absolute -bottom-1 inset-x-0 h-2 bg-sky-200 opacity-60 transform rotate-1" />
                      </div>

                      {/* White Signboard Center Area */}
                      <div className="relative z-10 my-auto ml-1 mr-8 bg-white/95 rounded-xl p-1.5 shadow-md border border-slate-200 flex flex-col justify-center items-start text-left min-h-[72px]">
                        {/* Package Duration in Bold Black */}
                        <span className="block text-[11.5px] font-black text-slate-950 tracking-tight leading-tight">
                          {formatDurationTitle(pkg.name, pkg.durationMinutes)}
                        </span>

                        {/* Package Price in Bold Red */}
                        <span className="block font-black text-[15px] text-red-600 tracking-tight leading-none mt-1">
                          {formatPriceKsh(pkg.priceMinor)}
                        </span>
                      </div>

                      {/* 3D Boy in Red Jacket Pointing Finger on the Right */}
                      <div className="absolute -bottom-1 -right-2 z-20 pointer-events-none transform group-hover:scale-110 transition-transform filter drop-shadow-md">
                        <RedJacketBoySvg className="w-16 h-20" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Bottom Action Bar matching Screenshot */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-blue-950/95 border-t border-sky-900 px-4 py-2.5 backdrop-blur-md flex items-center justify-between max-w-lg mx-auto">
        <button
          type="button"
          onClick={onOpenAccountModal}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-200 hover:text-white transition-colors"
        >
          <RefreshIcon className="w-3.5 h-3.5" />
          <span>Reconnect account</span>
        </button>

        <button
          type="button"
          onClick={onOpenTvModal}
          className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-red-600 to-rose-600 px-4 py-1.5 text-xs font-black text-white shadow-lg active:scale-95 hover:scale-105 transition-transform"
        >
          <TvIcon className="w-3.5 h-3.5" />
          <span>Pay for a TV</span>
        </button>
      </div>
    </div>
  );
}
