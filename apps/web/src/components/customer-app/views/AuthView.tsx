"use client";

import React, { useState } from "react";
import { GoogleGIcon, PhoneIcon, MailIcon, ArrowRightIcon, WifiIcon } from "../icons";

interface AuthViewProps {
  onSuccess: (phone?: string) => void;
  brandName?: string;
  brandColor?: string;
}

export function AuthView({ onSuccess, brandName = "FiberConnect", brandColor = "#2563eb" }: AuthViewProps) {
  const [modalMode, setModalMode] = useState<"none" | "phone" | "email" | "link">("none");
  // Empty, not a sample number -- this field sends a login OTP, and pre-filling a real number
  // would deliver one-time codes to whoever owns it.
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Simulate/call API
      setTimeout(() => {
        setOtpSent(true);
        setLoading(false);
      }, 600);
    } catch {
      setError("Failed to send OTP. Try again.");
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setTimeout(() => {
      setLoading(false);
      onSuccess(phone);
    }, 600);
  };

  const handleEmailLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onSuccess();
    }, 600);
  };

  const handleLinkAccount = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onSuccess(phone);
    }, 600);
  };

  return (
    <div className="min-h-full flex flex-col justify-between bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 select-none">
      {/* Top Hero Wave Art matching Screenshot */}
      <div className="relative w-full rounded-3xl overflow-hidden shadow-2xl bg-gradient-to-br from-blue-900 via-indigo-950 to-slate-950 border border-blue-500/30 p-6 pt-8 text-white min-h-[220px] flex flex-col justify-between">
        {/* Glow Curves Background */}
        <div className="absolute inset-0 opacity-40 mix-blend-screen pointer-events-none">
          <svg className="w-full h-full" viewBox="0 0 400 220" fill="none" preserveAspectRatio="none">
            <path
              d="M-20 60 C100 180, 250 -40, 420 100 C300 220, 150 140, -20 60 Z"
              fill="url(#waveGlow)"
              opacity="0.6"
            />
            <path
              d="M-40 140 C80 40, 280 200, 440 60"
              stroke="#60a5fa"
              strokeWidth="2.5"
              strokeDasharray="4 4"
              opacity="0.8"
            />
            <path
              d="M-20 180 C120 100, 240 240, 420 120"
              stroke="#38bdf8"
              strokeWidth="3.5"
            />
            <defs>
              <linearGradient id="waveGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="50%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Brand Bar */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-600/80 backdrop-blur-md flex items-center justify-center border border-blue-400/40 shadow-inner">
              <WifiIcon className="w-5 h-5 text-white" />
            </div>
            <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-blue-100 to-blue-200 bg-clip-text text-transparent">
              {brandName}
            </span>
          </div>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 backdrop-blur-sm">
            Self-Service App
          </span>
        </div>

        {/* Small embedded portal mockup preview */}
        <div className="relative z-10 mt-6 p-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 shadow-xl max-w-[280px]">
          <p className="text-[11px] font-bold text-blue-200">Welcome to {brandName}</p>
          <p className="text-[9px] text-slate-300 mt-0.5">Log in to access your high-speed network services.</p>
          <div className="mt-2 h-1.5 w-full bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-blue-400 w-2/3 rounded-full animate-pulse" />
          </div>
        </div>
      </div>

      {/* Main Headline Section */}
      <div className="my-6 space-y-2">
        <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-black text-sm uppercase tracking-wider">
          <WifiIcon className="w-4 h-4" />
          <span>{brandName}</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-white leading-[1.15]">
          Fast Internet.
          <br />
          Reliable Service.
          <br />
          <span className="text-blue-600 dark:text-blue-400">One App.</span>
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed pt-1">
          Manage your connection, view billing, and get support with seamless precision.
        </p>
      </div>

      {/* Auth Buttons Card matching Screenshot */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 shadow-xl space-y-3">
        {/* Google Button */}
        <button
          type="button"
          onClick={() => onSuccess()}
          className="w-full h-13 py-3 px-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-100 font-bold text-sm flex items-center justify-center gap-3 shadow-sm transition-all active:scale-[0.98]"
        >
          <GoogleGIcon className="w-5 h-5" />
          <span>Continue with Google</span>
        </button>

        {/* Phone Button */}
        <button
          type="button"
          onClick={() => setModalMode("phone")}
          className="w-full h-13 py-3 px-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-100 font-bold text-sm flex items-center justify-center gap-3 shadow-sm transition-all active:scale-[0.98]"
        >
          <PhoneIcon className="w-5 h-5 text-slate-700 dark:text-slate-300" />
          <span>Continue with Phone Number</span>
        </button>

        {/* Email Sign In (Navy/Brand) */}
        <button
          type="button"
          onClick={() => setModalMode("email")}
          className="w-full h-13 py-3 px-4 rounded-2xl bg-[#090b4d] hover:bg-[#060835] text-white font-bold text-sm flex items-center justify-center gap-3 shadow-lg shadow-blue-950/20 transition-all active:scale-[0.98]"
        >
          <MailIcon className="w-5 h-5 text-white" />
          <span>Email Sign In</span>
        </button>

        {/* Divider */}
        <div className="flex items-center my-4">
          <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
          <span className="px-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">OR</span>
          <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
        </div>

        {/* Connect Existing Account */}
        <div className="text-center pt-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Already have a {brandName} account?
          </p>
          <button
            type="button"
            onClick={() => setModalMode("link")}
            className="mt-1 text-sm font-black text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
          >
            <span>Connect Existing Account</span>
            <ArrowRightIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Phone OTP Modal */}
      {modalMode === "phone" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl">
            <h3 className="text-lg font-black text-slate-900 dark:text-white">Phone Sign In</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Enter your Kenyan mobile number (+254) to receive a fast 6-digit OTP.
            </p>

            {!otpSent ? (
              <form onSubmit={handleSendOtp} className="mt-4 space-y-3">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Mobile Number</label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0724 165 988"
                    className="w-full mt-1 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalMode("none")}
                    className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-3 rounded-xl bg-[#090b4d] text-white font-bold text-xs"
                  >
                    {loading ? "Sending..." : "Send OTP"}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="mt-4 space-y-3">
                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-[11px] text-blue-700 dark:text-blue-300 font-medium">
                  We sent a code to <span className="font-bold">{phone}</span>. (Demo OTP: <b>123456</b>)
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Enter 6-Digit Code</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="123456"
                    className="w-full mt-1 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-center text-lg tracking-widest font-black outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setOtpSent(false)}
                    className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold text-xs"
                  >
                    {loading ? "Verifying..." : "Verify & Sign In"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Email Modal */}
      {modalMode === "email" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl">
            <h3 className="text-lg font-black text-slate-900 dark:text-white">Email Sign In</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Enter your registered subscriber email and password.
            </p>
            <form onSubmit={handleEmailLogin} className="mt-4 space-y-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="subscriber@example.com"
                  className="w-full mt-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full mt-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode("none")}
                  className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-3 rounded-xl bg-[#090b4d] text-white font-bold text-xs"
                >
                  {loading ? "Signing in..." : "Log In"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Link Existing Account Modal */}
      {modalMode === "link" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl">
            <h3 className="text-lg font-black text-slate-900 dark:text-white">Connect Existing Account</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Link your existing installation using your Account Number or Customer ID.
            </p>
            <form onSubmit={handleLinkAccount} className="mt-4 space-y-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Account / Customer No.</label>
                <input
                  type="text"
                  required
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="ACC-88921 or CUST-10452"
                  className="w-full mt-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Registered Phone</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0724 165 988"
                  className="w-full mt-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode("none")}
                  className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold text-xs"
                >
                  {loading ? "Linking..." : "Verify & Connect"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
