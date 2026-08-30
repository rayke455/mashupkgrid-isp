"use client";

import { useState } from "react";
import { Badge, Button, Card, Input, Label } from "@/components/ui";
import { IconCheck, IconCopy, IconRouter, IconShield, IconPulse, IconMpesa } from "@/components/icons";
import { THEME_CATALOG, ThemeId } from "./themes";

interface Props {
  initialBrandName?: string;
  initialPhone?: string;
  tenantSlug?: string;
}

export function CaptivePortalEmbedStudio({
  initialBrandName = "Commercial ISP High-Speed Wi-Fi",
  initialPhone = "+254 712 345 678",
  tenantSlug = "demo",
}: Props) {
  // Brand & Contact state
  const [brandName, setBrandName] = useState(initialBrandName);
  const [supportPhone, setSupportPhone] = useState(initialPhone);
  const [paybill, setPaybill] = useState("522123");
  const [wifiSsid, setWifiSsid] = useState("@Commercial_ISP_Free_WiFi");
  const [selectedTheme, setSelectedTheme] = useState<ThemeId>("gold-energy");
  const [deviceFrame, setDeviceFrame] = useState<"phone" | "tablet" | "laptop">("phone");

  // Advertising & Sponsor Monetization state
  const [enableAds, setEnableAds] = useState(true);
  const [sponsorName, setSponsorName] = useState("Java House Africa");
  const [adHeadline, setAdHeadline] = useState("☕ Flash Deal: Enjoy 20% off all barista coffees today! Show this Wi-Fi slip.");
  const [adImageUrl, setAdImageUrl] = useState("https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=400&q=80");
  const [adLink, setAdLink] = useState("https://javahouseafrica.com");
  const [adMonetizationType, setAdMonetizationType] = useState<"banner" | "free_sponsored">("banner");

  // Interactive Testing state inside simulator
  const [simAuthMethod, setSimAuthMethod] = useState<"voucher" | "mpesa" | "ad_sponsored">("voucher");
  const [simVoucherCode, setSimVoucherCode] = useState("");
  const [simPhone, setSimPhone] = useState("0712345678");
  const [simAuthSuccess, setSimAuthSuccess] = useState(false);
  const [previewScreen, setPreviewScreen] = useState<"login" | "data_usage">("login");
  const [adCountdown, setAdCountdown] = useState(10);
  const [adWatched, setAdWatched] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [downloadedStatus, setDownloadedStatus] = useState(false);

  const selectedThemeMeta = THEME_CATALOG.find((t) => t.id === selectedTheme) ?? THEME_CATALOG[0]!;

  const handleTestLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setSimAuthSuccess(true);
    setTimeout(() => {
      setSimAuthSuccess(false);
      setSimVoucherCode("");
    }, 4000);
  };

  const handleWatchAd = () => {
    let count = 10;
    setAdCountdown(count);
    const interval = setInterval(() => {
      count -= 1;
      setAdCountdown(count);
      if (count <= 0) {
        clearInterval(interval);
        setAdWatched(true);
        setSimAuthSuccess(true);
        setTimeout(() => {
          setSimAuthSuccess(false);
          setAdWatched(false);
        }, 4000);
      }
    }, 400);
  };

  // Generate production RouterOS login.html with embedded ads and numbers
  const generatedHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${brandName} - Public Wi-Fi</title>
  <style>
    :root { --primary: #0ea5e9; --bg: #090d16; --card: #0f172a; --text: #f8fafc; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 16px; box-sizing: border-box; }
    .card { background: var(--card); border: 1px solid #1e293b; border-radius: 20px; padding: 28px; width: 100%; max-width: 380px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.6); text-align: center; }
    .logo { width: 64px; height: 64px; border-radius: 16px; margin: 0 auto 16px; object-fit: cover; border: 2px solid #0ea5e9; }
    h1 { font-size: 20px; font-weight: 800; margin: 0 0 6px 0; color: #fff; }
    p { font-size: 13px; color: #94a3b8; margin: 0 0 18px 0; line-height: 1.4; }
    .paybill-badge { background: #064e3b; border: 1px solid #059669; color: #34d399; font-family: monospace; font-size: 12px; font-weight: 700; padding: 8px 14px; border-radius: 10px; margin-bottom: 16px; display: inline-block; }
    ${enableAds ? `.ad-banner { background: #1e1b4b; border: 1px solid #6366f1; border-radius: 12px; padding: 12px; margin-bottom: 18px; text-align: left; font-size: 11px; }
    .ad-tag { font-size: 9px; font-weight: 800; text-transform: uppercase; color: #a5b4fc; margin-bottom: 4px; display: block; }
    .ad-headline { font-weight: 700; color: #fff; line-height: 1.3; }
    .ad-cta { display: inline-block; margin-top: 6px; font-size: 10px; color: #38bdf8; text-decoration: underline; font-weight: 600; }` : ""}
    input[type="text"] { width: 100%; padding: 14px; background: #020617; border: 1px solid #334155; border-radius: 12px; color: #fff; font-size: 16px; font-family: monospace; text-align: center; box-sizing: border-box; margin-bottom: 14px; text-transform: uppercase; letter-spacing: 2px; }
    input[type="text"]:focus { outline: none; border-color: #38bdf8; }
    button { width: 100%; padding: 14px; background: #0284c7; border: none; border-radius: 12px; color: #fff; font-size: 14px; font-weight: 700; cursor: pointer; transition: background 0.2s; }
    button:hover { background: #0369a1; }
    .support-box { margin-top: 20px; padding-top: 16px; border-top: 1px solid #1e293b; font-size: 12px; color: #94a3b8; }
    .support-box a { color: #38bdf8; text-decoration: none; font-weight: 700; }
  </style>
</head>
<body>
  <div class="card">
    <img src="/logo.jpg" alt="Logo" class="logo" />
    <h1>${brandName}</h1>
    <p>Connect to fast internet on <strong>${wifiSsid}</strong></p>
    <div class="paybill-badge">M-Pesa Paybill: ${paybill}</div>

    ${enableAds ? `
    <div class="ad-banner">
      <span class="ad-tag">SPONSORED ADVERTISEMENT · ${sponsorName}</span>
      <div class="ad-headline">${adHeadline}</div>
      <a href="${adLink}" target="_blank" class="ad-cta">Tap for exclusive offer &rarr;</a>
    </div>` : ""}

    <form name="login" action="$(link-login-only)" method="post" $(if chap-id) onSubmit="return doLogin()" $(endif)>
      <input type="hidden" name="dst" value="$(link-orig)" />
      <input type="hidden" name="popup" value="true" />
      <input type="text" name="username" placeholder="ENTER VOUCHER PIN" required autocomplete="off" />
      <input type="hidden" name="password" value="mashupkgrid" />
      <button type="submit">CONNECT TO HIGH SPEED INTERNET</button>
    </form>

    <div class="support-box">
      Need Help? Call: <a href="tel:${supportPhone}">${supportPhone}</a>
    </div>
  </div>
</body>
</html>`;

  const generatedStatusHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${brandName} - Active Session & Data Usage</title>
  <style>
    body { margin: 0; font-family: -apple-system, sans-serif; background: #090d16; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 16px; box-sizing: border-box; }
    .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 20px; padding: 24px; width: 100%; max-width: 380px; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.6); }
    .status-badge { display: inline-flex; align-items: center; gap: 6px; background: #064e3b; color: #34d399; font-weight: bold; font-size: 11px; padding: 4px 12px; border-radius: 9999px; }
    h2 { font-size: 18px; margin: 12px 0 4px; }
    p { font-size: 12px; color: #94a3b8; margin: 0 0 16px; }
    .stat-box { background: #020617; border: 1px solid #1e293b; border-radius: 14px; padding: 16px; margin: 16px 0; text-align: left; font-family: monospace; }
    .stat-row { display: flex; justify-content: space-between; margin: 8px 0; font-size: 12px; }
    .progress-bar { background: #1e293b; border-radius: 9999px; height: 8px; overflow: hidden; margin-top: 12px; }
    .progress-fill { background: linear-gradient(to right, #0ea5e9, #10b981); height: 100%; width: 42%; }
    .btn-logout { width: 100%; padding: 12px; background: #e11d48; border: none; border-radius: 10px; color: #fff; font-weight: bold; cursor: pointer; margin-top: 8px; }
    .btn-logout:hover { background: #be123c; }
    .footer { font-size: 11px; color: #64748b; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="status-badge">● ACTIVE SESSION</div>
    <h2>${brandName}</h2>
    <p>Connected on $(ip) ($(mac))</p>
    <div class="stat-box">
      <div class="stat-row"><span>Upload (Bytes Out):</span><strong style="color:#38bdf8;">$(bytes-out-nice)</strong></div>
      <div class="stat-row"><span>Download (Bytes In):</span><strong style="color:#34d399;">$(bytes-in-nice)</strong></div>
      <div class="stat-row"><span>Remaining Data:</span><strong>$(remain-bytes-total-nice)</strong></div>
      <div class="stat-row"><span>Session Time Left:</span><strong style="color:#fbbf24;">$(session-time-left)</strong></div>
      <div class="progress-bar"><div class="progress-fill"></div></div>
    </div>
    <form action="$(link-logout)" name="logout" onSubmit="return openLogout()">
      <button type="submit" class="btn-logout">DISCONNECT FROM WI-FI</button>
    </form>
    <div class="footer">Helpline: <a href="tel:${supportPhone}" style="color:#38bdf8;text-decoration:none;">${supportPhone}</a></div>
  </div>
</body>
</html>`;

  const routerOsCommand = `/tool fetch url="https://cdn.mashupkgrid.com/themes/${selectedTheme}/login.html" dst-path="flash/hotspot/login.html" mode=https; /ip hotspot profile set [find default=yes] html-directory=flash/hotspot`;

  const handleDownload = () => {
    const blob = new Blob([generatedHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `login-${selectedTheme}.html`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2500);
  };

  const handleDownloadStatus = () => {
    const blob = new Blob([generatedStatusHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `status.html`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloadedStatus(true);
    setTimeout(() => setDownloadedStatus(false), 2500);
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(routerOsCommand);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  return (
    <div className="space-y-6 text-left font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl border border-slate-800 bg-slate-950/80 shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="info">Captive Portal Studio</Badge>
            <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-400 font-mono text-[10px]">
              Live Embedded WYSIWYG &amp; Ad Monetization
            </span>
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-white">
            Custom Brand, Helpline &amp; Advertising Portal Studio
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Update your Commercial ISP name, support helpline number, M-Pesa till, and monetize your Wi-Fi with partner ads in real-time.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href={`/hotspot/${tenantSlug}?theme=${selectedTheme}`}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-cyan-400 transition-all flex items-center gap-1.5"
          >
            <span>Preview in Full Tab &rarr;</span>
          </a>

          <Button
            onClick={handleDownload}
            className="px-4 py-2 text-xs font-bold shadow-glow gap-1.5"
          >
            {downloaded ? <IconCheck size={14} className="text-emerald-300" /> : <span>📥</span>}
            <span>{downloaded ? "Downloaded!" : "Download login.html"}</span>
          </Button>

          <Button
            variant="secondary"
            onClick={handleDownloadStatus}
            className="px-4 py-2 text-xs font-bold gap-1.5 border-slate-700 bg-slate-900 hover:bg-slate-800"
          >
            {downloadedStatus ? <IconCheck size={14} className="text-emerald-400" /> : <span>📊</span>}
            <span>{downloadedStatus ? "Downloaded status.html!" : "Download status.html"}</span>
          </Button>
        </div>
      </div>

      {/* Main Studio Grid: Left Config, Right Live Embed Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: EDIT CONTROLS */}
        <div className="lg:col-span-6 space-y-5">
          {/* 1. Theme Palette Selector */}
          <Card className="p-5 space-y-3 border-slate-800 bg-slate-900/80">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block font-mono">
              1. Select Captive Portal Theme
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {THEME_CATALOG.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => setSelectedTheme(theme.id)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    selectedTheme === theme.id
                      ? "bg-slate-950 border-brand-500 shadow-glow"
                      : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="text-[10px] font-bold text-brand-400 mb-1">{theme.category}</div>
                  <div className="text-xs font-bold text-white">{theme.name}</div>
                </button>
              ))}
            </div>
          </Card>

          {/* 2. Brand & Contact Number Customizer */}
          <Card className="p-5 space-y-4 border-slate-800 bg-slate-900/80">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block font-mono">
              2. Commercial ISP Name &amp; Helpline Number
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2">
                <Label htmlFor="cp-brand">Commercial ISP / Business Name</Label>
                <Input
                  id="cp-brand"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="e.g. Commercial ISP High-Speed Wi-Fi"
                />
              </div>

              <div>
                <Label htmlFor="cp-phone">Support Contact / Helpline Number</Label>
                <Input
                  id="cp-phone"
                  value={supportPhone}
                  onChange={(e) => setSupportPhone(e.target.value)}
                  placeholder="e.g. +254 712 345 678"
                  className="font-mono text-xs"
                />
              </div>

              <div>
                <Label htmlFor="cp-paybill">M-Pesa Paybill or Till Number</Label>
                <Input
                  id="cp-paybill"
                  value={paybill}
                  onChange={(e) => setPaybill(e.target.value)}
                  placeholder="e.g. 522123"
                  className="font-mono text-xs"
                />
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="cp-ssid">Broadcasted Wi-Fi SSID Name</Label>
                <Input
                  id="cp-ssid"
                  value={wifiSsid}
                  onChange={(e) => setWifiSsid(e.target.value)}
                  placeholder="e.g. @Commercial_ISP_Free_WiFi"
                  className="font-mono text-xs"
                />
              </div>
            </div>
          </Card>

          {/* 3. Advertising & Sponsor Monetization Studio */}
          <Card className="p-5 space-y-4 border-slate-800 bg-slate-900/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block font-mono">
                3. Wi-Fi Advertising &amp; Sponsor Monetization
              </span>
              <label className="flex items-center gap-2 cursor-pointer text-xs text-white font-bold">
                <input
                  type="checkbox"
                  checked={enableAds}
                  onChange={(e) => setEnableAds(e.target.checked)}
                  className="h-4 w-4 rounded text-brand-600"
                />
                <span>Enable Ads</span>
              </label>
            </div>

            {enableAds && (
              <div className="space-y-3 text-xs pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="ad-sponsor">Sponsor / Advertiser Name</Label>
                    <Input
                      id="ad-sponsor"
                      value={sponsorName}
                      onChange={(e) => setSponsorName(e.target.value)}
                      placeholder="e.g. Java House Nairobi"
                    />
                  </div>

                  <div>
                    <Label htmlFor="ad-link">Sponsor Click-Through Link</Label>
                    <Input
                      id="ad-link"
                      value={adLink}
                      onChange={(e) => setAdLink(e.target.value)}
                      placeholder="https://partner-website.com"
                      className="font-mono text-xs"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="ad-headline">Ad Promo Headline / Discount Pitch</Label>
                  <textarea
                    id="ad-headline"
                    value={adHeadline}
                    onChange={(e) => setAdHeadline(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-xs text-white focus:border-brand-500 focus:outline-none"
                    placeholder="e.g. Get 20% off your meal with code WIFI20!"
                  />
                </div>

                <div>
                  <Label htmlFor="ad-image">Sponsor Image / Banner URL (Optional)</Label>
                  <Input
                    id="ad-image"
                    value={adImageUrl}
                    onChange={(e) => setAdImageUrl(e.target.value)}
                    placeholder="https://..."
                    className="font-mono text-xs"
                  />
                </div>

                <div>
                  <Label>Monetization Format</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setAdMonetizationType("banner")}
                      className={`p-2 rounded-lg border text-center text-xs font-bold transition-all ${
                        adMonetizationType === "banner"
                          ? "bg-brand-600 text-white border-brand-500"
                          : "bg-slate-950 border-slate-800 text-slate-400"
                      }`}
                    >
                      Top/Bottom Banner
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdMonetizationType("free_sponsored")}
                      className={`p-2 rounded-lg border text-center text-xs font-bold transition-all ${
                        adMonetizationType === "free_sponsored"
                          ? "bg-purple-600 text-white border-purple-500"
                          : "bg-slate-950 border-slate-800 text-slate-400"
                      }`}
                    >
                      Watch 10s Ad for Free Wi-Fi
                    </button>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* 4. RouterOS Fetch Command */}
          <div className="p-4 rounded-2xl border border-slate-800 bg-slate-950 space-y-2 font-mono text-xs">
            <div className="flex justify-between text-slate-400">
              <span className="text-white font-bold flex items-center gap-1.5">
                <IconRouter size={14} className="text-brand-400" />
                <span>MikroTik RouterOS 1-Line Deployment</span>
              </span>
              <span>RouterOS v7 &amp; v6</span>
            </div>
            <div className="p-2.5 rounded bg-black/60 text-cyan-300 text-[11px] break-all">
              {routerOsCommand}
            </div>
            <button
              onClick={handleCopyScript}
              className="mt-1 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              {copiedScript ? <IconCheck size={12} className="text-emerald-400" /> : <IconCopy size={12} />}
              <span>{copiedScript ? "Copied Command!" : "Copy RouterOS Terminal Command"}</span>
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: LIVE EMBEDDED PREVIEW ("bring embed so i can see") */}
        <div className="lg:col-span-6 flex flex-col items-center">
          {/* Device Frame Switcher */}
          <div className="flex items-center gap-2 mb-4 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs font-bold">
            <button
              onClick={() => setDeviceFrame("phone")}
              className={`px-3 py-1 rounded-lg transition-all ${
                deviceFrame === "phone" ? "bg-brand-600 text-white shadow-glow" : "text-slate-400 hover:text-white"
              }`}
            >
              📱 iPhone 16 Pro
            </button>
            <button
              onClick={() => setDeviceFrame("tablet")}
              className={`px-3 py-1 rounded-lg transition-all ${
                deviceFrame === "tablet" ? "bg-brand-600 text-white shadow-glow" : "text-slate-400 hover:text-white"
              }`}
            >
              📱 Android / Tablet
            </button>
            <button
              onClick={() => setDeviceFrame("laptop")}
              className={`px-3 py-1 rounded-lg transition-all ${
                deviceFrame === "laptop" ? "bg-brand-600 text-white shadow-glow" : "text-slate-400 hover:text-white"
              }`}
            >
              💻 Laptop Browser
            </button>
          </div>

          {/* Screen Switcher: Login Page vs Live Data Usage Status */}
          <div className="flex items-center gap-2 mb-3 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs font-bold font-mono">
            <button
              type="button"
              onClick={() => setPreviewScreen("login")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                previewScreen === "login"
                  ? "bg-brand-600 text-white shadow-glow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              🔑 Hotspot Login
            </button>
            <button
              type="button"
              onClick={() => setPreviewScreen("data_usage")}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                previewScreen === "data_usage"
                  ? "bg-emerald-600 text-white shadow-glow-emerald"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <span>📊 Data Usage &amp; Status</span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </button>
          </div>

          {/* SIMULATED DEVICE BEZEL */}
          <div
            className={`transition-all duration-300 rounded-[36px] border-4 border-slate-800 bg-slate-950 shadow-2xl p-5 relative overflow-hidden flex flex-col justify-between ${
              deviceFrame === "phone"
                ? "w-[330px] min-h-[600px]"
                : deviceFrame === "tablet"
                ? "w-[440px] min-h-[580px]"
                : "w-full max-w-lg min-h-[520px]"
            }`}
          >
            {/* Top Device Bar */}
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pb-2 border-b border-slate-900">
              <span>10:42 AM</span>
              <span className="flex items-center gap-1 text-emerald-400 font-bold">
                <span>{wifiSsid}</span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </span>
            </div>

            {/* SCREEN 1: DATA USAGE DASHBOARD */}
            {previewScreen === "data_usage" ? (
              <div className="my-auto py-3 text-center space-y-3 font-sans">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-mono text-[10px] font-bold">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>SESSION ONLINE // ROUTEROS</span>
                </div>

                <div>
                  <h4 className="text-base font-black text-white">{brandName}</h4>
                  <p className="text-[10px] font-mono text-slate-400">
                    IP: 10.5.50.142 · MAC: D4:61:9D:28:FE:01
                  </p>
                </div>

                {/* Data Usage Progress Card */}
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-left font-mono text-xs space-y-2">
                  <div className="flex justify-between items-baseline">
                    <span className="text-[10px] text-slate-400 uppercase">Data Quota Consumed</span>
                    <span className="text-emerald-400 font-bold text-xs">842.6 MB / 2,000 MB</span>
                  </div>

                  <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
                    <div className="bg-gradient-to-r from-cyan-500 to-emerald-500 h-full w-[42%]" />
                  </div>

                  <div className="flex justify-between text-[10px] text-slate-400 pt-0.5">
                    <span>Used: <strong>42%</strong></span>
                    <span className="text-cyan-300">Remaining: <strong>1,157.4 MB</strong></span>
                  </div>
                </div>

                {/* Traffic Breakdown Matrix */}
                <div className="grid grid-cols-2 gap-2 text-left font-mono text-[11px]">
                  <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                    <span className="text-[9px] text-slate-500 block uppercase">Download (Rx)</span>
                    <strong className="text-emerald-400 text-xs">714.2 MB</strong>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                    <span className="text-[9px] text-slate-500 block uppercase">Upload (Tx)</span>
                    <strong className="text-cyan-400 text-xs">128.4 MB</strong>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                    <span className="text-[9px] text-slate-500 block uppercase">Session Time Left</span>
                    <strong className="text-amber-400 text-xs">4h 18m</strong>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                    <span className="text-[9px] text-slate-500 block uppercase">Speed Cap</span>
                    <strong className="text-purple-400 text-xs">15 Mbps</strong>
                  </div>
                </div>

                {/* Session Action Buttons */}
                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setPreviewScreen("login")}
                    className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-glow-emerald transition-all"
                  >
                    + Top Up / Buy More Internet
                  </button>

                  <button
                    type="button"
                    onClick={() => setPreviewScreen("login")}
                    className="w-full py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 font-bold text-xs transition-all"
                  >
                    Disconnect from Wi-Fi
                  </button>
                </div>
              </div>
            ) : (
              /* SCREEN 2: LOGIN SCREEN */
              <div className="my-auto py-4 text-center space-y-3.5">
                {/* Brand Logo & Commercial ISP Title */}
                <div className="mx-auto h-14 w-14 rounded-2xl overflow-hidden ring-2 ring-cyan-500/40 shadow-glow bg-slate-900 flex items-center justify-center">
                  <img src="/logo.jpg" alt="Logo" className="h-full w-full object-cover" />
                </div>

                <div>
                  <h4 className="text-base font-black text-white tracking-tight">{brandName}</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    High-Speed Internet Gateway
                  </p>
                  <div className="inline-block mt-1 px-2.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-mono text-[10px] font-bold">
                    Paybill: {paybill}
                  </div>
                </div>

                {/* LIVE SPONSOR ADVERTISEMENT BANNER */}
                {enableAds && (
                  <div className="rounded-xl border border-indigo-500/40 bg-gradient-to-r from-indigo-950/80 via-slate-900 to-purple-950/80 p-3 text-left shadow-lg">
                    <div className="flex items-center justify-between text-[9px] font-mono text-indigo-300 uppercase font-black mb-1">
                      <span>📢 SPONSORED ADVERTISEMENT</span>
                      <span className="px-1.5 py-0.2 rounded bg-indigo-900/60 border border-indigo-700">
                        {sponsorName}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {adImageUrl && (
                        <div className="h-10 w-10 shrink-0 rounded-lg overflow-hidden border border-slate-700">
                          <img src={adImageUrl} alt="Ad creative" className="h-full w-full object-cover" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold text-white leading-tight">
                          {adHeadline}
                        </p>
                        <a
                          href={adLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-cyan-400 font-mono underline hover:text-cyan-300 block mt-0.5"
                        >
                          Tap to redeem offer &rarr;
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                {/* SIMULATOR SUCCESS SCREEN */}
                {simAuthSuccess ? (
                  <div className="rounded-xl border border-emerald-500/50 bg-emerald-950/60 p-4 space-y-1 text-center animate-pulse">
                    <IconCheck size={18} className="mx-auto text-emerald-400" />
                    <div className="font-bold text-white text-xs">Internet Connected!</div>
                    <p className="text-[10px] text-emerald-300 font-mono">
                      Session Activated on FreeRADIUS 3.2
                    </p>
                  </div>
                ) : (
                  /* SIMULATOR LOGIN FORM */
                  <form onSubmit={handleTestLogin} className="space-y-2.5 max-w-[260px] mx-auto text-left text-xs">
                    {/* Mode Buttons */}
                    <div className="flex gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[10px] font-mono">
                      <button
                        type="button"
                        onClick={() => setSimAuthMethod("voucher")}
                        className={`flex-1 py-1 rounded ${simAuthMethod === "voucher" ? "bg-brand-600 text-white font-bold" : "text-slate-400"}`}
                      >
                        Voucher
                      </button>
                      <button
                        type="button"
                        onClick={() => setSimAuthMethod("mpesa")}
                        className={`flex-1 py-1 rounded ${simAuthMethod === "mpesa" ? "bg-emerald-600 text-white font-bold" : "text-slate-400"}`}
                      >
                        M-Pesa
                      </button>
                      {enableAds && adMonetizationType === "free_sponsored" && (
                        <button
                          type="button"
                          onClick={() => setSimAuthMethod("ad_sponsored")}
                          className={`flex-1 py-1 rounded ${simAuthMethod === "ad_sponsored" ? "bg-purple-600 text-white font-bold" : "text-slate-400"}`}
                        >
                          Free Ad
                        </button>
                      )}
                    </div>

                    {simAuthMethod === "voucher" && (
                      <div>
                        <input
                          type="text"
                          value={simVoucherCode}
                          onChange={(e) => setSimVoucherCode(e.target.value.toUpperCase())}
                          placeholder="ENTER VOUCHER PIN"
                          required
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 text-xs font-mono text-white text-center tracking-widest uppercase focus:border-brand-500 focus:outline-none"
                        />
                        <button
                          type="submit"
                          className="w-full mt-2 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs shadow-glow transition-all"
                        >
                          Connect to Internet
                        </button>
                      </div>
                    )}

                    {simAuthMethod === "mpesa" && (
                      <div>
                        <input
                          type="text"
                          value={simPhone}
                          onChange={(e) => setSimPhone(e.target.value)}
                          placeholder="0712345678"
                          required
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 text-xs font-mono text-white text-center focus:border-emerald-500 focus:outline-none"
                        />
                        <button
                          type="submit"
                          className="w-full mt-2 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-glow-emerald transition-all"
                        >
                          Pay KES 20 via M-Pesa STK
                        </button>
                      </div>
                    )}

                    {simAuthMethod === "ad_sponsored" && (
                      <div className="space-y-2 text-center">
                        <div className="p-2.5 rounded-lg bg-purple-950/60 border border-purple-500/40 text-[10px] text-purple-200">
                          🎁 Watch sponsor ad to receive <strong>30 minutes</strong> free high-speed internet!
                        </div>
                        <button
                          type="button"
                          onClick={handleWatchAd}
                          className="w-full py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-glow transition-all"
                        >
                          {adCountdown < 10 && !adWatched ? `Watching Sponsor Ad (${adCountdown}s)...` : "Watch Ad for Free Internet"}
                        </button>
                      </div>
                    )}
                  </form>
                )}
              </div>
            )}

              {/* HELPLINE CONTACT FOOTER WITH CALL LINK */}
              <div className="pt-2 border-t border-slate-900 text-[10px] text-slate-400 font-mono">
                <span>Helpline Support: </span>
                <a
                  href={`tel:${supportPhone}`}
                  className="text-cyan-400 font-bold hover:underline"
                >
                  {supportPhone}
                </a>
              </div>

            {/* Bottom Device Indicator */}
            <div className="text-center text-[9px] text-slate-600 font-mono pt-1">
              Theme: {selectedThemeMeta.name} · MikroTik RouterOS
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
