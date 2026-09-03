"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button, Card, Badge, StatusDot } from "@/components/ui";
import {
  IconRouter,
  IconMpesa,
  IconShield,
  IconNetworkPool,
  IconTicket,
  IconUsers,
  IconSpeed,
  IconCheck,
  IconArrowRight,
  IconTerminal,
  IconPulse,
  IconCopy,
  IconMessage,
  IconSparkles,
  IconDashboard,
  IconChevronRight,
  IconTenants,
  IconWebhook,
} from "@/components/icons";
import { NetworkCablesAnimation } from "@/components/network-cables-animation";
import { TelecomInnovationsHub } from "@/components/features/telecom-innovations-hub";
import { SmartNetworkSegmenter } from "@/components/features/smart-network-segmenter";
import { InstantHowItWorksHero } from "@/components/features/instant-how-it-works-hero";
import { HowItWorksTimeline } from "@/components/features/how-it-works-timeline";
import { ComparisonMatrix } from "@/components/features/comparison-matrix";
import { SubscriberPortalPreviewModal } from "@/components/features/subscriber-portal-preview-modal";
import {
  LandingMaintenanceConfig,
  DEFAULT_LANDING_MAINTENANCE,
  getLandingMaintenanceConfig,
} from "@/lib/landing-maintenance";
import {
  TestimonialsConfig,
  DEFAULT_TESTIMONIALS,
  getTestimonialsConfig,
} from "@/lib/testimonials";
import {
  LandingContent,
  DEFAULT_LANDING_CONTENT,
  getLandingContent,
} from "@/lib/landing-content";
import { LandingMaintenanceScreen } from "@/components/landing-maintenance-screen";

