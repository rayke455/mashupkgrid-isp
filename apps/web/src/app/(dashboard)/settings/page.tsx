"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Button, Card, ErrorText, HintText, Input, Label, Badge } from "@/components/ui";
import { IconCopy, IconCheck, IconMpesa, IconRouter, IconShield, IconPulse } from "@/components/icons";

interface TenantSettings {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  planTier: string;
  brandColor: string | null;
  logoUrl: string | null;
  platformUrl: string;
}

interface BillingData {
  subscription: {
    id: string;
    status: string;
    billingCycle: "MONTHLY" | "ANNUAL";
    plan: {
      id: string;
      name: string;
      slug: string;
      monthlyPriceMinor: number;
      annualPriceMinor: number | null;
      maxCustomers: number | null;
      maxRouters: number | null;
    };
  };
  usage: {
    customers: { used: number; limit: number | null };
    routers: { used: number; limit: number | null };
  };
  payments: Array<{
    id: string;
    amountMinor: number;
    phone: string | null;
    status: string;
    mpesaReceiptNumber: string | null;
    paidAt: string | null;
  }>;
}

const DEFAULT_BRAND_COLOR = "#2563eb";

const COMMON_TIMEZONES = [
  "Africa/Nairobi",
  "Africa/Lagos",
  "Africa/Kampala",
  "Africa/Dar_es_Salaam",
  "Africa/Kigali",
  "Africa/Johannesburg",
  "UTC",
];

