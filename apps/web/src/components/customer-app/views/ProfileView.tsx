"use client";

import React, { useState } from "react";
import type { CustomerProfile, ConnectedDevice } from "../types";
import {
  UserIcon,
  CopyIcon,
  Share2Icon,
  CheckIcon,
  RouterIcon,
  ShieldCheckIcon,
} from "../icons";

interface ProfileViewProps {
  customer: CustomerProfile;
  devices: ConnectedDevice[];
  brandName?: string;
  onToggleDeviceBlock: (deviceId: string) => void;
  onLogout: () => void;
}

export function ProfileView({
  customer,
  devices,
  brandName = "FiberConnect",
  onToggleDeviceBlock,
  onLogout,
}: ProfileViewProps) {
  const [copied, setCopied] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<"profile" | "referrals" | "devices">("profile");

  const handleCopy = () => {
    navigator.clipboard.writeText(customer.referralCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareWhatsApp = () => {
    const shareText = `Get ultra-fast fiber internet from ${brandName}! Use my referral code ${customer.referralCode} to get KES 200 discount on your first subscription: https://fiberconnect.co.ke/register?ref=${customer.referralCode}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank");
  };

  return (
    <div className="space-y-4 pb-24 animate-fade-in">
      {/* Header */}
      <div className="px-1 pt-2">
        <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          Customer Account
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Manage your personal subscriber profile, devices, and referral rewards.
        </p>

        {/* Sub-tab pills */}
        <div className="mt-3 flex p-1 rounded-2xl bg-slate-200/70 dark:bg-slate-800/80">
          <button
            type="button"
            onClick={() => setActiveSubTab("profile")}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === "profile"
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400"
            }`}
          >
            Profile
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("referrals")}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === "referrals"
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400"
            }`}
          >
            Refer &amp; Earn
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("devices")}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === "devices"
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400"
            }`}
          >
            Devices ({devices.length})
          </button>
        </div>
      </div>

      {/* ================= PROFILE TAB ================= */}
      {activeSubTab === "profile" && (
        <div className="space-y-4">
          {/* Subscriber Card */}
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-6 shadow-sm flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-blue-500 bg-slate-100 dark:bg-slate-800 shrink-0 shadow-md">
              <img
                src={customer.photoUrl || "/cartoons/yellow-boy.jpg"}
                alt={customer.fullName}
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white">
                {customer.fullName}
              </h3>
              <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 block">
                {customer.accountNumber} • {customer.customerNumber}
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                {customer.address}
              </span>
            </div>
          </div>

          {/* Account Details List */}
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 shadow-sm space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Subscriber Information
            </h4>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Phone Number</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">{customer.phone}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Email Address</span>
                <span className="font-semibold text-slate-900 dark:text-white">{customer.email}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Service Address</span>
                <span className="font-semibold text-slate-900 dark:text-white text-right max-w-[200px] truncate">
                  {customer.address}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-500">Router Connection</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">● GPON Fiber ONT Online</span>
              </div>
            </div>
          </div>

          {/* Logout Button */}
          <button
            type="button"
            onClick={onLogout}
            className="w-full py-3.5 px-4 rounded-2xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-950/70 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 font-bold text-xs shadow-sm transition-all"
          >
            Log Out from this Device
          </button>
        </div>
      )}

      {/* ================= REFERRALS TAB ================= */}
      {activeSubTab === "referrals" && (
        <div className="space-y-4">
          <div className="rounded-3xl bg-gradient-to-br from-amber-500 via-orange-600 to-amber-700 text-white p-6 shadow-xl relative overflow-hidden">
            <span className="text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full bg-black/20">
              REFERRAL REWARDS
            </span>
            <h3 className="text-2xl font-black mt-2">Refer Friends &amp; Earn KES 100</h3>
            <p className="text-xs text-amber-100 mt-1">
              Share your referral code. For every neighbor who installs and subscribes to fiber, you receive KES 100 in billing credit!
            </p>

            {/* Code Box */}
            <div className="mt-5 p-3 rounded-2xl bg-black/30 backdrop-blur-md flex items-center justify-between border border-white/20">
              <div>
                <span className="text-[10px] uppercase font-bold text-amber-200 block">Your Referral Code</span>
                <span className="text-lg font-black font-mono tracking-wider">{customer.referralCode}</span>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="px-3.5 py-2 rounded-xl bg-white text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
              >
                {copied ? <CheckIcon className="w-4 h-4 text-emerald-600" /> : <CopyIcon className="w-4 h-4" />}
                <span>{copied ? "Copied!" : "Copy"}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="mt-3 w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg transition-all"
            >
              <Share2Icon className="w-4 h-4" />
              <span>Share to WhatsApp Contacts</span>
            </button>
          </div>

          {/* Referral Stats Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Total Referrals</span>
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {customer.referralStats.totalReferrals}
              </span>
              <span className="text-[10px] text-emerald-500 font-bold block mt-0.5">
                {customer.referralStats.successfulReferrals} Successful
              </span>
            </div>

            <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Total Rewards</span>
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                KES {customer.referralStats.totalEarnedKes}
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Auto-applied to bill</span>
            </div>
          </div>
        </div>
      )}

      {/* ================= DEVICES TAB ================= */}
      {activeSubTab === "devices" && (
        <div className="space-y-3">
          <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300">
            Connected devices currently authenticated on your fiber Wi-Fi network. You can block any unauthorized device.
          </div>

          <div className="space-y-2.5">
            {devices.map((d) => (
              <div
                key={d.id}
                className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
                    <RouterIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white block">
                      {d.name}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 block">
                      IP: {d.ip} • MAC: {d.mac}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onToggleDeviceBlock(d.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    d.isBlocked
                      ? "bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800"
                      : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  {d.isBlocked ? "Blocked" : "Block"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