export function LandingClient({ initialContent }: { initialContent: LandingContent }) {
  // Navigation & UI state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navDropdown, setNavDropdown] = useState<"network" | "platform" | null>(null);
  const [pricingCycle, setPricingCycle] = useState<"monthly" | "annual">("monthly");
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Dynamic Landing Content State. Seeded from the server (see page.tsx) rather than from the
  // built-in defaults, so the copy an operator actually published is what renders on first paint
  // — and therefore what a crawler reads, since the edited copy is the page's main ranking signal.
  const [landingContent, setLandingContent] = useState<LandingContent>(initialContent);

  // Testimonials State
  const [testimonialsConfig, setTestimonialsConfig] = useState<TestimonialsConfig>(DEFAULT_TESTIMONIALS);

  // Maintenance Mode State
  const [maintenanceConfig, setMaintenanceConfig] = useState<LandingMaintenanceConfig>(DEFAULT_LANDING_MAINTENANCE);
  const [isBypassed, setIsBypassed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const cfg = getLandingMaintenanceConfig();
    setMaintenanceConfig(cfg);
    setTestimonialsConfig(getTestimonialsConfig());
    // Deliberately NOT re-reading landing content from localStorage here. That read is what made
    // the editor a local preview: content saved from the dashboard reached the server correctly,
    // but the public page only ever rendered whatever sat in the viewer's own browser — so an
    // operator saw their edits and every real visitor saw the built-in defaults. The server copy
    // passed in as `initialContent` is the single source of truth.

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const bypassParam = params.get("bypass");
      const sessionBypassed = sessionStorage.getItem("mkg_admin_bypassed");

      if (bypassParam && bypassParam === cfg.bypassSecret) {
        sessionStorage.setItem("mkg_admin_bypassed", "true");
        setIsBypassed(true);
      } else if (sessionBypassed === "true") {
        setIsBypassed(true);
      }
    }

    const handleMaintChange = () => {
      setMaintenanceConfig(getLandingMaintenanceConfig());
    };
    const handleTestimonialsChange = () => {
      setTestimonialsConfig(getTestimonialsConfig());
    };
    // Live preview for the tab doing the editing: saveLandingContent fires this event in the
    // same browser. A visitor never receives it.
    const handleContentChange = () => {
      setLandingContent(getLandingContent());
    };

    window.addEventListener("mkg_maintenance_change", handleMaintChange);
    window.addEventListener("mkg_testimonials_change", handleTestimonialsChange);
    window.addEventListener("mkg_landing_content_change", handleContentChange);

    return () => {
      window.removeEventListener("mkg_maintenance_change", handleMaintChange);
      window.removeEventListener("mkg_testimonials_change", handleTestimonialsChange);
      window.removeEventListener("mkg_landing_content_change", handleContentChange);
    };
  }, []);

  const handleUnlockBypass = (inputSecret: string) => {
    if (inputSecret === maintenanceConfig.bypassSecret) {
      if (typeof window !== "undefined") {
        sessionStorage.setItem("mkg_admin_bypassed", "true");
      }
      setIsBypassed(true);
      return true;
    }
    return false;
  };

  // Live Telecom Simulator State
  const [simTab, setSimTab] = useState<"telemetry" | "mpesa" | "vouchers" | "ipam">("telemetry");
  const [stkPhone, setStkPhone] = useState("0712345678");
  const [stkAmount, setStkAmount] = useState(2500);
  const [stkStatus, setStkStatus] = useState<"idle" | "sending" | "received" | "reconciled">("idle");
  const [stkReceipt, setStkReceipt] = useState<string | null>(null);

  // Script Generator State
  const [scriptTab, setScriptTab] = useState<"pppoe" | "hotspot" | "radius">("pppoe");
  const [scriptHost, setScriptHost] = useState("197.248.42.10");
  const [scriptSecret, setScriptSecret] = useState("mkg_radius_secret_x91");
  const [copied, setCopied] = useState(false);

  // ROI Calculator State
  const [subscribers, setSubscribers] = useState(350);
  const [arpu, setArpu] = useState(2500); // KES

  // Derived ROI values
  const monthlyRevenue = subscribers * arpu;
  const annualRevenue = monthlyRevenue * 12;
  const adminHoursSaved = Math.round(subscribers * 0.16); // ~56 hrs/mo for 350 subs
  const recoveredLeakage = Math.round(monthlyRevenue * 0.08); // 8% revenue leakage prevented

  const handleSimulateStk = () => {
    setStkStatus("sending");
    setTimeout(() => {
      setStkStatus("received");
      const randomCode = "SK" + Math.floor(10000000 + Math.random() * 90000000).toString().substring(0, 8);
      setStkReceipt(randomCode);
      setTimeout(() => {
        setStkStatus("reconciled");
      }, 1200);
    }, 1500);
  };

  const getMikrotikScript = () => {
    if (scriptTab === "pppoe") {
      return `# ==============================================================
# MASHUPKGRID ISP — MIKROTIK ROUTEROS PPPoE SERVER PROVISIONING
# ==============================================================
/radius
add address=${scriptHost} secret="${scriptSecret}" service=ppp comment="Mashupkgrid RADIUS Auth" timeout=3000ms
/radius incoming
set accept=yes port=3799

/ppp aaa
set use-radius=yes accounting=yes interim-update=00:05:00

/interface pppoe-server server
add service-name="MASHUPKGRID-FIBER" interface=ether2 max-mtu=1492 max-mru=1492 \\
    authentication=chap,mschap2 default-profile=default disabled=no`;
    }

    if (scriptTab === "hotspot") {
      return `# ==============================================================
# MASHUPKGRID ISP — MIKROTIK HOTSPOT & CAPTIVE PORTAL PROVISIONING
# ==============================================================
/radius
add address=${scriptHost} secret="${scriptSecret}" service=hotspot comment="Mashupkgrid Hotspot RADIUS" timeout=2500ms
/radius incoming
set accept=yes port=3799

/ip hotspot profile
set [ find default=yes ] use-radius=yes radius-accounting=yes radius-interim-update=00:02:00 \\
    login-by=http-chap,http-pap

/ip hotspot user profile
set [ find default=yes ] rate-limit="10M/10M" transparent-proxy=no`;
    }

    return `# ==============================================================
# MASHUPKGRID ISP — CORE RADIUS CLIENT WITH DYNAMIC DISCONNECT (COA)
# ==============================================================
/radius
add address=${scriptHost} secret="${scriptSecret}" service=ppp,hotspot,login \\
    comment="Mashupkgrid Core Auth Engine" timeout=3000ms
/radius incoming
set accept=yes port=3799

/tool fetch url="https://api.mashupkgrid.com/v1/routers/health-beacon" keep-result=no`;
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(getMikrotikScript());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const FAQS = [
    {
      q: "Does Mashupkgrid ISP work with both MikroTik RouterOS v6 and v7?",
      a: "Yes. Our native RouterOS client communicates directly with RouterOS v6.48+ LTS through the modern v7.12+ REST and API-TLS protocols. It automatically handles fast routing, active queues, interface address lists, and PPPoE binding without needing any external agents.",
    },
    {
      q: "How does the Safaricom M-Pesa STK Push and Paybill reconciliation work?",
      a: "When a subscriber pays via your Safaricom Paybill or initiates an instant STK push prompt from the customer portal, our Daraja 2.0 gateway matches the Paybill account number with the subscriber's account. Within 1.5 seconds, the ledger is credited, the invoice is marked PAID, and a RADIUS CoA disconnect signal is sent to the MikroTik router to un-throttle their speed instantly.",
    },
    {
      q: "Can I manage multiple MikroTik routers and distributed POPs?",
      a: "Absolutely. You can attach an unlimited number of core routers, base stations, and edge switches across multiple geographic sites. Each router is continuously monitored with real-time CPU, RAM, temperature, and link latency metrics.",
    },
    {
      q: "Does the platform support high-volume hotspot voucher printing?",
      a: "Yes. You can generate thousands of hotspot vouchers in batches with custom prefixes, expiration hours, and upload/download data quotas. Print them in customizable 3x8 or 4x10 grid voucher sheets with QR codes for instantaneous subscriber phone camera logins.",
    },
    {
      q: "Can I white-label the dashboard with my own ISP logo and custom domain?",
      a: "Yes! Mashupkgrid ISP features full multi-tenant white-labeling. You can set your own ISP brand name, primary theme colors, custom logo, and host the customer portal on your own domain (e.g., portal.yourisp.co.ke).",
    },
  ];

  // If maintenance mode is active and user has not bypassed it, render the maintenance screen!
  if (mounted && maintenanceConfig.enabled && !isBypassed) {
    return (
      <LandingMaintenanceScreen
        config={maintenanceConfig}
        onBypass={handleUnlockBypass}
      />
    );
  }

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 selection:bg-brand-500 selection:text-white font-sans antialiased">
      {/* Super Admin Bypass Notification Banner */}
      {mounted && maintenanceConfig.enabled && isBypassed && (
        <div className="relative z-50 bg-amber-500 text-slate-950 px-4 py-2 text-center text-xs font-mono font-bold flex items-center justify-center gap-2 shadow-lg">
          <span className="px-1.5 py-0.5 rounded bg-black text-amber-400 text-[10px] uppercase">MAINTENANCE</span>
          <span>
            SUPER ADMIN NOTICE: Landing page maintenance mode is currently ACTIVE. Public visitors see the maintenance screen.
          </span>
          <Link
            href="/maintenance"
            className="underline text-black font-extrabold hover:text-white transition-colors ml-2"
          >
            Manage in Dashboard &rarr;
          </Link>
          <button
            onClick={() => {
              if (typeof window !== "undefined") {
                sessionStorage.removeItem("mkg_admin_bypassed");
              }
              setIsBypassed(false);
            }}
            className="ml-4 px-2 py-0.5 rounded bg-black/20 hover:bg-black/40 text-black text-[10px]"
          >
            Lock Again
          </button>
        </div>
      )}

      {/* Dynamic Background Mesh & Ambient Glow matching Logo Colors */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-tr from-cyan-500/20 via-sky-500/15 to-emerald-500/15 blur-[130px] rounded-full" />
        <div className="absolute top-[800px] right-0 w-[600px] h-[400px] bg-cyan-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-10 left-10 w-[500px] h-[500px] bg-emerald-500/10 blur-[120px] rounded-full" />
        <div className="absolute inset-0 bg-grid-pattern opacity-60" />
      </div>

      {/* Smart Top Announcement Pill Bar */}
      <div className="relative z-50 bg-gradient-to-r from-cyan-950/80 via-slate-950 to-emerald-950/80 border-b border-cyan-500/20 py-2 px-4 text-center text-xs font-mono">
        <a href={landingContent.announcement.linkUrl || "#innovations"} className="inline-flex items-center gap-2 text-slate-300 hover:text-white transition-colors">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono text-[10px] font-bold uppercase tracking-wider border border-cyan-500/40">
            {landingContent.announcement.badge}
          </span>
          <span>{landingContent.announcement.text}</span>
          <span className="text-cyan-400 font-bold ml-1">{landingContent.announcement.linkText}</span>
        </a>
      </div>

      {/* Smart Floating Glass Capsule Header */}
      <header className="sticky top-2 sm:top-3 z-50 px-3 sm:px-6 transition-all duration-300">
        <div className="mx-auto max-w-7xl rounded-2xl border border-slate-800/80 bg-slate-950/85 backdrop-blur-2xl shadow-2xl shadow-black/80 ring-1 ring-white/10">
          <div className="flex items-center justify-between px-4 sm:px-6 py-2.5 sm:py-3">
            {/* Brand Logo & Smart Pill */}
            <Link href="/" className="flex items-center gap-3 group shrink-0">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl overflow-hidden shadow-lg shadow-cyan-500/25 ring-1 ring-cyan-500/40 transition-transform group-hover:scale-105 bg-slate-950">
                <img
                  src="/logo.jpg"
                  alt="Mashupkgrid ISP Logo"
                  className="h-full w-full object-cover"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm sm:text-base font-black tracking-tight text-white group-hover:text-cyan-400 transition-colors">
                    MASHUPKGRID
                  </span>
                  <span className="rounded-full bg-cyan-950/80 border border-cyan-500/40 px-2 py-0.5 text-[9px] font-mono font-bold text-cyan-300 uppercase tracking-wider">
                    ISP Engine
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-mono hidden sm:block">
                  Telecom Billing &amp; MikroTik Cloud
                </p>
              </div>
            </Link>

            {/* Smart Categorized Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-1.5 text-xs font-semibold text-slate-300">
              {/* DROPDOWN 1: Network & Demos */}
              <div
                className="relative"
                onMouseEnter={() => setNavDropdown("network")}
                onMouseLeave={() => setNavDropdown(null)}
              >
                <button
                  type="button"
                  onClick={() => setNavDropdown(navDropdown === "network" ? null : "network")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                    navDropdown === "network"
                      ? "bg-slate-900 text-cyan-400 shadow-sm"
                      : "hover:text-white hover:bg-slate-900/60"
                  }`}
                >
                  <span>Network &amp; Live Telemetry</span>
                  <svg
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                      navDropdown === "network" ? "rotate-180 text-cyan-400" : "text-slate-500"
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Dropdown Menu 1 */}
                {navDropdown === "network" && (
                  <div className="absolute top-full left-0 mt-2 w-72 rounded-2xl border border-slate-800 bg-slate-950/95 backdrop-blur-2xl p-2.5 shadow-2xl ring-1 ring-white/10 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                    <a
                      href="#demo"
                      onClick={() => setNavDropdown(null)}
                      className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-slate-900/80 transition-colors group"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400 border border-brand-500/30 text-sm">
                        <IconRouter size={15} />
                      </span>
                      <div>
                        <div className="text-xs font-bold text-white group-hover:text-brand-400 transition-colors">
                          Live Telecom Console
                        </div>
                        <p className="text-[10px] text-slate-400 leading-snug mt-0.5">
                          Interactive MikroTik AAA &amp; M-Pesa STK push sandbox
                        </p>
                      </div>
                    </a>

                    <a
                      href="#cables"
                      onClick={() => setNavDropdown(null)}
                      className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-slate-900/80 transition-colors group"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 text-sm">
                        <IconSpeed size={15} />
                      </span>
                      <div>
                        <div className="text-xs font-bold text-white group-hover:text-cyan-400 transition-colors flex items-center gap-1.5">
                          <span>Fiber &amp; Ethernet</span>
                          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                        </div>
                        <p className="text-[10px] text-slate-400 leading-snug mt-0.5">
                          Live GPON optical attenuation &amp; cable telemetry
                        </p>
                      </div>
                    </a>

                    <a
                      href="#innovations"
                      onClick={() => setNavDropdown(null)}
                      className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-slate-900/80 transition-colors group"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-sm">
                        <IconSparkles size={15} />
                      </span>
                      <div>
                        <div className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors flex items-center gap-1.5">
                          <span>Telecom Innovations</span>
                          <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-[9px] text-emerald-300 font-mono">10 Tools</span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-snug mt-0.5">
                          Captive Studio, PWA Field Tool, NOC Telegram alerts
                        </p>
                      </div>
                    </a>

                    <a
                      href="#scripts"
                      onClick={() => setNavDropdown(null)}
                      className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-slate-900/80 transition-colors group"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 text-sm">
                        <IconTerminal size={15} />
                      </span>
                      <div>
                        <div className="text-xs font-bold text-white group-hover:text-cyan-400 transition-colors">
                          RouterOS Scripts
                        </div>
                        <p className="text-[10px] text-slate-400 leading-snug mt-0.5">
                          1-Click MikroTik v6 &amp; v7 production provisioning
                        </p>
                      </div>
                    </a>
                  </div>
                )}
              </div>

              {/* DROPDOWN 2: Platform & Architecture */}
              <div
                className="relative"
                onMouseEnter={() => setNavDropdown("platform")}
                onMouseLeave={() => setNavDropdown(null)}
              >
                <button
                  type="button"
                  onClick={() => setNavDropdown(navDropdown === "platform" ? null : "platform")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                    navDropdown === "platform"
                      ? "bg-slate-900 text-brand-400 shadow-sm"
                      : "hover:text-white hover:bg-slate-900/60"
                  }`}
                >
                  <span>Platform &amp; Architecture</span>
                  <svg
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                      navDropdown === "platform" ? "rotate-180 text-brand-400" : "text-slate-500"
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Dropdown Menu 2 */}
                {navDropdown === "platform" && (
                  <div className="absolute top-full left-0 mt-2 w-72 rounded-2xl border border-slate-800 bg-slate-950/95 backdrop-blur-2xl p-2.5 shadow-2xl ring-1 ring-white/10 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                    <a
                      href="#features"
                      onClick={() => setNavDropdown(null)}
                      className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-slate-900/80 transition-colors group"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-sm">
                        <IconDashboard size={15} />
                      </span>
                      <div>
                        <div className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors">
                          Platform Features
                        </div>
                        <p className="text-[10px] text-slate-400 leading-snug mt-0.5">
                          FreeRADIUS AAA, Invoicing, IPAM &amp; POS Vouchers
                        </p>
                      </div>
                    </a>

                    <a
                      href="#architecture"
                      onClick={() => setNavDropdown(null)}
                      className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-slate-900/80 transition-colors group"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400 border border-sky-500/30 text-sm">
                        <IconNetworkPool size={15} />
                      </span>
                      <div>
                        <div className="text-xs font-bold text-white group-hover:text-sky-400 transition-colors">
                          Core Architecture
                        </div>
                        <p className="text-[10px] text-slate-400 leading-snug mt-0.5">
                          Distributed cluster, RFC 3576 CoA &amp; MikroTik sync
                        </p>
                      </div>
                    </a>

                    <a
                      href="#calculator"
                      onClick={() => setNavDropdown(null)}
                      className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-slate-900/80 transition-colors group"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 text-sm">
                        <IconPulse size={15} />
                      </span>
                      <div>
                        <div className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors">
                          ROI Calculator
                        </div>
                        <p className="text-[10px] text-slate-400 leading-snug mt-0.5">
                          Estimate subscriber revenue &amp; leakage recovery
                        </p>
                      </div>
                    </a>
                  </div>
                )}
              </div>

              {/* Direct links */}
              <a
                href="#pricing"
                className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-slate-900/60 transition-all"
              >
                Pricing
              </a>
              <a
                href="#faq"
                className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-slate-900/60 transition-all"
              >
                FAQ
              </a>
            </nav>

            {/* Right CTAs & Live Telemetry Pill */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Smart Live Telemetry Pill */}
              <div
                className="hidden xl:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[11px] font-mono font-bold shadow-xs hover:border-emerald-400 transition-colors"
                title="FreeRADIUS 3.2 · MikroTik REST API Connected · Latency 1.8ms"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>RADIUS: 1.8ms</span>
              </div>

              {/* Sign In */}
              <Link
                href="/login"
                className="text-xs font-bold text-slate-300 hover:text-white px-3 py-1.5 rounded-xl border border-transparent hover:border-slate-800 hover:bg-slate-900/80 transition-all"
              >
                Sign In
              </Link>

              {/* Deploy Console (Direct Centipid-style registration) */}
              <Link href="/isp/registration">
                <Button className="gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs font-black shadow-glow bg-gradient-to-r from-cyan-500 via-blue-600 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 rounded-xl transition-all">
                  <span>Deploy Console</span>
                  <IconArrowRight size={13} />
                </Button>
              </Link>

              {/* Mobile Menu Button */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900 border border-slate-800"
                aria-label="Toggle navigation menu"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {mobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>

          {/* Smart Mobile Navigation Drawer */}
          {mobileMenuOpen && (
            <div className="lg:hidden border-t border-slate-800/80 p-4 space-y-3 text-xs animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="grid grid-cols-2 gap-2 text-left font-mono">
                <a
                  href="#demo"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-200 hover:border-cyan-500/50 flex items-center gap-2"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                  <span className="font-bold">Live Console</span>
                </a>
                <a
                  href="#cables"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-cyan-300 hover:border-cyan-500/50 flex items-center gap-2"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="font-bold">Fiber Stream</span>
                </a>
                <a
                  href="#innovations"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-emerald-300 hover:border-emerald-500/50 flex items-center gap-2"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span className="font-bold">Innovations</span>
                </a>
                <a
                  href="#scripts"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-cyan-300 hover:border-cyan-500/50 flex items-center gap-2"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                  <span className="font-bold">RouterOS</span>
                </a>
                <a
                  href="#features"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-200 hover:border-slate-700 flex items-center gap-2"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span className="font-bold">Features</span>
                </a>
                <a
                  href="#architecture"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-200 hover:border-slate-700 flex items-center gap-2"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                  <span className="font-bold">Architecture</span>
                </a>
                <a
                  href="#calculator"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-200 hover:border-slate-700 flex items-center gap-2"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  <span className="font-bold">ROI Model</span>
                </a>
                <a
                  href="#pricing"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-200 hover:border-slate-700 flex items-center gap-2"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                  <span className="font-bold">Pricing</span>
                </a>
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-slate-800/80 text-[11px] font-mono">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>FreeRADIUS: 1.8ms</span>
                </span>
                <Link
                  href="/isp/registration"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-cyan-400 font-bold hover:underline"
                >
                  Deploy Console &rarr;
                </Link>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pt-16 pb-20 text-center sm:pt-24 sm:pb-28">
        {/* Status Pill Badge */}
        <div className="inline-flex items-center gap-2.5 rounded-full border border-slate-700/80 bg-slate-800/80 px-4 py-1.5 text-xs font-medium text-slate-200 shadow-xl mb-8 backdrop-blur-md">
          <StatusDot status="ONLINE" pulse={true} />
          <span className="text-slate-300 font-mono">{landingContent.hero.statusBadge}</span>
        </div>

        {/* Hero Title */}
        <h1 className="text-4xl font-black tracking-tight text-white sm:text-6xl lg:text-7xl sm:leading-[1.12]">
          {landingContent.hero.mainHeadingStart}{" "}
          <span className="bg-gradient-to-r from-cyan-400 via-sky-400 to-emerald-400 bg-clip-text text-transparent">
            {landingContent.hero.mainHeadingGradient}
          </span>{" "}
          {landingContent.hero.mainHeadingEnd}
        </h1>

        {/* Hero Subtitle */}
        <p className="mx-auto mt-6 max-w-3xl text-base sm:text-xl text-slate-300 font-normal leading-relaxed">
          {landingContent.hero.description}
        </p>

        {/* Hero CTA Buttons */}
        <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
          <Link href={landingContent.hero.primaryCtaUrl || "/register"}>
            <Button className="px-8 py-3.5 text-base font-bold shadow-glow bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 gap-2">
              <span>{landingContent.hero.primaryCtaText || "Start 14-Day Free Trial"}</span>
              <IconArrowRight size={16} />
            </Button>
          </Link>
          <SubscriberPortalPreviewModal />
          <a href={landingContent.hero.secondaryCtaUrl || "#demo"}>
            <Button variant="secondary" className="px-6 py-3 text-sm font-semibold border-slate-700 bg-slate-800/80 text-white hover:bg-slate-700/80 gap-2">
              <IconTerminal size={15} className="text-cyan-400" />
              <span>{landingContent.hero.secondaryCtaText || "Live Console Sandbox"}</span>
            </Button>
          </a>
        </div>

        {/* Social Proof Stats Bar */}
        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto border-t border-slate-800/80 pt-8 text-left">
          <div className="border-l-2 border-cyan-500 pl-4">
            <div className="text-2xl font-black font-mono text-white">120+ ISPs</div>
            <div className="text-xs text-slate-400 font-medium">WISPs &amp; Fiber Carriers Powered</div>
          </div>
          <div className="border-l-2 border-emerald-500 pl-4">
            <div className="text-2xl font-black font-mono text-emerald-400">KES 180M+</div>
            <div className="text-xs text-slate-400 font-medium">Monthly M-Pesa Automated</div>
          </div>
          <div className="border-l-2 border-sky-500 pl-4">
            <div className="text-2xl font-black font-mono text-sky-400">&lt; 1.8s</div>
            <div className="text-xs text-slate-400 font-medium">STK Push to Un-throttle</div>
          </div>
          <div className="border-l-2 border-emerald-400 pl-4">
            <div className="text-2xl font-black font-mono text-emerald-400">99.99%</div>
            <div className="text-xs text-slate-400 font-medium">Core RADIUS Uptime SLA</div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 3-SECOND COMPREHENSION: INSTANT HOW IT WORKS & INTERACTIVE DEMO */}
        {/* ========================================================================= */}
        <InstantHowItWorksHero />

        {/* ========================================================================= */}
        {/* SECTION: SMART NETWORK ARCHITECTURE SEGMENTER */}
        {/* ========================================================================= */}
        <div className="text-left">
          <SmartNetworkSegmenter />
        </div>

        {/* ========================================================================= */}
        {/* INTERACTIVE TELECOM SIMULATOR SHOWCASE */}
        {/* ========================================================================= */}
        <div id="demo" className="mt-16 text-left scroll-mt-24">
          <div className="rounded-2xl border border-slate-700/80 bg-slate-950/90 shadow-2xl overflow-hidden backdrop-blur-xl ring-1 ring-white/10">
            {/* Top Chrome Window Header */}
            <div className="flex flex-wrap items-center justify-between border-b border-slate-800 bg-slate-950 px-5 py-3.5 gap-4">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-rose-500/80 inline-block" />
                <span className="h-3 w-3 rounded-full bg-amber-500/80 inline-block" />
                <span className="h-3 w-3 rounded-full bg-emerald-500/80 inline-block" />
                <span className="ml-3 font-mono text-xs text-slate-400 flex items-center gap-1.5">
                  <span className="text-brand-400 font-bold">core-gw-nbo.mashupkgrid.net</span>
                  <span>[RouterOS v7.16 · API-TLS 8729]</span>
                </span>
              </div>

              {/* Simulator Tabs */}
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs font-medium">
                <button
                  onClick={() => setSimTab("telemetry")}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                    simTab === "telemetry"
                      ? "bg-brand-600 text-white font-semibold shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <IconPulse size={14} />
                  <span>Live Telemetry</span>
                </button>
                <button
                  onClick={() => setSimTab("mpesa")}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                    simTab === "mpesa"
                      ? "bg-emerald-600 text-white font-semibold shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <IconMpesa size={14} />
                  <span>M-Pesa STK Simulator</span>
                </button>
                <button
                  onClick={() => setSimTab("vouchers")}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                    simTab === "vouchers"
                      ? "bg-cyan-600 text-white font-semibold shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <IconTicket size={14} />
                  <span>Voucher Studio</span>
                </button>
                <button
                  onClick={() => setSimTab("ipam")}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                    simTab === "ipam"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <IconNetworkPool size={14} />
                  <span>Dual-Stack IPAM</span>
                </button>
              </div>
            </div>

            {/* Tab 1: Live RouterOS Telemetry */}
            {simTab === "telemetry" && (
              <div className="p-6 md:p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                       Core Hardware
                    </p>
                    <p className="text-xl font-bold font-mono text-white mt-1">CCR2004-16G-2S+</p>
                    <p className="text-xs text-emerald-400 font-mono mt-1">CPU Load: 12% · 44°C</p>
                  </div>
                  <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Active PPPoE Sessions
                    </p>
                    <p className="text-xl font-bold font-mono text-cyan-400 mt-1">1,482 Online</p>
                    <p className="text-xs text-slate-400 font-mono mt-1">0 dropped in 24h</p>
                  </div>
                  <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Aggregated Uplink
                    </p>
                    <p className="text-xl font-bold font-mono text-emerald-400 mt-1">2.41 Gbps</p>
                    <p className="text-xs text-slate-400 font-mono mt-1">Peak: 3.85 Gbps</p>
                  </div>
                  <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      RADIUS Latency
                    </p>
                    <p className="text-xl font-bold font-mono text-sky-400 mt-1">1.8 ms</p>
                    <p className="text-xs text-slate-400 font-mono mt-1">CoA Port 3799 ACK</p>
                  </div>
                </div>

                {/* Live Simulated Traffic Bars */}
                <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 space-y-4">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-300 font-semibold">Active Interface Queues (Dynamic RouterOS Sync)</span>
                    <span className="text-emerald-400">● Real-time Polling (every 500ms)</span>
                  </div>

                  <div className="space-y-3 font-mono text-xs">
                    <div>
                      <div className="flex justify-between text-slate-300 mb-1">
                        <span>sfp-sfpplus1 (Nairobi IXP Peering)</span>
                        <span className="text-emerald-400 font-bold">1,820 Mbps / 2,000 Mbps (91%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full w-[91%]" />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-slate-300 mb-1">
                        <span>ether2-pppoe-distribution (Westlands OLT Trunk)</span>
                        <span className="text-cyan-400 font-bold">940 Mbps / 1,000 Mbps (94%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full w-[94%]" />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-slate-300 mb-1">
                        <span>ether3-hotspot-mall (CBD Public Wi-Fi)</span>
                        <span className="text-emerald-400 font-bold">142 Mbps / 300 Mbps (47%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full w-[47%]" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: M-Pesa STK Push Simulator */}
            {simTab === "mpesa" && (
              <div className="p-6 md:p-8 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                  <div className="lg:col-span-5 space-y-4 rounded-xl bg-slate-900/90 border border-slate-800 p-5">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                        KES
                      </div>
                      <h4 className="text-sm font-bold text-white">Simulate Customer STK Push</h4>
                    </div>
                    <p className="text-xs text-slate-400">
                      Test our instant Safaricom webhook reconciliation and automated un-throttling on RouterOS.
                    </p>

                    <div>
                      <label htmlFor="stk-phone-input" className="text-[11px] font-semibold text-slate-400 uppercase">Customer Phone</label>
                      <input
                        id="stk-phone-input"
                        type="text"
                        value={stkPhone}
                        onChange={(e) => setStkPhone(e.target.value)}
                        className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label htmlFor="stk-amount-select" className="text-[11px] font-semibold text-slate-400 uppercase">Package Renewal Amount</label>
                      <select
                        id="stk-amount-select"
                        value={stkAmount}
                        onChange={(e) => setStkAmount(Number(e.target.value))}
                        className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:border-emerald-500 focus:outline-none"
                      >
                        <option value={1500}>KES 1,500 — Bronze Home (10 Mbps)</option>
                        <option value={2500}>KES 2,500 — Silver Stream (25 Mbps)</option>
                        <option value={4500}>KES 4,500 — Gold Business (60 Mbps)</option>
                      </select>
                    </div>

                    <button
                      onClick={handleSimulateStk}
                      disabled={stkStatus === "sending"}
                      className="w-full py-2.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold text-sm hover:from-emerald-500 hover:to-teal-500 transition-all flex items-center justify-center gap-2 shadow-glow-emerald disabled:opacity-50"
                    >
                      {stkStatus === "sending" ? (
                        <>
                          <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Dispatching Daraja STK...</span>
                        </>
                      ) : (
                        <>
                          <IconMpesa size={16} />
                          <span>Trigger Live M-Pesa STK Push</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Simulator Output Flow */}
                  <div className="lg:col-span-7 space-y-3 font-mono text-xs">
                    <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-4 space-y-2.5">
                      <div className="flex items-center justify-between text-slate-400 pb-2 border-b border-slate-800">
                        <span>LIFECYCLE TELECOM RECONCILIATION ENGINE</span>
                        <span className="text-emerald-400">PAYBILL: 4082100</span>
                      </div>

                      {/* Step 1 */}
                      <div className={`flex items-center gap-3 p-2 rounded-lg ${
                        stkStatus !== "idle" ? "bg-slate-800/80 text-emerald-300" : "text-slate-500"
                      }`}>
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center font-bold text-[10px] ${
                          stkStatus !== "idle" ? "bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-500"
                        }`}>
                          1
                        </div>
                        <div className="flex-1">
                          <span className="font-semibold">STK Push Sent:</span> Prompt dispatched to {stkPhone} for KES {stkAmount.toLocaleString()}
                        </div>
                        {stkStatus !== "idle" && <IconCheck size={14} className="text-emerald-400" />}
                      </div>

                      {/* Step 2 */}
                      <div className={`flex items-center gap-3 p-2 rounded-lg ${
                        stkStatus === "received" || stkStatus === "reconciled" ? "bg-slate-800/80 text-emerald-300" : "text-slate-500"
                      }`}>
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center font-bold text-[10px] ${
                          stkStatus === "received" || stkStatus === "reconciled" ? "bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-500"
                        }`}>
                          2
                        </div>
                        <div className="flex-1">
                          <span className="font-semibold">Daraja C2B Webhook:</span> Validated signature · M-Pesa Code:{" "}
                          <span className="text-white font-bold">{stkReceipt || "Pending..."}</span>
                        </div>
                        {(stkStatus === "received" || stkStatus === "reconciled") && <IconCheck size={14} className="text-emerald-400" />}
                      </div>

                      {/* Step 3 */}
                      <div className={`flex items-center gap-3 p-2 rounded-lg ${
                        stkStatus === "reconciled" ? "bg-slate-800/80 text-emerald-300" : "text-slate-500"
                      }`}>
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center font-bold text-[10px] ${
                          stkStatus === "reconciled" ? "bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-500"
                        }`}>
                          3
                        </div>
                        <div className="flex-1">
                          <span className="font-semibold">RouterOS CoA Executed:</span> Subscriber un-throttled to 25 Mbps in 1.4s · SMS sent via Africa&apos;s Talking
                        </div>
                        {stkStatus === "reconciled" && <IconCheck size={14} className="text-emerald-400" />}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Hotspot Voucher Studio */}
            {simTab === "vouchers" && (
              <div className="p-6 md:p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Voucher Card 1 */}
                  <div className="rounded-xl border border-dashed border-cyan-500/50 bg-gradient-to-br from-cyan-950/40 to-slate-950 p-5 space-y-3 relative overflow-hidden">
                    <div className="absolute top-2 right-2 text-[10px] font-mono uppercase bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded">
                      HOTSPOT PASS
                    </div>
                    <div className="text-lg font-black text-white">1 Hour Unlimited</div>
                    <div className="text-2xl font-mono font-bold text-cyan-400">KES 20</div>
                    <div className="space-y-1 font-mono text-xs text-slate-300 pt-2 border-t border-slate-800">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Voucher Code:</span>
                        <span className="font-bold text-white tracking-wider">MKG-7821-X9</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Speed Cap:</span>
                        <span>10 Mbps burst</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Simultaneous:</span>
                        <span>1 Device</span>
                      </div>
                    </div>
                  </div>

                  {/* Voucher Card 2 */}
                  <div className="rounded-xl border border-dashed border-brand-500/50 bg-gradient-to-br from-brand-950/40 to-slate-950 p-5 space-y-3 relative overflow-hidden">
                    <div className="absolute top-2 right-2 text-[10px] font-mono uppercase bg-brand-500/20 text-brand-300 px-2 py-0.5 rounded">
                      BESTSELLER
                    </div>
                    <div className="text-lg font-black text-white">24 Hours 3GB</div>
                    <div className="text-2xl font-mono font-bold text-brand-400">KES 50</div>
                    <div className="space-y-1 font-mono text-xs text-slate-300 pt-2 border-t border-slate-800">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Voucher Code:</span>
                        <span className="font-bold text-white tracking-wider">MKG-4402-Q8</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Speed Cap:</span>
                        <span>15 Mbps burst</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Simultaneous:</span>
                        <span>2 Devices</span>
                      </div>
                    </div>
                  </div>

                  {/* Voucher Card 3 */}
                  <div className="rounded-xl border border-dashed border-emerald-500/50 bg-gradient-to-br from-emerald-950/40 to-slate-950 p-5 space-y-3 relative overflow-hidden">
                    <div className="absolute top-2 right-2 text-[10px] font-mono uppercase bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded">
                      RESIDENTIAL
                    </div>
                    <div className="text-lg font-black text-white">30 Days Uncapped</div>
                    <div className="text-2xl font-mono font-bold text-emerald-400">KES 1,500</div>
                    <div className="space-y-1 font-mono text-xs text-slate-300 pt-2 border-t border-slate-800">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Voucher Code:</span>
                        <span className="font-bold text-white tracking-wider">MKG-9931-V1</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Speed Cap:</span>
                        <span>20 Mbps unmetered</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Simultaneous:</span>
                        <span>4 Devices</span>
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-slate-400 text-center font-mono">
                  Batch generator creates PDF sheets with QR codes for instant smartphone camera scanning.
                </p>
              </div>
            )}

            {/* Tab 4: Dual-Stack IPAM */}
            {simTab === "ipam" && (
              <div className="p-6 md:p-8 space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-white font-bold">IPv4 CGNAT Pool: 100.64.0.0/20 (Nairobi Metro Core)</span>
                    <span className="text-cyan-400">3,480 / 4,096 Allocated (85%)</span>
                  </div>
                  <div className="h-3 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-cyan-500 via-sky-500 to-emerald-400 rounded-full w-[85%]" />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono text-slate-300 pt-2">
                    <div className="bg-slate-900 p-2.5 rounded border border-slate-800">
                      <span className="text-slate-500 block">Subnet Mask</span>
                      <span className="font-bold">255.255.240.0</span>
                    </div>
                    <div className="bg-slate-900 p-2.5 rounded border border-slate-800">
                      <span className="text-slate-500 block">DHCP Lease Time</span>
                      <span className="font-bold">24 Hours (Static Sync)</span>
                    </div>
                    <div className="bg-slate-900 p-2.5 rounded border border-slate-800">
                      <span className="text-slate-500 block">IPv6 Prefix (DHCPv6-PD)</span>
                      <span className="font-bold text-emerald-400">2a02:c207::/48</span>
                    </div>
                    <div className="bg-slate-900 p-2.5 rounded border border-slate-800">
                      <span className="text-slate-500 block">IP Conflict Detection</span>
                      <span className="font-bold text-emerald-400">0 Collisions</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION: LIVE OPTICAL FIBER WIRE & ETHERNET ANIMATION SHOWCASE */}
      {/* ========================================================================= */}
      <section id="cables" className="relative z-10 mx-auto max-w-6xl px-6 py-14 border-t border-slate-800 scroll-mt-24">
        <NetworkCablesAnimation />
      </section>

      {/* ========================================================================= */}
      {/* SECTION: INTERACTIVE ISP REVENUE & AUTOMATION CALCULATOR */}
      {/* ========================================================================= */}
      <section id="calculator" className="relative z-10 mx-auto max-w-6xl px-6 py-20 border-t border-slate-800 scroll-mt-24">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <Badge variant="info">Interactive ROI Engine</Badge>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
            Calculate your revenue &amp; operational savings
          </h2>
          <p className="mt-3 text-base text-slate-400">
            See the exact financial impact of automated Safaricom M-Pesa collections and instant MikroTik queue provisioning.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Controls */}
          <div className="lg:col-span-6 rounded-2xl bg-slate-950/80 border border-slate-800 p-8 space-y-6 shadow-xl">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="subscribers-slider" className="text-sm font-semibold text-slate-200">
                  Active ISP Subscribers
                </label>
                <span className="text-lg font-bold font-mono text-brand-400">
                  {subscribers.toLocaleString()} subscribers
                </span>
              </div>
              <input
                id="subscribers-slider"
                type="range"
                min={50}
                max={3000}
                step={25}
                value={subscribers}
                onChange={(e) => setSubscribers(Number(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-slate-500 font-mono mt-1">
                <span>50 WISP users</span>
                <span>1,500 users</span>
                <span>3,000+ users</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="arpu-slider" className="text-sm font-semibold text-slate-200">
                  Average Monthly Package Price (ARPU)
                </label>
                <span className="text-lg font-bold font-mono text-emerald-400">
                  KES {arpu.toLocaleString()} / mo
                </span>
              </div>
              <input
                id="arpu-slider"
                type="range"
                min={1000}
                max={5000}
                step={250}
                value={arpu}
                onChange={(e) => setArpu(Number(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-slate-500 font-mono mt-1">
                <span>KES 1,000 (Lite)</span>
                <span>KES 2,500 (Home Fiber)</span>
                <span>KES 5,000 (SME Dedicated)</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800/80 text-xs text-slate-300 space-y-2 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Manual Reconciliations Prevented:</span>
                <span className="font-bold text-white">{(subscribers * 1.4).toFixed(0)} Paybill checks/mo</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Speed Tier Changes Automated:</span>
                <span className="font-bold text-brand-400">100% Zero-Touch MikroTik API</span>
              </div>
            </div>
          </div>

          {/* Results Display */}
          <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-gradient-to-br from-brand-950/60 to-slate-950 border border-brand-500/30 p-6 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-400">
                Monthly Gross Billing
              </p>
              <p className="text-3xl font-black font-mono text-white">
                KES {monthlyRevenue.toLocaleString()}
              </p>
              <p className="text-xs text-slate-400">
                Annual: KES {(annualRevenue / 1000000).toFixed(1)}M gross processed
              </p>
            </div>

            <div className="rounded-2xl bg-gradient-to-br from-emerald-950/60 to-slate-950 border border-emerald-500/30 p-6 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Admin Hours Saved
              </p>
              <p className="text-3xl font-black font-mono text-emerald-400">
                ~{adminHoursSaved} hrs / mo
              </p>
              <p className="text-xs text-slate-400">
                Eliminates manual Paybill checking &amp; manual queue pasting
              </p>
            </div>

            <div className="rounded-2xl bg-gradient-to-br from-cyan-950/60 to-slate-950 border border-cyan-500/30 p-6 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                Recovered Revenue Leakage
              </p>
              <p className="text-3xl font-black font-mono text-white">
                KES {recoveredLeakage.toLocaleString()}
              </p>
              <p className="text-xs text-slate-400">
                8% average leakage saved via immediate expiry cutoffs
              </p>
            </div>

            <div className="rounded-2xl bg-gradient-to-br from-sky-950/60 to-slate-950 border border-sky-500/30 p-6 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-sky-400">
                Subscriber Retention
              </p>
              <p className="text-3xl font-black font-mono text-white">
                +34% Renewals
              </p>
              <p className="text-xs text-slate-400">
                Boosted by automated SMS reminders 48h before cutoff
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION: 3-STEP ONBOARDING HOW IT WORKS */}
      {/* ========================================================================= */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-14 border-t border-slate-800 scroll-mt-24">
        <HowItWorksTimeline />
      </section>

      {/* ========================================================================= */}
      {/* SECTION: NETWORK ARCHITECTURE & PROTOCOL COMPATIBILITY */}
      {/* ========================================================================= */}
      <section id="architecture" className="relative z-10 mx-auto max-w-6xl px-6 py-20 border-t border-slate-800 scroll-mt-24">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <Badge variant="info">Carrier Grade Architecture</Badge>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
            Engineered for high-throughput telecom topology
          </h2>
          <p className="mt-3 text-base text-slate-400">
            A resilient multi-layer pipeline linking edge subscriber CPEs directly to your core distribution routers and national fintech rails.
          </p>
        </div>

        {/* Visual Architecture Flow Diagram */}
        <div className="rounded-2xl bg-slate-950/90 border border-slate-800 p-8 shadow-2xl space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center relative">
            {/* Step 1 */}
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                <IconUsers size={24} />
              </div>
              <h3 className="font-bold text-white text-sm">1. Subscriber / CPE</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Fiber ONT or Wireless CPE requests PPPoE or Hotspot captive portal session.
              </p>
              <span className="inline-block text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                PPPoE / IPoE / Option 82
              </span>
            </div>

            {/* Step 2 */}
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400 border border-brand-500/20">
                <IconRouter size={24} />
              </div>
              <h3 className="font-bold text-white text-sm">2. MikroTik RouterOS</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Edge gateway captures auth request and forwards standard RADIUS packet.
              </p>
              <span className="inline-block text-[10px] font-mono bg-brand-950 border border-brand-800 text-brand-300 px-2 py-0.5 rounded">
                RouterOS v6 / v7 API
              </span>
            </div>

            {/* Step 3 */}
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <IconShield size={24} />
              </div>
              <h3 className="font-bold text-white text-sm">3. Mashupkgrid RADIUS</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                FreeRADIUS 3.x cluster validates subscriber balance, speed tier, and IP lease.
              </p>
              <span className="inline-block text-[10px] font-mono bg-cyan-950 border border-cyan-800 text-cyan-300 px-2 py-0.5 rounded">
                RFC 2865 / 2866 &amp; CoA 3799
              </span>
            </div>

            {/* Step 4 */}
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <IconMpesa size={24} />
              </div>
              <h3 className="font-bold text-white text-sm">4. M-Pesa &amp; Fintech Core</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Automated webhook reconciles Paybill payments and triggers instant un-throttling.
              </p>
              <span className="inline-block text-[10px] font-mono bg-emerald-950 border border-emerald-800 text-emerald-300 px-2 py-0.5 rounded">
                Daraja 2.0 &amp; Paystack
              </span>
            </div>
          </div>

          {/* Protocols Badges Bar */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-6 border-t border-slate-800/80 text-xs font-mono text-slate-400">
            <span className="font-sans font-semibold text-slate-300">Supported Telecom Standards:</span>
            <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800">RADIUS RFC 2865/2866</span>
            <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800">CoA / PoD RFC 3576</span>
            <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800">PPPoE &amp; IPoE</span>
            <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800">IPv4 CGNAT (RFC 6598)</span>
            <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800">DHCPv6 Prefix Delegation</span>
            <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800">TLS 1.3 Router API</span>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION: NEXT-GEN TELECOM INNOVATIONS HUB */}
      {/* ========================================================================= */}
      <section id="innovations" className="relative z-10 mx-auto max-w-6xl px-6 py-20 border-t border-slate-800 scroll-mt-24">
        <TelecomInnovationsHub />
      </section>

      {/* ========================================================================= */}
      {/* SECTION: INTERACTIVE MIKROTIK SCRIPT GENERATOR */}
      {/* ========================================================================= */}
      <section id="scripts" className="relative z-10 mx-auto max-w-6xl px-6 py-20 border-t border-slate-800 scroll-mt-24">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <Badge variant="info">Ready-to-Paste Provisioning</Badge>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
            Instant MikroTik RouterOS Script Generator
          </h2>
          <p className="mt-3 text-base text-slate-400">
            Copy and paste production-ready commands into Winbox terminal or SSH console to provision your router in 30 seconds.
          </p>
        </div>

        <div className="rounded-2xl bg-slate-950/90 border border-slate-800 shadow-2xl overflow-hidden">
          <div className="flex flex-wrap items-center justify-between border-b border-slate-800 bg-slate-900/90 px-6 py-4 gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setScriptTab("pppoe")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  scriptTab === "pppoe" ? "bg-brand-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                PPPoE Server Setup
              </button>
              <button
                onClick={() => setScriptTab("hotspot")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  scriptTab === "hotspot" ? "bg-brand-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                Hotspot Gateway Setup
              </button>
              <button
                onClick={() => setScriptTab("radius")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  scriptTab === "radius" ? "bg-brand-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                Core RADIUS &amp; CoA Only
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-slate-400">Server IP:</span>
                <input
                  type="text"
                  value={scriptHost}
                  onChange={(e) => setScriptHost(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white text-xs w-32 focus:outline-none"
                />
              </div>
              <button
                onClick={handleCopyScript}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-all"
              >
                {copied ? <IconCheck size={14} className="text-emerald-400" /> : <IconCopy size={14} />}
                <span>{copied ? "Copied to Clipboard!" : "Copy Script"}</span>
              </button>
            </div>
          </div>

          <div className="p-6 bg-slate-950 overflow-x-auto">
            <pre className="font-mono text-xs text-emerald-400 leading-relaxed select-all">
              {getMikrotikScript()}
            </pre>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION: PLATFORM FEATURES GRID */}
      {/* ========================================================================= */}
      <section id="features" className="relative z-10 mx-auto max-w-7xl px-6 py-24 border-t border-slate-800 scroll-mt-24">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <Badge variant="info">Full Telecom Capabilities</Badge>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
            Everything your network engineers and billing team need
          </h2>
          <p className="mt-4 text-base text-slate-400">
            Engineered from the ground up for African ISP realities: fluctuating power, M-Pesa payments, and complex MikroTik topologies.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Feature 1 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-7 hover:border-brand-500/50 transition-all hover:shadow-glow group">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-5 group-hover:scale-110 transition-transform">
              <IconMpesa size={24} />
            </div>
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
              Fintech &amp; Automated Billing
            </span>
            <h3 className="text-xl font-bold text-white mt-1">
              M-Pesa STK &amp; C2B Paybill
            </h3>
            <p className="mt-2.5 text-sm text-slate-400 leading-relaxed">
              Instant Safaricom C2B Paybill reconciliation with zero manual entries. Automated pro-rated invoicing, customer wallet balances, and Paystack card fallback.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-7 hover:border-brand-500/50 transition-all hover:shadow-glow group">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400 border border-brand-500/20 mb-5 group-hover:scale-110 transition-transform">
              <IconRouter size={24} />
            </div>
            <span className="text-[11px] font-bold text-brand-400 uppercase tracking-wider">
              MikroTik Hardware Control
            </span>
            <h3 className="text-xl font-bold text-white mt-1">
              Native RouterOS API v6/v7
            </h3>
            <p className="mt-2.5 text-sm text-slate-400 leading-relaxed">
              Genuine RouterOS REST &amp; API-TLS integration. Sub-second ping telemetry, active queue speed throttling, live CPU/RAM monitoring, and one-click script sync.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-7 hover:border-brand-500/50 transition-all hover:shadow-glow group">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 mb-5 group-hover:scale-110 transition-transform">
              <IconShield size={24} />
            </div>
            <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">
              Carrier Core Security
            </span>
            <h3 className="text-xl font-bold text-white mt-1">
              FreeRADIUS 3.x with CoA
            </h3>
            <p className="mt-2.5 text-sm text-slate-400 leading-relaxed">
              High-concurrency FreeRADIUS engine. Handles RFC 3576 Dynamic Disconnect (CoA) to terminate or un-throttle subscriber sessions within 1.5 seconds of payment.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-7 hover:border-brand-500/50 transition-all hover:shadow-glow group">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-5 group-hover:scale-110 transition-transform">
              <IconTicket size={24} />
            </div>
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
              Public Wi-Fi &amp; Malls
            </span>
            <h3 className="text-xl font-bold text-white mt-1">
              Bulk Hotspot Voucher Studio
            </h3>
            <p className="mt-2.5 text-sm text-slate-400 leading-relaxed">
              Generate 5,000+ time-limited and data-metered hotspot vouchers in seconds. Export print-ready sheets with QR codes for instantaneous smartphone logins.
            </p>
          </div>

          {/* Feature 5 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-7 hover:border-brand-500/50 transition-all hover:shadow-glow group">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 mb-5 group-hover:scale-110 transition-transform">
              <IconNetworkPool size={24} />
            </div>
            <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider">
              Network Infrastructure
            </span>
            <h3 className="text-xl font-bold text-white mt-1">
              Dual-Stack IPAM &amp; Subnets
            </h3>
            <p className="mt-2.5 text-sm text-slate-400 leading-relaxed">
              IPv4 CGNAT pool allocation with automated per-host lease tracking, IPv6 prefix delegation (DHCPv6-PD), and real-time IP conflict prevention.
            </p>
          </div>

          {/* Feature 6 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-7 hover:border-brand-500/50 transition-all hover:shadow-glow group">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 mb-5 group-hover:scale-110 transition-transform">
              <IconTenants size={24} />
            </div>
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
              White-Labeling &amp; Multi-Branch
            </span>
            <h3 className="text-xl font-bold text-white mt-1">
              Multi-Tenant Architecture
            </h3>
            <p className="mt-2.5 text-sm text-slate-400 leading-relaxed">
              Isolate multiple branches or run a white-label ISP platform with custom branding, logos, color themes, and separate operator roles (Admin, Field Tech, Support).
            </p>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION: COMPARISON MATRIX (MASHUPKGRID VS ALTERNATIVES) */}
      {/* ========================================================================= */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-14 border-t border-slate-800 scroll-mt-24">
        <ComparisonMatrix />
      </section>

      {/* ========================================================================= */}
      {/* SECTION: PRICING TIERS */}
      {/* ========================================================================= */}
      <section id="pricing" className="relative z-10 mx-auto max-w-6xl px-6 py-20 border-t border-slate-800 scroll-mt-24">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <Badge variant="info">Predictable Telecom Pricing</Badge>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
            {landingContent.pricing.title}
          </h2>
          <p className="mt-3 text-base text-slate-400">
            {landingContent.pricing.subtitle}
          </p>

          {/* Billing Cycle Toggle */}
          <div className="mt-8 inline-flex items-center gap-3 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
            <button
              onClick={() => setPricingCycle("monthly")}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                pricingCycle === "monthly" ? "bg-brand-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              Monthly Billing
            </button>
            <button
              onClick={() => setPricingCycle("annual")}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                pricingCycle === "annual" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              <span>Annual Billing</span>
              <span className="bg-emerald-400/20 text-emerald-300 text-[10px] px-1.5 py-0.5 rounded font-mono">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Plan 1 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-8 space-y-6 flex flex-col justify-between">
            <div>
              <h3 className="text-xl font-bold text-white">Starter WISP</h3>
              <p className="text-xs text-slate-400 mt-1">Ideal for emerging wireless &amp; hotspot operators.</p>
              <div className="mt-6 flex items-baseline gap-1 font-mono">
                <span className="text-4xl font-black text-white">
                  {pricingCycle === "monthly"
                    ? `KES ${landingContent.pricing.starterMonthly.toLocaleString()}`
                    : `KES ${landingContent.pricing.starterAnnual.toLocaleString()}`}
                </span>
                <span className="text-xs text-slate-400">/ month</span>
              </div>

              <ul className="mt-6 space-y-3 text-xs text-slate-300">
                <li className="flex items-center gap-2">
                  <IconCheck size={14} className="text-emerald-400 shrink-0" />
                  <span>Up to <strong>250 Active Subscribers</strong></span>
                </li>
                <li className="flex items-center gap-2">
                  <IconCheck size={14} className="text-emerald-400 shrink-0" />
                  <span>Connect up to <strong>2 MikroTik Routers</strong></span>
                </li>
                <li className="flex items-center gap-2">
                  <IconCheck size={14} className="text-emerald-400 shrink-0" />
                  <span>Safaricom M-Pesa STK &amp; C2B Integration</span>
                </li>
                <li className="flex items-center gap-2">
                  <IconCheck size={14} className="text-emerald-400 shrink-0" />
                  <span>Hotspot Voucher Batch Generator</span>
                </li>
                <li className="flex items-center gap-2">
                  <IconCheck size={14} className="text-emerald-400 shrink-0" />
                  <span>Standard Email &amp; Community Support</span>
                </li>
              </ul>
            </div>

            <Link href="/register">
              <Button variant="secondary" className="w-full py-3 text-sm font-semibold border-slate-700 bg-slate-800 hover:bg-slate-700 text-white">
                Launch Starter WISP
              </Button>
            </Link>
          </div>

          {/* Plan 2: Most Popular */}
          <div className="rounded-2xl border-2 border-cyan-500 bg-slate-950 p-8 space-y-6 flex flex-col justify-between relative shadow-glow">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-black text-[11px] uppercase tracking-wider px-3.5 py-1 rounded-full shadow-md">
              Most Popular for ISPs
            </div>

            <div>
              <h3 className="text-xl font-bold text-white">Growth Telecom</h3>
              <p className="text-xs text-slate-400 mt-1">For expanding fiber ISPs and multi-tower WISPs.</p>
              <div className="mt-6 flex items-baseline gap-1 font-mono">
                <span className="text-4xl font-black text-brand-400">
                  {pricingCycle === "monthly"
                    ? `KES ${landingContent.pricing.growthMonthly.toLocaleString()}`
                    : `KES ${landingContent.pricing.growthAnnual.toLocaleString()}`}
                </span>
                <span className="text-xs text-slate-400">/ month</span>
              </div>

              <ul className="mt-6 space-y-3 text-xs text-slate-300">
                <li className="flex items-center gap-2">
                  <IconCheck size={14} className="text-emerald-400 shrink-0" />
                  <span>Up to <strong>1,500 Active Subscribers</strong></span>
                </li>
                <li className="flex items-center gap-2">
                  <IconCheck size={14} className="text-emerald-400 shrink-0" />
                  <span><strong>Unlimited MikroTik Routers &amp; OLTs</strong></span>
                </li>
                <li className="flex items-center gap-2">
                  <IconCheck size={14} className="text-emerald-400 shrink-0" />
                  <span>FreeRADIUS Cluster with Dynamic CoA</span>
                </li>
                <li className="flex items-center gap-2">
                  <IconCheck size={14} className="text-emerald-400 shrink-0" />
                  <span>Africa&apos;s Talking SMS Gateway Automated Reminders</span>
                </li>
                <li className="flex items-center gap-2">
                  <IconCheck size={14} className="text-emerald-400 shrink-0" />
                  <span>Dual-Stack IPv4 CGNAT &amp; IPv6 Subnet Manager</span>
                </li>
                <li className="flex items-center gap-2">
                  <IconCheck size={14} className="text-emerald-400 shrink-0" />
                  <span>Priority WhatsApp &amp; Phone Engineer Support</span>
                </li>
              </ul>
            </div>

            <Link href="/register">
              <Button className="w-full py-3 text-sm font-bold shadow-glow">
                Deploy Growth Platform
              </Button>
            </Link>
          </div>

          {/* Plan 3 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-8 space-y-6 flex flex-col justify-between">
            <div>
              <h3 className="text-xl font-bold text-white">Carrier &amp; White-Label</h3>
              <p className="text-xs text-slate-400 mt-1">Multi-branch telecom carriers &amp; master franchises.</p>
              <div className="mt-6 flex items-baseline gap-1 font-mono">
                <span className="text-4xl font-black text-white">
                  {pricingCycle === "monthly"
                    ? `KES ${landingContent.pricing.carrierMonthly.toLocaleString()}`
                    : `KES ${landingContent.pricing.carrierAnnual.toLocaleString()}`}
                </span>
                <span className="text-xs text-slate-400">/ month</span>
              </div>

              <ul className="mt-6 space-y-3 text-xs text-slate-300">
                <li className="flex items-center gap-2">
                  <IconCheck size={14} className="text-emerald-400 shrink-0" />
                  <span><strong>Unlimited Subscribers</strong></span>
                </li>
                <li className="flex items-center gap-2">
                  <IconCheck size={14} className="text-emerald-400 shrink-0" />
                  <span>Full Multi-Tenant White-Labeling &amp; Custom Domain</span>
                </li>
                <li className="flex items-center gap-2">
                  <IconCheck size={14} className="text-emerald-400 shrink-0" />
                  <span>Dedicated FreeRADIUS Server Instance</span>
                </li>
                <li className="flex items-center gap-2">
                  <IconCheck size={14} className="text-emerald-400 shrink-0" />
                  <span>Custom Paybill / Till Number Routing per Branch</span>
                </li>
                <li className="flex items-center gap-2">
                  <IconCheck size={14} className="text-emerald-400 shrink-0" />
                  <span>99.99% Financial &amp; RADIUS SLA Guarantee</span>
                </li>
                <li className="flex items-center gap-2">
                  <IconCheck size={14} className="text-emerald-400 shrink-0" />
                  <span>Dedicated Senior Telecom Solutions Architect</span>
                </li>
              </ul>
            </div>

            <Link href="/register">
              <Button variant="secondary" className="w-full py-3 text-sm font-semibold border-slate-700 bg-slate-800 hover:bg-slate-700 text-white">
                Contact Enterprise Sales
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION: CUSTOMER STORIES & EAST AFRICA OPERATOR TESTIMONIALS */}
      {/* ========================================================================= */}
      <section id="testimonials" className="relative z-10 mx-auto max-w-6xl px-6 py-20 border-t border-slate-800 scroll-mt-24">
        <div className="text-center max-w-3xl mx-auto mb-14 space-y-3">
          <Badge variant="info">{testimonialsConfig.badge}</Badge>
          <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
            {testimonialsConfig.title}
          </h2>
          <p className="text-base text-slate-400">
            {testimonialsConfig.subtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonialsConfig.items.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4 flex flex-col justify-between"
            >
              <p className="text-sm text-slate-300 leading-relaxed italic">
                &ldquo;{item.quote}&rdquo;
              </p>
              <div className="pt-3 border-t border-slate-800 flex items-center gap-3">
                <div
                  className={`h-10 w-10 shrink-0 rounded-full ${item.color} font-bold text-white flex items-center justify-center text-sm`}
                >
                  {item.initials}
                </div>
                <div>
                  <div className="text-sm font-bold text-white flex items-center gap-1.5">
                    <span>{item.name}</span>
                    {item.verified && (
                      <span className="text-xs text-cyan-400 font-mono" title="Verified Network Operator">
                        ✓
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 leading-snug">
                    {item.role}, {item.company}{" "}
                    {item.subscribers && (
                      <span className="text-slate-500 font-mono">({item.subscribers})</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION: INTERACTIVE FAQ ACCORDION */}
      {/* ========================================================================= */}
      <section id="faq" className="relative z-10 mx-auto max-w-4xl px-6 py-20 border-t border-slate-800 scroll-mt-24">
        <div className="text-center mb-14">
          <Badge variant="info">Frequently Asked Questions</Badge>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
            Everything you need to know about setup
          </h2>
          <p className="mt-3 text-base text-slate-400">
            Got questions? We have answers. If you need custom deployment assistance, our team is always on standby.
          </p>
        </div>

        <div className="space-y-4">
          {(landingContent.faqs && landingContent.faqs.length > 0 ? landingContent.faqs : FAQS).map((faq, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-slate-800 bg-slate-950/80 overflow-hidden transition-colors"
            >
              <button
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                className="w-full px-6 py-4 text-left flex items-center justify-between text-base font-bold text-white hover:text-brand-400 transition-colors"
              >
                <span>{faq.q}</span>
                <span className={`transform transition-transform ${openFaq === idx ? "rotate-90 text-brand-400" : "text-slate-500"}`}>
                  <IconChevronRight size={18} />
                </span>
              </button>
              {openFaq === idx && (
                <div className="px-6 pb-5 pt-1 text-sm text-slate-300 leading-relaxed border-t border-slate-800/60 font-normal">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* CLOSING HIGH-CONVERSION CTA SECTION */}
      {/* ========================================================================= */}
      <section className="relative z-10 border-t border-slate-800 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 py-24 text-center">
        <div className="mx-auto max-w-4xl px-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs font-semibold mb-6">
            <IconSparkles size={14} />
            <span>Zero Long-Term Contracts · Instant MikroTik API Connection</span>
          </div>

          <h2 className="text-3xl font-black tracking-tight text-white sm:text-5xl">
            Ready to automate your ISP operations?
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base text-slate-300 leading-relaxed">
            Create your account now, configure your first router with our 30-second script, and start collecting automated M-Pesa payments with zero revenue leakage.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <Link href="/register">
              <Button className="px-8 py-3.5 text-base font-bold shadow-glow gap-2">
                <span>Create Free ISP Account</span>
                <IconArrowRight size={16} />
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="secondary" className="px-7 py-3.5 text-base font-semibold border-slate-700 bg-slate-800 text-white hover:bg-slate-700">
                Sign in to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* FOOTER */}
      {/* ========================================================================= */}
      <footer className="relative z-10 border-t border-slate-800/80 bg-slate-950 py-12 text-slate-400 text-sm">
        <div className="mx-auto max-w-7xl px-6 grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg overflow-hidden ring-1 ring-cyan-500/40 bg-slate-900">
                <img
                  src="/logo.jpg"
                  alt="Mashupkgrid ISP Logo"
                  className="h-full w-full object-cover"
                />
              </div>
              <span className="text-base font-extrabold text-white">MASHUPKGRID ISP</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              {landingContent.footer.description}
            </p>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-200 mb-3">Product Core</p>
            <ul className="space-y-2 text-xs">
              <li><a href="#features" className="hover:text-white transition-colors">MikroTik RouterOS API</a></li>
              <li><a href="#demo" className="hover:text-white transition-colors">FreeRADIUS 3.x Engine</a></li>
              <li><a href="#demo" className="hover:text-white transition-colors">Safaricom Daraja 2.0 STK</a></li>
              <li><a href="#demo" className="hover:text-white transition-colors">Hotspot Voucher Studio</a></li>
              <li><a href="#architecture" className="hover:text-white transition-colors">Dual-Stack IPAM &amp; Subnets</a></li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-200 mb-3">Tools &amp; Resources</p>
            <ul className="space-y-2 text-xs">
              <li><a href="#scripts" className="hover:text-white transition-colors">MikroTik Provisioning Scripts</a></li>
              <li><a href="#calculator" className="hover:text-white transition-colors">ISP Revenue ROI Calculator</a></li>
              <li><a href="#pricing" className="hover:text-white transition-colors">Carrier &amp; WISP Pricing</a></li>
              <li><a href="#faq" className="hover:text-white transition-colors">Technical Architecture FAQ</a></li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-200 mb-3">Operators &amp; Access</p>
            <ul className="space-y-2 text-xs">
              <li><Link href="/login" className="hover:text-white transition-colors">Operator Sign In</Link></li>
              <li><Link href="/register" className="hover:text-white transition-colors">Create Free Account</Link></li>
              <li><Link href="/forgot-password" className="hover:text-white transition-colors">Reset Password</Link></li>
              <li><span className="text-emerald-400 font-mono">Status: All Systems 100% Operational</span></li>
            </ul>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-6 pt-6 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div>
            &copy; {landingContent.footer.copyrightYear || new Date().getFullYear()} MASHUPKGRID Telecom Technologies Ltd. All rights reserved. Built for Kenyan &amp; East African ISPs.
          </div>
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
            <Link href="/refund-policy" className="hover:text-white transition-colors">Refund Policy</Link>
            <Link href="/referral-policy" className="hover:text-white transition-colors">Referral Policy</Link>
            <Link href="/age-policy" className="hover:text-white transition-colors">Age Policy</Link>
            <Link href="/donate" className="text-amber-400 hover:text-amber-300 font-bold transition-colors">☕ Buy Me a Coffee</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
