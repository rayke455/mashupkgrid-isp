"use client";

import { useState } from "react";
import { Badge, Button, Card, Input, Label } from "@/components/ui";
import { IconCheck, IconCopy, IconArrowRight, IconRouter } from "@/components/icons";
import { THEME_CATALOG, ThemeId } from "./themes";

export function ThemePackExporter() {
  const [selectedTheme, setSelectedTheme] = useState<ThemeId>("gold-energy");
  const [brandName, setBrandName] = useState("Nairobi FastNet Hotspot");
  const [paybill, setPaybill] = useState("400200");
  const [contactPhone, setContactPhone] = useState("+254 700 000 000");
  const [copiedScript, setCopiedScript] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const selectedMeta = THEME_CATALOG.find((t) => t.id === selectedTheme) ?? THEME_CATALOG[0];

  const generatedHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${brandName} - High Speed Wi-Fi</title>
  <style>
    :root { --accent: #0ea5e9; --bg: #090d16; --text: #f8fafc; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; box-sizing: border-box; }
    .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 16px; padding: 28px; width: 100%; max-width: 400px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); text-align: center; }
    h1 { font-size: 22px; font-weight: 800; margin: 0 0 8px 0; color: #fff; }
    p { font-size: 13px; color: #94a3b8; margin: 0 0 20px 0; }
    .paybill-pill { background: #022c22; border: 1px solid #059669; color: #34d399; font-family: monospace; font-size: 12px; font-weight: 700; padding: 8px 14px; border-radius: 8px; margin-bottom: 20px; display: inline-block; }
    input[type="text"] { width: 100%; padding: 12px 14px; background: #020617; border: 1px solid #334155; border-radius: 10px; color: #fff; font-size: 15px; font-family: monospace; text-align: center; box-sizing: border-box; margin-bottom: 14px; text-transform: uppercase; }
    input[type="text"]:focus { outline: none; border-color: #38bdf8; ring: 2px rgba(56,189,248,0.2); }
    button { width: 100%; padding: 14px; background: #0284c7; border: none; border-radius: 10px; color: #fff; font-size: 14px; font-weight: 700; cursor: pointer; transition: background 0.2s; }
    button:hover { background: #0369a1; }
    .footer { margin-top: 20px; font-size: 11px; color: #64748b; font-family: monospace; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${brandName}</h1>
    <p>Powered by Mashupkgrid Cloud RADIUS</p>
    <div class="paybill-pill">M-Pesa Paybill: ${paybill}</div>
    <form name="login" action="$(link-login-only)" method="post" $(if chap-id) onSubmit="return doLogin()" $(endif)>
      <input type="hidden" name="dst" value="$(link-orig)" />
      <input type="hidden" name="popup" value="true" />
      <input type="text" name="username" placeholder="ENTER VOUCHER PIN" required autocomplete="off" autocorrect="off" />
      <input type="hidden" name="password" value="mashupkgrid" />
      <button type="submit">CONNECT TO HIGH SPEED INTERNET</button>
    </form>
    <div class="footer">Help Desk: ${contactPhone}</div>
  </div>
</body>
</html>`;

  const routerOsInstallScript = `/tool fetch url="https://cdn.mashupkgrid.com/themes/${selectedTheme}/login.html" dst-path="flash/hotspot/login.html" mode=https; /ip hotspot profile set [find default=yes] html-directory=flash/hotspot`;

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

  const handleCopyScript = () => {
    navigator.clipboard.writeText(routerOsInstallScript);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  return (
    <Card className="p-6 lg:p-8 space-y-6 border-slate-800 bg-slate-950/90 shadow-2xl font-sans text-left">
      <div className="space-y-2">
        <Badge variant="info">MikroTik Captive Portal Studio</Badge>
        <h3 className="text-xl sm:text-2xl font-black text-white">
          Hotspot Theme Pack Exporter (5 Carrier Layouts)
        </h3>
        <p className="text-xs sm:text-sm text-slate-400">
          Customize and generate production-ready MikroTik RouterOS <code className="text-brand-400 font-mono">login.html</code> files for all 5 branded hotspot themes with zero manual HTML editing.
        </p>
      </div>

      {/* Theme Selection Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {THEME_CATALOG.map((theme) => (
          <button
            key={theme.id}
            onClick={() => setSelectedTheme(theme.id)}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              selectedTheme === theme.id
                ? "bg-slate-900 border-brand-500 shadow-glow"
                : "bg-slate-950 border-slate-800 hover:border-slate-700"
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${theme.badgeColor}`}>
                {theme.category}
              </span>
              {selectedTheme === theme.id && (
                <IconCheck size={14} className="text-emerald-400" />
              )}
            </div>
            <div className="text-xs font-bold text-white leading-tight">{theme.name}</div>
          </button>
        ))}
      </div>

      {/* Customization Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
        <div>
          <Label htmlFor="theme-brand">Hotspot Brand Name</Label>
          <Input
            id="theme-brand"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="e.g. Westlands Mall Free Wi-Fi"
          />
        </div>
        <div>
          <Label htmlFor="theme-paybill">M-Pesa Paybill / Till No</Label>
          <Input
            id="theme-paybill"
            value={paybill}
            onChange={(e) => setPaybill(e.target.value)}
            placeholder="e.g. 522123"
          />
        </div>
        <div>
          <Label htmlFor="theme-phone">Support Contact Phone</Label>
          <Input
            id="theme-phone"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="e.g. +254 712 345 678"
          />
        </div>
      </div>

      {/* 1-Click Actions & Command */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3 font-mono text-xs">
        <div className="flex items-center justify-between text-slate-400 pb-2 border-b border-slate-800">
          <span className="text-white font-sans font-bold flex items-center gap-1.5">
            <IconRouter size={14} className="text-brand-400" />
            <span>Instant RouterOS Fetch Command</span>
          </span>
          <span className="text-slate-500">RouterOS v7 &amp; v6</span>
        </div>

        <div className="p-2.5 rounded bg-black/60 text-cyan-300 text-[11px] break-all">
          {routerOsInstallScript}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={handleCopyScript}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-sans font-bold flex items-center gap-1.5 transition-colors"
          >
            {copiedScript ? <IconCheck size={13} className="text-emerald-400" /> : <IconCopy size={13} />}
            <span>{copiedScript ? "Copied to Clipboard!" : "Copy RouterOS Terminal Command"}</span>
          </button>

          <Button
            onClick={handleDownload}
            className="px-5 py-2 font-bold shadow-glow gap-1.5 text-xs"
          >
            {downloaded ? <IconCheck size={14} className="text-emerald-300" /> : <span>📥</span>}
            <span>{downloaded ? "Downloaded login.html!" : `Download ${selectedMeta?.name ?? ""} login.html`}</span>
          </Button>
        </div>
      </div>
    </Card>
  );
}