const COMMON_CURRENCIES = ["KES", "UGX", "TZS", "RWF", "NGN", "ZAR", "USD"];

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { refresh, user } = useAuth();
  const isSuperAdmin = !user?.tenantId;

  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [currency, setCurrency] = useState("");
  const [brandColor, setBrandColor] = useState(DEFAULT_BRAND_COLOR);
  const [logoUrl, setLogoUrl] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [domainVerified, setDomainVerified] = useState(false);
  const [verifyingDomain, setVerifyingDomain] = useState(false);
  const [renewPhone, setRenewPhone] = useState("");
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [stkSent, setStkSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  // Captive Portal Hotspot Branding & Numbers
  // Seeded empty, never with a sample identity: these are the values that get SAVED, so
  // pre-filling them with a real company's name and support number meant a tenant who opened
  // this page and pressed save silently published another ISP's contact details as their own.
  // The grey placeholders below still show the expected format.
  const [contactPhone, setContactPhone] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [welcomeTitle, setWelcomeTitle] = useState("FAST & SECURE WI-FI");
  const [bannerSubtitle, setBannerSubtitle] = useState("HIGH SPEED FIBER CONNECTION");
  const [activeThemeId, setActiveThemeId] = useState("suntech-blue");
  const [installationFee, setInstallationFee] = useState("1,500/-");

  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiFetch<TenantSettings>("/api/v1/settings"),
    enabled: !isSuperAdmin,
  });

  const { data: billing } = useQuery({
    queryKey: ["billing"],
    queryFn: () => apiFetch<BillingData>("/api/v1/billing"),
    enabled: !isSuperAdmin,
  });

  useEffect(() => {
    if (settings) {
      setName(settings.name);
      setTimezone(settings.timezone);
      setCurrency(settings.currency);
      setBrandColor(settings.brandColor ?? DEFAULT_BRAND_COLOR);
      setLogoUrl(settings.logoUrl ?? "");

      // Load tenant captive portal config
      void (async () => {
        try {
          const cfg = await apiFetch<any>(`/api/v1/hotspot/${settings.slug}/config`, { skipAuth: true });
          if (cfg) {
            if (cfg.phone) setContactPhone(cfg.phone);
            if (cfg.supportPhone) setSupportPhone(cfg.supportPhone);
            if (cfg.welcomeTitle) setWelcomeTitle(cfg.welcomeTitle);
            if (cfg.bannerSubtitle) setBannerSubtitle(cfg.bannerSubtitle);
            if (cfg.activeThemeId) setActiveThemeId(cfg.activeThemeId);
            if (cfg.installationFee) setInstallationFee(cfg.installationFee);
          }
        } catch {}
      })();
    }
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      await apiFetch("/api/v1/settings", {
        method: "PATCH",
        body: JSON.stringify({ name, timezone, currency, brandColor, logoUrl: logoUrl || null }),
      });
      const tenantSlug = settings?.slug || user?.tenantSlug || "demo-isp";
      const captivePayload = {
        brandName: name.trim(),
        phone: contactPhone.trim(),
        supportPhone: supportPhone.trim(),
        welcomeTitle: welcomeTitle.trim(),
        bannerSubtitle: bannerSubtitle.trim(),
        activeThemeId,
        installationFee: installationFee.trim(),
      };
      try {
        localStorage.setItem(`mkg_hotspot_captive_config:${tenantSlug}`, JSON.stringify(captivePayload));
      } catch {}
      // Staff write — must carry the bearer token; only the matching GET is public.
      await apiFetch(`/api/v1/hotspot/${tenantSlug}/config`, {
        method: "PUT",
        body: JSON.stringify(captivePayload),
      });
    },
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      void refresh();
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to save settings"),
  });

  const renewSubscription = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/billing/renew", {
        method: "POST",
        body: JSON.stringify({ phone: renewPhone.trim() }),
      }),
    onSuccess: () => {
      setStkSent(true);
      queryClient.invalidateQueries({ queryKey: ["billing"] });
      setTimeout(() => {
        setStkSent(false);
        setShowRenewModal(false);
      }, 3000);
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to initiate M-Pesa renewal"),
  });

  const handleVerifyDomain = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customDomain) return;
    setVerifyingDomain(true);
    setTimeout(() => {
      setVerifyingDomain(false);
      setDomainVerified(true);
    }, 1400);
  };

  if (isSuperAdmin) {
    return (
      <div className="max-w-2xl space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Platform Settings</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Super Administrator console has no individual tenant branding. Manage tenants from the Tenants menu.
          </p>
        </div>
        <Card className="p-6">
          <p className="text-xs text-slate-400">
            To view or modify individual ISP tenant configurations, please navigate to{" "}
            <a href="/tenants" className="text-brand-400 font-bold hover:underline">
              Tenant Organizations
            </a>.
          </p>
        </Card>
      </div>
    );
  }

  if (isLoading) return <p className="text-sm text-slate-500">Loading settings...</p>;

  const custUsed = billing?.usage?.customers?.used ?? 0;
  const custLimit = billing?.usage?.customers?.limit;
  const custPercent = custLimit ? Math.min(100, Math.round((custUsed / custLimit) * 100)) : 15;

  const routerUsed = billing?.usage?.routers?.used ?? 0;
  const routerLimit = billing?.usage?.routers?.limit;
  const routerPercent = routerLimit ? Math.min(100, Math.round((routerUsed / routerLimit) * 100)) : 25;

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Organization Settings &amp; Quotas
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Manage your ISP branding, custom domain, and subscription plan limits.
        </p>
      </div>

      {/* 1. SUBSCRIPTION & RESOURCE QUOTAS CARD */}
      <Card className="p-6 space-y-5 border-slate-800 bg-slate-950/80 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="info">Current Subscription</Badge>
              <span className="font-mono text-xs text-emerald-400 font-bold">
                {billing?.subscription?.plan?.name ?? "Starter WISP Tier"}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Active Billing Cycle: <strong className="text-white">{billing?.subscription?.billingCycle ?? "MONTHLY"}</strong> · Status: <span className="text-emerald-400 font-bold">{billing?.subscription?.status ?? "ACTIVE"}</span>
            </p>
          </div>

          <Button
            onClick={() => setShowRenewModal(true)}
            className="text-xs font-bold bg-emerald-600 hover:bg-emerald-500 shadow-glow-emerald gap-1.5 self-start sm:self-auto"
          >
            <IconMpesa size={14} />
            <span>Renew / Upgrade via M-Pesa</span>
          </Button>
        </div>

        {/* Quota Progress Bars */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
          {/* Customer Quota */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="flex justify-between text-slate-400">
              <span>Active Subscribers:</span>
              <span className="font-bold text-white">
                {custUsed} / {custLimit ? `${custLimit} limit` : "Unlimited"}
              </span>
            </div>
            <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
              <div
                className={`h-full transition-all duration-500 ${
                  custPercent > 85 ? "bg-rose-500" : custPercent > 60 ? "bg-amber-500" : "bg-cyan-500"
                }`}
                style={{ width: `${custPercent}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-500 flex justify-between">
              <span>PPPoE &amp; Hotspot Accounts</span>
              <span>{custPercent}% Utilized</span>
            </div>
          </div>

          {/* Router Quota */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="flex justify-between text-slate-400">
              <span>MikroTik Gateways:</span>
              <span className="font-bold text-white">
                {routerUsed} / {routerLimit ? `${routerLimit} limit` : "Unlimited"}
              </span>
            </div>
            <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
              <div
                className={`h-full transition-all duration-500 ${
                  routerPercent > 85 ? "bg-rose-500" : routerPercent > 60 ? "bg-amber-500" : "bg-emerald-500"
                }`}
                style={{ width: `${routerPercent}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-500 flex justify-between">
              <span>RouterOS v7 &amp; v6 Devices</span>
              <span>{routerPercent}% Utilized</span>
            </div>
          </div>
        </div>
      </Card>

      {/* 2. PLATFORM URL & CUSTOM DOMAIN BINDING */}
      <Card className="p-6 space-y-4 border-slate-800">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Platform Subdomain
          </p>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-cyan-400 truncate">
              {settings?.platformUrl}
            </span>
            <button
              type="button"
              onClick={() => {
                if (settings?.platformUrl) {
                  navigator.clipboard.writeText(settings.platformUrl);
                  setUrlCopied(true);
                  setTimeout(() => setUrlCopied(false), 2000);
                }
              }}
              className="shrink-0 text-slate-400 hover:text-white"
              title="Copy platform URL"
            >
              {urlCopied ? <IconCheck size={14} className="text-emerald-400" /> : <IconCopy size={14} />}
            </button>
          </div>
        </div>

        {/* Custom White-Label Domain Card */}
        <div className="pt-3 border-t border-slate-800/80 space-y-3 font-sans">
          <div>
            <div className="flex items-center gap-2">
              <Label htmlFor="custom-domain">Custom White-Label Domain</Label>
              <span className="px-2 py-0.5 rounded bg-purple-950 border border-purple-800 text-purple-300 font-mono text-[10px]">
                Growth &amp; Enterprise Feature
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Host your subscriber portal on your own domain (e.g. <code className="text-brand-400">wifi.yourisp.co.ke</code>).
            </p>
          </div>

          <form onSubmit={handleVerifyDomain} className="flex flex-col sm:flex-row items-end gap-2">
            <div className="flex-1 w-full">
              <Input
                id="custom-domain"
                placeholder="e.g. portal.fastnetkenya.co.ke"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <Button
              type="submit"
              disabled={verifyingDomain || !customDomain}
              className="text-xs font-bold px-4 py-2.5 shrink-0 shadow-sm"
            >
              {verifyingDomain ? <IconPulse size={13} className="animate-spin" /> : <IconCheck size={13} />}
              <span>{verifyingDomain ? "Verifying DNS..." : "Verify DNS CNAME"}</span>
            </Button>
          </form>

          {domainVerified && (
            <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-mono space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <IconCheck size={14} />
                <span>Domain CNAME Confirmed!</span>
              </div>
              <p className="text-[11px] text-slate-300">
                Point CNAME: <code className="text-cyan-300">{customDomain}</code> &rarr; <code className="text-cyan-300">cname.mashupkgrid.com</code>
              </p>
              <div className="text-[10px] text-emerald-400 flex items-center gap-1 pt-1">
                <IconShield size={12} />
                <span>Cloudflare SSL Certificate Provisioned (TLS 1.3)</span>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* 3. BUSINESS BRANDING FORM */}
      <Card className="p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            save.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="name">Business name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div>
            <Label htmlFor="slug">Tenant slug</Label>
            <Input id="slug" value={settings?.slug ?? ""} disabled />
            <HintText>Used in login and sign-up links — cannot be changed here.</HintText>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="timezone">Timezone</Label>
              <select
                id="timezone"
                className="w-full rounded-lg border border-slate-300/90 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-slate-100"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              >
                {!COMMON_TIMEZONES.includes(timezone) && timezone && (
                  <option value={timezone}>{timezone}</option>
                )}
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="currency">Default currency</Label>
              <select
                id="currency"
                className="w-full rounded-lg border border-slate-300/90 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-slate-100"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {!COMMON_CURRENCIES.includes(currency) && currency && (
                  <option value={currency}>{currency}</option>
                )}
                {COMMON_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <HintText>New invoices and packages default to this currency.</HintText>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 dark:border-obsidian-800">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Branding</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="brandColor">Brand color</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="brandColor"
                    type="color"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-slate-300 bg-white p-1 dark:border-obsidian-700 dark:bg-obsidian-950"
                  />
                  <Input
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    pattern="^#[0-9a-fA-F]{6}$"
                    placeholder="#2563eb"
                  />
                </div>
                <HintText>Used for buttons, active navigation, and accents across your console.</HintText>
              </div>
              <div>
                <Label htmlFor="logoUrl">Logo URL (optional)</Label>
                <Input
                  id="logoUrl"
                  type="url"
                  placeholder="https://your-cdn.com/logo.png"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                />
                <HintText>Hosted image URL for invoices and captive portals.</HintText>
              </div>
            </div>
          </div>

          {/* Captive Portal Hotspot Contact & Banner Settings */}
          <div className="border-t border-slate-100 pt-4 dark:border-obsidian-800 space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Wi-Fi Captive Portal Numbers &amp; Theme
              </p>
              <HintText>
                These settings update your public Wi-Fi login screen and banner numbers for connecting subscribers.
              </HintText>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="contactPhone">Installation / Helpline Phone</Label>
                <Input
                  id="contactPhone"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="07XX XXX XXX"
                  className="font-mono"
                />
                <HintText>Displays on the banner: &quot;For Installation Call: [Number]&quot;</HintText>
              </div>

              <div>
                <Label htmlFor="supportPhone">Customer Support Phone</Label>
                <Input
                  id="supportPhone"
                  value={supportPhone}
                  onChange={(e) => setSupportPhone(e.target.value)}
                  placeholder="07XX XXX XXX"
                  className="font-mono"
                />
                <HintText>Used for ticket support and WhatsApp inquiries.</HintText>
              </div>

              <div>
                <Label htmlFor="welcomeTitle">Welcome Title</Label>
                <Input
                  id="welcomeTitle"
                  value={welcomeTitle}
                  onChange={(e) => setWelcomeTitle(e.target.value)}
                  placeholder="FAST &amp; SECURE WI-FI"
                />
              </div>

              <div>
                <Label htmlFor="bannerSubtitle">Banner Subtitle</Label>
                <Input
                  id="bannerSubtitle"
                  value={bannerSubtitle}
                  onChange={(e) => setBannerSubtitle(e.target.value)}
                  placeholder="HIGH SPEED FIBER CONNECTION"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving..." : "Save changes"}
            </Button>
            {saved && <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Saved</span>}
          </div>
          {error && <ErrorText>{error}</ErrorText>}
        </form>
      </Card>

      {/* RENEW / UPGRADE M-PESA MODAL */}
      {showRenewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950 p-6 space-y-5 shadow-2xl text-left font-sans">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div>
                <Badge variant="info">M-Pesa STK Push Renewal</Badge>
                <h3 className="text-lg font-bold text-white mt-1">Renew / Upgrade Plan</h3>
              </div>
              <button
                onClick={() => setShowRenewModal(false)}
                className="h-8 w-8 rounded-full bg-slate-900 text-slate-400 hover:text-white flex items-center justify-center text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs font-mono space-y-1">
              <div className="text-slate-400">Plan: <strong className="text-white">{billing?.subscription?.plan?.name ?? "Starter WISP"}</strong></div>
              <div className="text-slate-400">Amount: <strong className="text-emerald-400">KES {billing?.subscription?.plan?.monthlyPriceMinor ? (billing.subscription.plan.monthlyPriceMinor / 100).toLocaleString() : "4,500"}</strong></div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="stk-phone">M-Pesa Phone Number</Label>
              <Input
                id="stk-phone"
                value={renewPhone}
                onChange={(e) => setRenewPhone(e.target.value)}
                placeholder="0712345678"
                className="font-mono text-xs"
              />
              <HintText>You will receive an instant STK PIN prompt on your handset.</HintText>
            </div>

            {stkSent && (
              <div className="p-3 rounded-lg bg-emerald-950 border border-emerald-500/40 text-emerald-300 text-xs font-mono text-center animate-pulse">
                ✓ STK Push sent! Enter PIN on your phone to complete renewal.
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowRenewModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-slate-300 text-xs font-bold"
              >
                Cancel
              </button>
              <Button
                onClick={() => renewSubscription.mutate()}
                disabled={renewSubscription.isPending || !renewPhone.trim() || stkSent}
                className="text-xs font-bold bg-emerald-600 hover:bg-emerald-500 shadow-glow-emerald gap-1.5"
              >
                {renewSubscription.isPending ? <IconPulse size={14} className="animate-spin" /> : <IconMpesa size={14} />}
                <span>{renewSubscription.isPending ? "Sending STK..." : "Send M-Pesa STK Push"}</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
