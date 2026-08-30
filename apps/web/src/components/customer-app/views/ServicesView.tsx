"use client";

import React, { useState } from "react";
import type { CustomerProfile, InternetPackage, TvPackage } from "../types";
import { RefreshCwIcon, ArrowUpIcon, CheckIcon, TvIcon, WifiIcon, SpeedometerIcon } from "../icons";

interface ServicesViewProps {
  customer: CustomerProfile;
  internetPackages: InternetPackage[];
  tvPackages: TvPackage[];
  brandName?: string;
  onOpenPayModal: (type: "INTERNET" | "TV" | "OUTSTANDING_BALANCE", amount: number, packageName?: string) => void;
  onOpenSpeedTest: () => void;
}

export function ServicesView({
  customer,
  internetPackages,
  tvPackages,
  brandName = "FiberConnect",
  onOpenPayModal,
  onOpenSpeedTest,
}: ServicesViewProps) {
  const [activeTab, setActiveTab] = useState<"internet" | "tv">("internet");
  const [selectedTvPackageForChannels, setSelectedTvPackageForChannels] = useState<TvPackage | null>(null);

  return (
    <div className="space-y-5 pb-24 animate-fade-in">
      {/* Top Header matching Screenshot */}
      <div className="px-1 pt-2">
        <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          Services &amp; Subscriptions
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Manage your high-speed internet plan and digital TV subscriptions.
        </p>

        {/* Tab Switcher matching Screenshot */}
        <div className="mt-4 flex p-1 rounded-2xl bg-slate-200/70 dark:bg-slate-800/80 max-w-xs">
          <button
            type="button"
            onClick={() => setActiveTab("internet")}
            className={`flex-1 py-2 px-4 rounded-xl text-xs font-bold transition-all ${
              activeTab === "internet"
                ? "bg-[#090b4d] text-white shadow-md"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            Internet
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("tv")}
            className={`flex-1 py-2 px-4 rounded-xl text-xs font-bold transition-all ${
              activeTab === "tv"
                ? "bg-[#090b4d] text-white shadow-md"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            TV
          </button>
        </div>
      </div>

      {/* ===================== INTERNET TAB ===================== */}
      {activeTab === "internet" && (
        <div className="space-y-5">
          {/* Active Plan Card matching Screenshot */}
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
              <span className="text-[11px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                ACTIVE PLAN
              </span>
            </div>

            <h3 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {customer.internetService.packageName}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Billing Cycle resets in {customer.internetService.daysRemaining} days (on {customer.internetService.expiresAt})
            </p>

            {/* Action Buttons matching Screenshot */}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onOpenPayModal("INTERNET", customer.internetService.priceKes, customer.internetService.packageName)}
                className="py-3 px-4 rounded-2xl border-2 border-blue-600 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
              >
                <RefreshCwIcon className="w-4 h-4" />
                <span>Renew</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById("available-packages-section");
                  el?.scrollIntoView({ behavior: "smooth" });
                }}
                className="py-3 px-4 rounded-2xl bg-[#090b4d] hover:bg-[#060835] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all"
              >
                <ArrowUpIcon className="w-4 h-4" />
                <span>Upgrade</span>
              </button>
            </div>
          </div>

          {/* Available Packages Section matching Screenshot */}
          <div id="available-packages-section" className="space-y-3 pt-1">
            <h4 className="text-lg font-black text-slate-900 dark:text-white px-1">
              Available Packages
            </h4>

            <div className="space-y-3">
              {internetPackages.map((pkg) => {
                const isCurrentPlan = pkg.speedMbps === customer.internetService.speedMbps;

                return (
                  <div
                    key={pkg.id}
                    className={`rounded-3xl p-5 sm:p-6 transition-all relative ${
                      isCurrentPlan
                        ? "bg-indigo-50/70 dark:bg-indigo-950/40 border-2 border-indigo-500/80 shadow-md"
                        : "bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm"
                    }`}
                  >
                    {/* Badge */}
                    {isCurrentPlan && (
                      <span className="absolute top-5 right-5 px-3 py-1 rounded-full bg-[#090b4d] text-white text-[10px] font-black uppercase tracking-wider shadow-sm">
                        CURRENT PLAN
                      </span>
                    )}

                    {/* Speed & Tier */}
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
                        {pkg.speedMbps}
                      </span>
                      <span className="text-xs font-bold text-slate-500">Mbps</span>
                    </div>
                    <span className="text-xs font-bold text-slate-400 block -mt-1">
                      {pkg.tier}
                    </span>

                    {/* Feature Bullets */}
                    <div className="mt-3.5 space-y-1.5 border-t border-slate-100 dark:border-slate-800/80 pt-3">
                      {pkg.features.map((feat, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                          <CheckIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                          <span>{feat}</span>
                        </div>
                      ))}
                    </div>

                    {/* Price & CTA matching Screenshot */}
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                      <div>
                        <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                          KES {pkg.priceKes.toLocaleString()}
                        </span>
                        <span className="text-xs font-semibold text-slate-400">/mo (${pkg.priceUsd})</span>
                      </div>

                      {isCurrentPlan ? (
                        <span className="px-4 py-2 rounded-xl bg-indigo-200/60 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200 text-xs font-bold">
                          Active
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOpenPayModal("INTERNET", pkg.priceKes, `${pkg.speedMbps} Mbps ${pkg.tier}`)}
                          className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-all ${
                            pkg.speedMbps > customer.internetService.speedMbps
                              ? "bg-[#090b4d] hover:bg-[#060835] text-white shadow-md"
                              : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                          }`}
                        >
                          {pkg.speedMbps > customer.internetService.speedMbps ? "Upgrade" : "Select"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ===================== TV TAB ===================== */}
      {activeTab === "tv" && (
        <div className="space-y-4">
          <div className="rounded-3xl bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-5 shadow-lg relative overflow-hidden">
            <div className="relative z-10">
              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/20">
                FIBER TV BROADCAST
              </span>
              <h3 className="text-xl font-black mt-2">Crystal Clear HD &amp; 4K Entertainment</h3>
              <p className="text-xs text-blue-200 mt-1">
                Stream live Premier League, Movies, News, and Kids channels directly to your Smart TV or Phone.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {tvPackages.map((tv) => {
              const isCurrent = tv.tier.toLowerCase() === "premium";

              return (
                <div
                  key={tv.id}
                  className={`rounded-3xl p-5 sm:p-6 transition-all ${
                    isCurrent
                      ? "bg-blue-50/70 dark:bg-blue-950/40 border-2 border-blue-500 shadow-md"
                      : "bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-lg font-black text-slate-900 dark:text-white">{tv.name}</h4>
                      <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                        {tv.channelsCount}+ Live HD Channels
                      </span>
                    </div>
                    {isCurrent && (
                      <span className="px-3 py-1 rounded-full bg-[#090b4d] text-white text-[10px] font-black uppercase">
                        CURRENT PLAN
                      </span>
                    )}
                  </div>

                  <div className="mt-3 space-y-1 border-t border-slate-100 dark:border-slate-800 pt-3">
                    {tv.features.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <CheckIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-xl font-black text-slate-900 dark:text-white">
                        KES {tv.priceKes.toLocaleString()}
                      </span>
                      <span className="text-xs text-slate-400">/mo</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedTvPackageForChannels(tv)}
                        className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs"
                      >
                        Channels
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenPayModal("TV", tv.priceKes, tv.name)}
                        className="px-4 py-2 rounded-xl bg-[#090b4d] text-white font-bold text-xs shadow-sm"
                      >
                        {isCurrent ? "Renew" : "Subscribe"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Channels Modal */}
      {selectedTvPackageForChannels && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  {selectedTvPackageForChannels.name} Lineup
                </h3>
                <p className="text-xs text-slate-400">
                  {selectedTvPackageForChannels.channelsCount}+ Channels Included
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTvPackageForChannels(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 flex-1 overflow-y-auto pr-1 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {selectedTvPackageForChannels.channelsList.map((ch, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2"
                  >
                    <TvIcon className="w-4 h-4 text-blue-500 shrink-0" />
                    <span className="truncate">{ch}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  const pkg = selectedTvPackageForChannels;
                  setSelectedTvPackageForChannels(null);
                  onOpenPayModal("TV", pkg.priceKes, pkg.name);
                }}
                className="w-full py-3 rounded-2xl bg-[#090b4d] text-white font-bold text-xs shadow-md"
              >
                Subscribe for KES {selectedTvPackageForChannels.priceKes.toLocaleString()}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
