"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";
import { IconCheck, IconCopy } from "@/components/icons";

export function CaptivePortalDesigner() {
  const [device, setDevice] = useState<"phone" | "tablet" | "laptop">("phone");
  const [portalTitle, setPortalTitle] = useState("MASHUPKGRID High-Speed Wi-Fi");
  const [welcomeText, setWelcomeText] = useState("Welcome! Connect your device for ultra-fast browsing & streaming.");
  const [themeColor, setThemeColor] = useState<"blue" | "emerald" | "purple" | "amber">("blue");
  const [showAd, setShowAd] = useState(true);
  const [authMethod, setAuthMethod] = useState<"voucher" | "mpesa" | "free">("voucher");
  const [voucherCode, setVoucherCode] = useState("");
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  const colors = {
    blue: { primary: "bg-brand-600", text: "text-brand-400", border: "border-brand-500", glow: "shadow-glow" },
    emerald: { primary: "bg-emerald-600", text: "text-emerald-400", border: "border-emerald-500", glow: "shadow-glow-emerald" },
    purple: { primary: "bg-purple-600", text: "text-purple-400", border: "border-purple-500", glow: "shadow-glow" },
    amber: { primary: "bg-amber-600", text: "text-amber-400", border: "border-amber-500", glow: "shadow-glow" },
  };

  const handleTestLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginSuccess(true);
    setTimeout(() => {
      setLoginSuccess(false);
      setVoucherCode("");
    }, 3500);
  };

  const handleCopyMikrotikAssets = () => {
    const mikrotikHtml = `<!-- MASHUPKGRID ISP CAPTIVE PORTAL (RouterOS v6/v7) -->
<!DOCTYPE html>
<html>
<head>
  <title>$(identity) - ${portalTitle}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="style.css">
</head>
<body class="bg-obsidian">
  <form name="login" action="$(link-login-only)" method="post">
    <input type="hidden" name="dst" value="$(link-orig)" />
    <input type="hidden" name="popup" value="true" />
    <h2>${portalTitle}</h2>
    <p>${welcomeText}</p>
    <input type="text" name="username" placeholder="Enter Voucher PIN" required />
    <input type="password" name="password" placeholder="Password" />
    <button type="submit">Connect to Wi-Fi</button>
  </form>
</body>
</html>`;
    navigator.clipboard.writeText(mikrotikHtml);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/95 shadow-2xl p-6 lg:p-8 backdrop-blur-xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="info">Hotspot Studio</Badge>
            <span className="text-xs font-mono text-brand-400 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-brand-400 animate-pulse" />
              <span>MikroTik RouterOS `login.html` Ready</span>
            </span>
          </div>
          <h3 className="text-xl font-bold text-white mt-1">
            Visual Captive Portal Designer &amp; Live Device Simulator
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Design, brand, and preview high-converting hotspot splash pages for malls, cafes, hotels, and public Wi-Fi zones before 1-click sync to your routers.
          </p>
        </div>

        <button
          onClick={handleCopyMikrotikAssets}
          className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono font-bold text-white flex items-center gap-2 transition-all shadow-sm"
        >
          {copiedScript ? <IconCheck size={14} className="text-emerald-400" /> : <IconCopy size={14} />}
          <span>{copiedScript ? "Copied login.html Code!" : "Export MikroTik login.html"}</span>
        </button>
      </div>

      {/* Main Grid */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Controls Column */}
        <div className="lg:col-span-5 space-y-5 text-left font-sans">
          {/* Device Mockup Toggle */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-2">
              Preview Device Frame
            </label>
            <div className="grid grid-cols-3 gap-2 text-xs font-mono">
              <button
                onClick={() => setDevice("phone")}
                className={`py-2 rounded-lg border text-center transition-all ${
                  device === "phone" ? "bg-brand-600 border-brand-500 text-white font-bold" : "bg-slate-900 border-slate-800 text-slate-400"
                }`}
              >
                Mobile
              </button>
              <button
                onClick={() => setDevice("tablet")}
                className={`py-2 rounded-lg border text-center transition-all ${
                  device === "tablet" ? "bg-brand-600 border-brand-500 text-white font-bold" : "bg-slate-900 border-slate-800 text-slate-400"
                }`}
              >
                Tablet
              </button>
              <button
                onClick={() => setDevice("laptop")}
                className={`py-2 rounded-lg border text-center transition-all ${
                  device === "laptop" ? "bg-brand-600 border-brand-500 text-white font-bold" : "bg-slate-900 border-slate-800 text-slate-400"
                }`}
              >
                Desktop
              </button>
            </div>
          </div>

          {/* Portal Title & Greeting */}
          <div className="space-y-3 rounded-xl bg-slate-900/60 border border-slate-800 p-4 text-xs">
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase">Portal Title / Network Name</label>
              <input
                type="text"
                value={portalTitle}
                onChange={(e) => setPortalTitle(e.target.value)}
                className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-xs text-white focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase">Welcome Greeting Copy</label>
              <textarea
                value={welcomeText}
                onChange={(e) => setWelcomeText(e.target.value)}
                rows={2}
                className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-xs text-white focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Color Scheme Picker */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-2">
              Brand Accent Palette
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setThemeColor("blue")}
                className={`h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white ${
                  themeColor === "blue" ? "ring-2 ring-white ring-offset-2 ring-offset-slate-950" : ""
                }`}
              >
                {themeColor === "blue" && "✓"}
              </button>
              <button
                onClick={() => setThemeColor("emerald")}
                className={`h-8 w-8 rounded-full bg-emerald-500 flex items-center justify-center text-white ${
                  themeColor === "emerald" ? "ring-2 ring-white ring-offset-2 ring-offset-slate-950" : ""
                }`}
              >
                {themeColor === "emerald" && "✓"}
              </button>
              <button
                onClick={() => setThemeColor("purple")}
                className={`h-8 w-8 rounded-full bg-purple-500 flex items-center justify-center text-white ${
                  themeColor === "purple" ? "ring-2 ring-white ring-offset-2 ring-offset-slate-950" : ""
                }`}
              >
                {themeColor === "purple" && "✓"}
              </button>
              <button
                onClick={() => setThemeColor("amber")}
                className={`h-8 w-8 rounded-full bg-amber-500 flex items-center justify-center text-white ${
                  themeColor === "amber" ? "ring-2 ring-white ring-offset-2 ring-offset-slate-950" : ""
                }`}
              >
                {themeColor === "amber" && "✓"}
              </button>
            </div>
          </div>

          {/* Authentication Mode & Ads Toggle */}
          <div className="space-y-3 rounded-xl bg-slate-900/60 border border-slate-800 p-4 text-xs font-mono">
            <div>
              <span className="text-slate-400 uppercase text-[11px] font-bold block mb-1.5">Default Login Mode</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setAuthMethod("voucher")}
                  className={`flex-1 py-1.5 rounded border text-[11px] ${
                    authMethod === "voucher" ? "bg-slate-800 border-brand-500 text-white font-bold" : "border-slate-800 text-slate-400"
                  }`}
                >
                  Voucher PIN
                </button>
                <button
                  onClick={() => setAuthMethod("mpesa")}
                  className={`flex-1 py-1.5 rounded border text-[11px] ${
                    authMethod === "mpesa" ? "bg-slate-800 border-emerald-500 text-emerald-400 font-bold" : "border-slate-800 text-slate-400"
                  }`}
                >
                  M-Pesa Paywall
                </button>
                <button
                  onClick={() => setAuthMethod("free")}
                  className={`flex-1 py-1.5 rounded border text-[11px] ${
                    authMethod === "free" ? "bg-slate-800 border-purple-500 text-purple-400 font-bold" : "border-slate-800 text-slate-400"
                  }`}
                >
                  Free 15-Min Trial
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <span className="text-slate-300">Show Monetized Sponsor Banner</span>
              <input
                type="checkbox"
                checked={showAd}
                onChange={(e) => setShowAd(e.target.checked)}
                className="h-4 w-4 rounded text-brand-600"
              />
            </div>
          </div>
        </div>

        {/* Right: Live Interactive Device Frame */}
        <div className="lg:col-span-7 flex justify-center">
          <div
            className={`transition-all duration-300 rounded-[32px] border-4 border-slate-800 bg-slate-950 shadow-2xl p-6 relative overflow-hidden flex flex-col justify-between ${
              device === "phone"
                ? "w-[340px] min-h-[560px]"
                : device === "tablet"
                ? "w-[460px] min-h-[580px]"
                : "w-full max-w-xl min-h-[480px]"
            }`}
          >
            {/* Device Status Bar */}
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pb-3 border-b border-slate-900">
              <span>9:41 AM</span>
              <span className="flex items-center gap-1.5">
                <span>Wi-Fi: Connected</span>
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
              </span>
            </div>

            {/* Captive Portal Screen Content */}
            <div className="my-auto py-6 text-center space-y-4">
              {/* Logo / Brand Icon */}
              <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl overflow-hidden ring-1 ring-cyan-500/40 shadow-glow bg-slate-900">
                <img src="/logo.jpg" alt="Logo" className="h-full w-full object-cover" />
              </div>

              <div>
                <h4 className="text-lg font-black text-white">{portalTitle}</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
                  {welcomeText}
                </p>
              </div>

              {/* Success Screen State */}
              {loginSuccess ? (
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-4 space-y-2 text-center animate-pulse">
                  <div className="text-emerald-400 font-bold text-sm flex items-center justify-center gap-1.5">
                    <IconCheck size={16} />
                    <span>Authentication Successful!</span>
                  </div>
                  <p className="text-xs text-slate-300 font-mono">
                    Speed Tier: 15 Mbps Burst · Session: 24 Hours
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Enjoy high-speed streaming &amp; browsing.
                  </p>
                </div>
              ) : (
                /* Login Form based on chosen method */
                <form onSubmit={handleTestLogin} className="space-y-3 max-w-xs mx-auto text-left font-sans text-xs">
                  {authMethod === "voucher" && (
                    <div>
                      <label className="text-[11px] font-bold text-slate-400 block mb-1">Voucher Access Code</label>
                      <input
                        type="text"
                        value={voucherCode}
                        onChange={(e) => setVoucherCode(e.target.value)}
                        placeholder="e.g. MKG-8829-X1"
                        required
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-white text-center tracking-widest focus:border-brand-500 focus:outline-none uppercase"
                      />
                    </div>
                  )}

                  {authMethod === "mpesa" && (
                    <div>
                      <label className="text-[11px] font-bold text-slate-400 block mb-1">M-Pesa Mobile Number</label>
                      <input
                        type="text"
                        placeholder="0712345678"
                        required
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-white text-center focus:border-emerald-500 focus:outline-none"
                      />
                      <div className="text-[10px] text-emerald-400 font-mono text-center mt-1">
                        Instant KES 20 STK push prompt for 1-Hour Unlimited
                      </div>
                    </div>
                  )}

                  {authMethod === "free" && (
                    <div className="rounded-lg bg-purple-950/40 border border-purple-500/30 p-2.5 text-center text-[11px] text-purple-300 font-mono">
                      Complimentary 15-Minute Public Wi-Fi access sponsored by MASHUPKGRID ISP.
                    </div>
                  )}

                  <button
                    type="submit"
                    className={`w-full py-2.5 rounded-lg text-white font-bold text-xs shadow-md transition-all active:scale-98 ${colors[themeColor].primary} ${colors[themeColor].glow}`}
                  >
                    {authMethod === "mpesa" ? "Pay KES 20 via M-Pesa" : authMethod === "free" ? "Start Free 15 Mins" : "Connect to Wi-Fi"}
                  </button>
                </form>
              )}

              {/* Sponsored Banner Ad */}
              {showAd && (
                <div className="pt-2">
                  <div className="rounded-lg bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-700 p-2 text-center text-[10px] font-mono text-slate-300">
                    <span className="text-brand-400 font-bold uppercase block">Partner Sponsorship</span>
                    <span>Powered by Nairobi Metro High-Speed Optical Fiber</span>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Device Indicator */}
            <div className="text-center text-[10px] text-slate-600 font-mono pt-2 border-t border-slate-900">
              MikroTik Captive Portal · FreeRADIUS 3.x Auth
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
