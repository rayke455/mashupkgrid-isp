"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useCart, FALLBACK_PRODUCTS, HardwareProduct } from "@/lib/hardware-store";
import { CartDrawer } from "@/components/store/cart-drawer";
import { QuickRenewModal } from "@/components/portal/quick-renew-modal";
import { HardwareProductCard } from "@/components/store/hardware-product-card";
import {
  IconCheck,
  IconArrowRight,
  IconRouter,
  IconShield,
  IconPulse,
  IconPackage,
  IconUser,
  IconLock,
  IconLifeBuoy,
  IconSpeed,
  IconMpesa,
  IconMenu,
  IconClose,
  IconWhatsApp,
} from "@/components/icons";

interface PlanItem {
  id: string;
  name: string;
  speed: string;
  price: number; // KES per month
  popular?: boolean;
  type: "home" | "business" | "ultra";
  summary: string;
  features: string[];
}

const FIBER_PLANS: PlanItem[] = [
  // Home Plans
  {
    id: "home_bronze",
    name: "Home Bronze",
    speed: "10 Mbps",
    price: 1500,
    type: "home",
    summary: "Ideal for basic browsing, social media, WhatsApp, Zoom calls, and standard streaming.",
    features: [
      "10 Mbps Truly Unlimited High-Speed",
      "Connect 1 to 3 Devices Smoothly",
      "Zero Data Caps & Zero FUP Throttling",
      "Standard WiFi Router Included",
      "99.9% Uptime SLA Commitment",
      "Automated M-Pesa Instant Renewal",
    ],
  },
  {
    id: "home_silver",
    name: "Home Silver",
    speed: "20 Mbps",
    price: 2500,
    popular: true,
    type: "home",
    summary: "Our most popular home plan. Seamless 4K streaming, online gaming, and family use.",
    features: [
      "20 Mbps Symmetrical Throughput",
      "Connect 4 to 8 Simultaneous Devices",
      "FREE Professional Installation & Cabling",
      "Dual-Band Gigabit Optical Router Included",
      "Smooth 4K Ultra-HD Netflix & YouTube",
      "24/7 Dedicated Technical Support",
    ],
  },
  {
    id: "home_gold",
    name: "Home Gold",
    speed: "50 Mbps",
    price: 4000,
    type: "home",
    summary: "For power creators, heavy streamers, smart homes, and large residential estates.",
    features: [
      "50 Mbps Ultra-Fast Fiber Broadband",
      "Connect 10+ Devices with Zero Congestion",
      "FREE Next-Gen WiFi 6 Router Included",
      "Zero-Lag Multi-Player Gaming",
      "Direct Peering to Local Exchange (KIXP), Google & Netflix",
      "Priority Installation Dispatch",
    ],
  },
  {
    id: "home_platinum",
    name: "Home Platinum",
    speed: "100 Mbps",
    price: 6500,
    type: "home",
    summary: "Extreme residential gigabit performance for luxury homes and work-from-home villas.",
    features: [
      "100 Mbps Blazing High-Performance Fiber",
      "Connect 20+ Devices with Zero Latency Spikes",
      "FREE Mesh WiFi 6 Coverage Kit Included",
      "Ultra-Low Latency to Global Cloud CDNs",
      "VIP Dedicated Support Hotline",
      "Free Static IP Address on Request",
    ],
  },

  // Dedicated Business 1:1 Plans
  {
    id: "biz_pro",
    name: "Business Pro",
    speed: "50 Mbps (1:1)",
    price: 9500,
    type: "business",
    summary: "Guaranteed 1:1 dedicated bandwidth for SMEs, branch offices, and clinics.",
    features: [
      "50 Mbps Dedicated Symmetrical Bandwidth (1:1)",
      "1 Usable Public Static IPv4 Address",
      "99.95% Enterprise SLA Guarantee",
      "Enterprise Cloud Gateway Included",
      "Direct Low Latency Peering",
      "4-Hour MTTR Priority Field Dispatch",
    ],
  },
  {
    id: "biz_sme",
    name: "Business SME",
    speed: "100 Mbps (1:1)",
    price: 15000,
    popular: true,
    type: "business",
    summary: "Mission-critical connectivity for corporate headquarters, schools, and tech hubs.",
    features: [
      "100 Mbps Dedicated 1:1 Symmetrical",
      "2 Usable Public Static IPv4 Addresses",
      "Direct Peering to Safaricom, Liquid & KIXP",
      "Dual-Path Redundant Fiber Uplink",
      "24/7 Managed NOC Monitoring",
      "2-Hour Rapid Field Response",
    ],
  },
  {
    id: "biz_enterprise",
    name: "Business Enterprise",
    speed: "250 Mbps (1:1)",
    price: 28000,
    type: "business",
    summary: "Carrier-grade optical connectivity for financial fintechs, universities, and data centers.",
    features: [
      "250 Mbps Pure Fiber Dedicated Bandwidth",
      "4 Usable Public Static IPv4 Addresses",
      "10G SFP+ Optical Hand-off Directly in Rack",
      "Custom BGP Autonomous System (AS) Peering",
      "Named Dedicated Senior Network Engineer",
      "99.99% Financial-Grade SLA",
    ],
  },

  // Ultra Fiber 1Gbps
  {
    id: "ultra_gigabit",
    name: "Ultra Gigabit 1Gbps",
    speed: "1,000 Mbps (1 Gbps)",
    price: 45000,
    popular: true,
    type: "ultra",
    summary: "Maximum performance for power users, campuses, regional POPs, and data centers.",
    features: [
      "Up to 1 Gbps Download & 500 Mbps Upload",
      "Top-Tier Enterprise Equipment Included",
      "Multiple Usable Static Public IPs",
      "Redundant Dual-Path Backup Uplink",
      "Custom Network Configuration & BGP Peering",
      "Dedicated 24/7 Account & NOC Manager",
    ],
  },
];

const FAQS = [
  {
    q: "How fast can I get connected after ordering?",
    a: "We offer 24-48 hour installation across all covered areas in Kenya. Once you confirm your location and complete your request, a certified optical fiber team is dispatched with all equipment.",
  },
  {
    q: "Are the fiber internet packages truly unlimited?",
    a: "Yes! All our home and business fiber plans come with 100% truly unlimited data. We do not enforce Fair Usage Policies (FUP), data caps, or speed reductions at any time of day or night.",
  },
  {
    q: "Do you provide hardware and networking equipment?",
    a: "Yes! We operate a complete networking hardware shop stocked with genuine MikroTik routers, Ubiquiti access points, switches, fiber cables, Mini DC UPS power backups, and CCTV cameras delivered nationwide across 47 counties.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We support automated instant M-Pesa STK push, M-Pesa Paybill, and credit/debit cards. When your invoice is due, an M-Pesa prompt appears directly on your phone, and your service renews automatically within seconds.",
  },
  {
    q: "Do you offer professional installation services?",
    a: "Yes, our certified field engineers provide professional structured cabling, PPPoE configuration, hotspot setup, and optical fiber fusion splicing with neat rack cable management.",
  },
  {
    q: "What areas do you cover?",
    a: "We cover Nairobi (including Utawala, Dandora, Kilimani, Westlands, Eastlands, South B/C) and expanding networks in Kiambu, Ruiru, Thika, Machakos, Nakuru, Eldoret, and Mombasa.",
  },
];

export function LandingClient({ initialContent }: { initialContent?: unknown }) {
  const { itemCount, addItem } = useCart();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isRenewOpen, setIsRenewOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [planTab, setPlanTab] = useState<"home" | "business" | "ultra">("home");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeFaq, setActiveFaq] = useState<number | null>(0);

  // Coverage search state
  const [coverageSearch, setCoverageSearch] = useState("");

  const filteredPlans = useMemo(
    () => FIBER_PLANS.filter((p) => p.type === planTab),
    [planTab]
  );

  const filteredProducts = useMemo(() => {
    let list = FALLBACK_PRODUCTS;
    if (activeCategory !== "all") {
      list = list.filter((p) => p.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.shortDescription.toLowerCase().includes(q) ||
          p.specs.some((s) => s.toLowerCase().includes(q))
      );
    }
    return list;
  }, [activeCategory, searchQuery]);

  const handleCoverageCheck = (e: React.FormEvent) => {
    e.preventDefault();
    const query = coverageSearch.trim();
    const message = query
      ? `Hello MashupHost, I want to check fiber internet coverage for my area: ${encodeURIComponent(query)}`
      : "Hello MashupHost, I would like to check fiber internet coverage for my location.";
    window.open(`https://wa.me/254703605266?text=${message}`, "_blank");
  };

  const handleOrderPlan = (plan: PlanItem) => {
    addItem(
      {
        id: `plan_${plan.id}`,
        name: `${plan.name} (${plan.speed}) - Monthly Fiber Subscription`,
        slug: plan.id,
        brand: "MashupHost Fiber",
        category: "fiber",
        price: plan.price,
        stock: 999,
        inStock: true,
        rating: 5.0,
        reviewCount: 92,
        shortDescription: plan.summary,
        description: plan.summary,
        imageUrl: "/fiber-home.jpg",
        specs: plan.features,
        warranty: "99.9% SLA Guarantee",
        featured: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      1
    );
    setIsCartOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#060A12] text-slate-100 font-sans selection:bg-amber-400 selection:text-slate-950 overflow-x-hidden">
      {/* 1. TOP ANNOUNCEMENT BAR */}
      <div className="bg-gradient-to-r from-amber-950/60 via-slate-900 to-amber-950/60 border-b border-amber-500/20 py-2 px-4 text-center text-xs font-medium text-slate-300">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[11px] font-mono text-emerald-400 font-bold">
              High-Speed Optical Fiber &amp; Genuine Hardware Across Kenya
            </span>
          </div>

          <div className="hidden md:flex items-center gap-2 text-slate-300 text-xs">
            <span className="text-amber-400 font-bold">Special Offer:</span>
            <span>Free Installation &amp; Dual-Band Router on select packages</span>
          </div>

          <a
            href="https://wa.me/254703605266?text=Hello%20MashupHost%2C%20I%20want%20to%20order%20internet%20packages%20or%20hardware"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400 hover:text-amber-300 font-bold text-xs flex items-center gap-1.5 ml-auto sm:ml-0"
          >
            <IconWhatsApp size={13} className="text-[#25D366]" />
            <span>WhatsApp 24/7: +254 703 605 266</span>
            <span>&rarr;</span>
          </a>
        </div>
      </div>

      {/* 2. STICKY MODERN HEADER */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#060A12]/95 border-b border-slate-800/80 transition-all shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-[4.5rem] flex items-center justify-between gap-4">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative h-10 w-10 rounded-xl overflow-hidden shadow-lg shadow-amber-500/10 border border-amber-500/40 group-hover:scale-105 transition-transform">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.jpg" alt="MashupHost Logo" className="h-full w-full object-cover" />
            </div>
            <div>
              <span className="text-xl font-black tracking-tight text-white group-hover:text-amber-400 transition-colors">
                MASHUP<span className="text-amber-400">HOST</span>
              </span>
              <span className="hidden sm:block text-[10px] font-mono tracking-widest text-slate-400 uppercase font-semibold">
                High-Speed Telecom &amp; Hardware
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden xl:flex items-center gap-6 text-[11px] font-bold text-slate-300 tracking-wide uppercase">
            <a href="#packages" className="hover:text-amber-400 transition-colors">Internet Packages</a>
            <a href="#hardware" className="hover:text-amber-400 transition-colors flex items-center gap-1.5">
              <span>Hardware Store</span>
              <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[9px] font-mono font-bold">35+</span>
            </a>
            <a href="#solutions" className="hover:text-amber-400 transition-colors">Solutions</a>
            <a href="#coverage" className="hover:text-amber-400 transition-colors">Coverage</a>
            <a href="#faq" className="hover:text-amber-400 transition-colors">FAQ</a>
            <Link href="/track" className="hover:text-cyan-300 transition-colors text-amber-400 flex items-center gap-1">
              <span>📍</span>
              <span>Track Order</span>
            </Link>
          </nav>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Quick Renew / Lipa Internet Button */}
            <button
              type="button"
              onClick={() => setIsRenewOpen(true)}
              className="px-2.5 sm:px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-emerald-500/10 hover:from-emerald-500/30 hover:to-teal-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
              title="Quick Renew Monthly Internet via M-Pesa"
            >
              <IconMpesa size={15} />
              <span className="hidden sm:inline font-bold">Lipa Internet</span>
              <span className="sm:hidden font-bold">Renew</span>
            </button>

            {/* Cart Trigger */}
            <button
              onClick={() => setIsCartOpen(true)}
              aria-label="View shopping cart"
              className="relative p-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-amber-400 text-slate-200 hover:text-white transition-all active:scale-95 shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              title="View Cart"
            >
              <IconPackage size={17} />
              {itemCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black text-[10px] flex items-center justify-center shadow-lg">
                  {itemCount}
                </span>
              )}
            </button>

            {/* Client Portal Button */}
            <Link
              href="/app"
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-amber-400/50 text-xs font-bold text-slate-200 hover:text-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              <IconUser size={15} />
              <span>Portal</span>
            </Link>

            {/* WhatsApp Quick Action */}
            <a
              href="https://wa.me/254703605266?text=Hello%20MashupHost%2C%20I%20want%20to%20get%20connected%20to%20Fiber"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden lg:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 text-emerald-300 text-xs font-bold transition-all"
            >
              <IconWhatsApp size={15} className="text-[#25D366]" />
              <span>Chat on WhatsApp</span>
            </a>

            {/* Mobile Hamburger Toggle */}
            <button
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              aria-label="Toggle navigation menu"
              className="xl:hidden p-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-amber-400 text-slate-200 hover:text-white transition-all"
            >
              {isMobileMenuOpen ? <IconClose size={18} /> : <IconMenu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {isMobileMenuOpen && (
          <div className="xl:hidden border-t border-slate-800 bg-[#060A12]/98 backdrop-blur-2xl px-5 py-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-xs font-mono text-emerald-400 font-bold flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                MashupHost Kenya
              </span>
              <span className="text-[11px] text-slate-400 font-mono">Nairobi &bull; Nationwide</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-bold">
              <a
                href="#packages"
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-amber-400 text-white flex items-center gap-2"
              >
                <span>📦</span>
                <span>Packages</span>
              </a>
              <a
                href="#hardware"
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-amber-400 text-cyan-400 flex items-center gap-2"
              >
                <span>🛒</span>
                <span>Hardware (35+)</span>
              </a>
              <a
                href="#solutions"
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-amber-400 text-white flex items-center gap-2"
              >
                <span>⚡</span>
                <span>Solutions</span>
              </a>
              <a
                href="#coverage"
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-amber-400 text-emerald-400 flex items-center gap-2"
              >
                <span>🗺️</span>
                <span>Coverage</span>
              </a>
              <a
                href="#faq"
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-amber-400 text-white flex items-center gap-2"
              >
                <span>❓</span>
                <span>FAQ</span>
              </a>
              <Link
                href="/track"
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-amber-400 text-cyan-300 flex items-center gap-2"
              >
                <span>📍</span>
                <span>Track Order</span>
              </Link>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              {/* Lipa Internet Quick Renew Mobile Trigger */}
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsRenewOpen(true);
                }}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/40 hover:border-emerald-400 text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md"
              >
                <IconMpesa size={16} />
                <span>Lipa Internet &bull; Quick Renew (10s)</span>
              </button>

              <a
                href="https://wa.me/254703605266?text=Hello%20MashupHost%2C%20I%20want%20to%20get%20connected%20to%20Fiber"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3.5 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-black text-xs uppercase tracking-wide text-center flex items-center justify-center gap-2 shadow-lg"
              >
                <IconWhatsApp size={18} className="text-white" />
                <span>Chat on WhatsApp (+254 703 605 266)</span>
              </a>
              <div className="grid grid-cols-2 gap-2">
                <Link
                  href="/app"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-center text-xs font-bold text-white flex items-center justify-center gap-1.5"
                >
                  <IconUser size={14} />
                  <span>Customer Portal</span>
                </Link>
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setIsCartOpen(true);
                  }}
                  className="py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-center text-xs font-bold text-amber-400 flex items-center justify-center gap-1.5"
                >
                  <IconPackage size={14} />
                  <span>Cart ({itemCount})</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* 3. HERO SECTION */}
      <section id="hero" className="relative pt-12 pb-16 md:pt-20 md:pb-24 overflow-hidden">
        {/* Ambient Gradient Glows */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-amber-500/10 blur-[130px] pointer-events-none" />
        <div className="absolute top-40 right-10 w-80 h-80 bg-cyan-500/10 blur-[120px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-3xl space-y-6 text-left">
            {/* Real Status Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold uppercase tracking-wider">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span>Optical Fiber Broadband &bull; Kenya</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-white tracking-tight leading-[1.05]">
              The Future of{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-cyan-400 to-emerald-400">
                Connectivity
              </span>
            </h1>

            {/* Clear Genuine Subtitle */}
            <p className="text-base sm:text-xl text-slate-300 max-w-2xl leading-relaxed">
              Ultra-fast fiber internet, enterprise networking hardware, and professional cabling solutions powering modern Kenyan homes and businesses with zero throttling.
            </p>

            {/* Real Action Buttons */}
            <div className="flex flex-wrap items-center gap-3.5 pt-2">
              <a
                href="#packages"
                className="px-7 py-4 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs sm:text-sm tracking-wide uppercase shadow-xl shadow-amber-500/25 transition-all flex items-center gap-2 active:scale-95"
              >
                <span>View Internet Packages</span>
                <IconArrowRight size={16} />
              </a>
              <a
                href="#hardware"
                className="px-7 py-4 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 hover:border-amber-400 text-white font-bold text-xs sm:text-sm tracking-wide transition-all flex items-center gap-2 shadow-lg"
              >
                <IconPackage size={16} className="text-cyan-400" />
                <span>Hardware Store</span>
              </a>
              <a
                href="https://wa.me/254703605266?text=Hello%20MashupHost%2C%20I%20want%20to%20get%20connected%20to%20Fiber"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-4 rounded-xl bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/40 text-emerald-300 font-bold text-xs sm:text-sm transition-all flex items-center gap-2"
              >
                <IconWhatsApp size={17} className="text-[#25D366]" />
                <span>WhatsApp Us</span>
              </a>
            </div>

            {/* Real Service Guarantees (Replacing fake 50Gbps vanity numbers) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-8 border-t border-slate-800/80 text-left">
              <div className="space-y-1">
                <span className="text-amber-400 font-mono font-bold text-sm block">100% Truly Unlimited</span>
                <span className="text-xs text-slate-400 block">Zero data caps or FUP throttling</span>
              </div>
              <div className="space-y-1">
                <span className="text-emerald-400 font-mono font-bold text-sm block">Instant M-Pesa</span>
                <span className="text-xs text-slate-400 block">Automated renewal in seconds</span>
              </div>
              <div className="space-y-1">
                <span className="text-cyan-300 font-mono font-bold text-sm block">Router Included</span>
                <span className="text-xs text-slate-400 block">Dual-Band Gigabit equipment</span>
              </div>
              <div className="space-y-1">
                <span className="text-white font-mono font-bold text-sm block">24-48h Setup</span>
                <span className="text-xs text-slate-400 block">Professional optical splicing</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. TRUST BADGES ROW */}
      <section className="border-y border-slate-800/80 bg-[#090D16] py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6 text-center sm:text-left">
            {/* Badge 1 */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-lg shrink-0">
                <IconLock size={18} />
              </div>
              <div>
                <h4 className="text-xs font-black text-white">Secure Payments</h4>
                <p className="text-[11px] text-slate-400">M-Pesa STK &amp; Paybill</p>
              </div>
            </div>

            {/* Badge 2 */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 text-lg shrink-0">
                <IconShield size={18} />
              </div>
              <div>
                <h4 className="text-xs font-black text-white">Genuine Hardware</h4>
                <p className="text-[11px] text-slate-400">MikroTik &amp; Ubiquiti</p>
              </div>
            </div>

            {/* Badge 3 */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-lg shrink-0">
                <IconPackage size={18} />
              </div>
              <div>
                <h4 className="text-xs font-black text-white">Fast Dispatch</h4>
                <p className="text-[11px] text-slate-400">Nairobi &amp; 47 Counties</p>
              </div>
            </div>

            {/* Badge 4 */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-yellow-400 text-lg shrink-0">
                <IconLifeBuoy size={18} />
              </div>
              <div>
                <h4 className="text-xs font-black text-white">24/7 Support</h4>
                <p className="text-[11px] text-slate-400">Direct on WhatsApp</p>
              </div>
            </div>

            {/* Badge 5 */}
            <div className="flex items-center gap-3 col-span-2 sm:col-span-1">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 text-lg shrink-0">
                <IconRouter size={18} />
              </div>
              <div>
                <h4 className="text-xs font-black text-white">Clean Installation</h4>
                <p className="text-[11px] text-slate-400">Structured Cabling</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. WHAT WE OFFER */}
      <section id="solutions" className="py-20 bg-[#060A12] relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold uppercase">
              <span>What We Offer</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
              Complete Connectivity Solutions
            </h2>
            <p className="text-sm sm:text-base text-slate-300">
              Everything you need to connect your home, business, or estate with reliable high-speed infrastructure.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Card 1 */}
            <div className="rounded-3xl bg-slate-950 p-6 border border-slate-800 hover:border-amber-400/50 transition-all space-y-4 shadow-xl group">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                <IconSpeed size={22} />
              </div>
              <h3 className="text-lg font-black text-white">High-Speed Fiber</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Dedicated optical fiber connections up to 1Gbps for residences, estates, and business premises.
              </p>
              <a href="#packages" className="text-xs font-bold text-amber-400 hover:text-amber-300 inline-flex items-center gap-1">
                <span>View Plans</span>
                <span>&rarr;</span>
              </a>
            </div>

            {/* Card 2 */}
            <div className="rounded-3xl bg-slate-950 p-6 border border-slate-800 hover:border-cyan-400/50 transition-all space-y-4 shadow-xl group">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
                <IconPackage size={22} />
              </div>
              <h3 className="text-lg font-black text-white">Hardware Store</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Authentic MikroTik routers, switches, fiber patch cords, and accessories delivered nationwide.
              </p>
              <a href="#hardware" className="text-xs font-bold text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1">
                <span>Browse Store</span>
                <span>&rarr;</span>
              </a>
            </div>

            {/* Card 3 */}
            <div className="rounded-3xl bg-slate-950 p-6 border border-slate-800 hover:border-emerald-400/50 transition-all space-y-4 shadow-xl group">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                <IconRouter size={22} />
              </div>
              <h3 className="text-lg font-black text-white">Network Engineering</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Structured cabling, hotspot configuration, optical fusion splicing, and neat rack management.
              </p>
              <a
                href="https://wa.me/254703605266?text=Hello%20MashupHost%2C%20I%20need%20Network%20Engineering%20Solutions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-bold text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1"
              >
                <span>Talk to Engineer</span>
                <span>&rarr;</span>
              </a>
            </div>

            {/* Card 4 */}
            <div className="rounded-3xl bg-slate-950 p-6 border border-slate-800 hover:border-yellow-400/50 transition-all space-y-4 shadow-xl group">
              <div className="w-12 h-12 rounded-2xl bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center text-yellow-400 group-hover:scale-110 transition-transform">
                <IconPulse size={22} />
              </div>
              <h3 className="text-lg font-black text-white">Power Backups</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Mini DC UPS units to keep your optical router and CCTV online during power outages.
              </p>
              <a href="#hardware" className="text-xs font-bold text-yellow-400 hover:text-yellow-300 inline-flex items-center gap-1">
                <span>View Mini UPS</span>
                <span>&rarr;</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 6. PACKAGES & PRICING */}
      <section id="packages" className="py-20 bg-[#060A12] relative border-t border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold uppercase">
              <span>Transparent Pricing</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
              High-Speed Internet Packages
            </h2>
            <p className="text-sm sm:text-base text-slate-300">
              100% truly unlimited fiber internet with zero data caps, free router installation, and instant M-Pesa renewal.
            </p>

            {/* Quick Renew Callout Banner */}
            <div className="max-w-3xl mx-auto rounded-2xl bg-gradient-to-r from-emerald-950/50 via-slate-900 to-emerald-950/50 border border-emerald-500/30 p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl text-left mt-3">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                  <IconMpesa size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-white">Already Connected? Quick Renew Monthly Internet</h3>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold uppercase">
                      10s M-Pesa
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Enter your Account Number (e.g. <span className="font-mono text-amber-400 font-bold">ACC-88921</span>) to renew service instantly without logging in.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRenewOpen(true)}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs uppercase tracking-wider transition-all shadow-md shrink-0 flex items-center gap-1.5 active:scale-95"
              >
                <IconMpesa size={14} />
                <span>Lipa Internet Now</span>
              </button>
            </div>

            {/* Tab Controls */}
            <div className="inline-flex p-1.5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl mt-4">
              <button
                type="button"
                onClick={() => setPlanTab("home")}
                className={`px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                  planTab === "home"
                    ? "bg-amber-400 text-slate-950 font-black shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Home Fiber
              </button>
              <button
                type="button"
                onClick={() => setPlanTab("business")}
                className={`px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                  planTab === "business"
                    ? "bg-amber-400 text-slate-950 font-black shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Dedicated Business (1:1)
              </button>
              <button
                type="button"
                onClick={() => setPlanTab("ultra")}
                className={`px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                  planTab === "ultra"
                    ? "bg-amber-400 text-slate-950 font-black shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Ultra Gigabit (1Gbps)
              </button>
            </div>
          </div>

          {/* Pricing Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredPlans.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-3xl p-6 transition-all duration-300 flex flex-col justify-between shadow-xl ${
                  plan.popular
                    ? "bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-amber-400/80 shadow-amber-500/10"
                    : "bg-slate-950 border border-slate-800 hover:border-slate-700"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black text-[10px] tracking-wider uppercase shadow-md">
                    Most Popular
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-black text-white">{plan.name}</h3>
                    <p className="text-xs text-slate-400 mt-1 min-h-[2rem] leading-relaxed">{plan.summary}</p>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-baseline justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-400 font-mono">KES</span>
                      <span className="text-2xl font-black text-white font-mono ml-1">
                        {plan.price.toLocaleString()}
                      </span>
                    </div>
                    <span className="text-xs font-mono font-bold text-amber-400">{plan.speed}</span>
                  </div>

                  <ul className="space-y-2.5 text-xs text-slate-300 pt-2 border-t border-slate-800/80">
                    {plan.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-emerald-400 shrink-0 mt-0.5">
                          <IconCheck size={14} />
                        </span>
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-6 space-y-2">
                  <button
                    type="button"
                    onClick={() => handleOrderPlan(plan)}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs uppercase tracking-wider transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
                  >
                    <IconMpesa size={16} />
                    <span>Order with M-Pesa</span>
                  </button>
                  <a
                    href={`https://wa.me/254703605266?text=Hello%20MashupHost%2C%20I%20want%20to%20order%20the%20${encodeURIComponent(
                      plan.name
                    )}%20(${plan.speed})%20package`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-center text-xs font-bold text-emerald-400 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <IconWhatsApp size={14} className="text-[#25D366]" />
                    <span>Inquire on WhatsApp</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. HARDWARE STORE */}
      <section id="hardware" className="py-20 bg-[#090D16] border-t border-slate-800/80 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold uppercase">
                <span>Enterprise Telecom Hardware</span>
              </div>
              <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
                Networking Hardware Store
              </h2>
              <p className="text-sm sm:text-base text-slate-300">
                Genuine MikroTik routers, switches, fiber cables, solar power backups, and CCTV systems with full warranty.
              </p>
            </div>

            {/* Search Input */}
            <div className="w-full md:w-80">
              <input
                type="text"
                placeholder="Search routers, cables, switches..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-slate-900 border border-slate-700 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400 transition-colors shadow-lg"
              />
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap gap-2 pt-2">
            {[
              { id: "all", label: "All Hardware" },
              { id: "routers", label: "Routers & ONUs" },
              { id: "switches", label: "Gigabit Switches" },
              { id: "wireless", label: "Access Points" },
              { id: "fiber", label: "Fiber & SFP Cables" },
              { id: "solar", label: "Mini DC UPS Backups" },
              { id: "cctv", label: "CCTV & Security" },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeCategory === cat.id
                    ? "bg-amber-400 text-slate-950 font-black shadow-md"
                    : "bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Products Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProducts.slice(0, 16).map((product: HardwareProduct) => (
              <HardwareProductCard key={product.id} product={product} onQuickBuy={() => setIsCartOpen(true)} />
            ))}
          </div>

          <div className="text-center pt-4">
            <Link
              href="/track"
              className="inline-flex items-center gap-2 text-xs font-bold text-cyan-400 hover:text-cyan-300 underline"
            >
              <span>Ordered hardware? Track your dispatch parcel status here &rarr;</span>
            </Link>
          </div>
        </div>
      </section>

      {/* 8. COVERAGE EXPLORER */}
      <section id="coverage" className="py-20 bg-[#060A12] border-t border-slate-800/80">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 text-center">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold uppercase">
              <span>Fiber Network Reach</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
              Check Fiber Coverage For Your Area
            </h2>
            <p className="text-sm sm:text-base text-slate-300">
              We connect homes and businesses across Nairobi, Kiambu, Machakos, Nakuru, Eldoret, and expanding towns.
            </p>
          </div>

          <form onSubmit={handleCoverageCheck} className="flex flex-col sm:flex-row gap-3 max-w-xl mx-auto">
            <input
              type="text"
              placeholder="Enter your estate or town (e.g. Utawala, Kilimani, Thika...)"
              value={coverageSearch}
              onChange={(e) => setCoverageSearch(e.target.value)}
              className="flex-1 px-5 py-4 rounded-2xl bg-slate-900 border border-slate-700 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400 transition-colors shadow-xl"
            />
            <button
              type="submit"
              className="px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wider transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2 shrink-0"
            >
              <IconWhatsApp size={16} />
              <span>Check on WhatsApp</span>
            </button>
          </form>
        </div>
      </section>

      {/* 9. FREQUENTLY ASKED QUESTIONS */}
      <section id="faq" className="py-20 bg-[#060A12] border-t border-slate-800/80">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold uppercase">
              <span>Got Questions?</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
              Frequently Asked Questions
            </h2>
            <p className="text-sm sm:text-base text-slate-300">
              Honest, transparent answers about our optical internet packages, installation, and hardware.
            </p>
          </div>

          <div className="space-y-4">
            {FAQS.map((faq, idx) => (
              <div
                key={idx}
                className="rounded-2xl bg-slate-950 border border-slate-800/90 overflow-hidden transition-colors shadow-lg"
              >
                <button
                  type="button"
                  onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
                  className="w-full p-5 text-left flex items-center justify-between gap-4 font-bold text-sm text-white hover:text-amber-400 transition-colors"
                >
                  <span>{faq.q}</span>
                  <span className="text-amber-400 text-lg font-mono">{activeFaq === idx ? "−" : "+"}</span>
                </button>
                {activeFaq === idx && (
                  <div className="px-5 pb-5 pt-1 text-xs text-slate-300 leading-relaxed border-t border-slate-900">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 10. GET CONNECTED CTA */}
      <section className="py-20 bg-gradient-to-r from-slate-950 via-[#111622] to-slate-950 border-t border-amber-500/30 relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6 relative z-10">
          <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            Ready to Experience High-Speed Fiber?
          </h2>
          <p className="text-sm sm:text-base text-slate-300 max-w-xl mx-auto">
            Order your home or business plan today with instant M-Pesa automated activation and same-day installation dispatch.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <a
              href="#packages"
              className="px-8 py-4 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-sm tracking-wide uppercase shadow-xl shadow-amber-500/25 transition-all active:scale-95"
            >
              View Internet Packages
            </a>
            <a
              href="https://wa.me/254703605266?text=Hello%20MashupHost%2C%20I%20want%20to%20get%20connected%20to%20Fiber"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-4 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 border border-[#25D366]/40 text-emerald-300 font-bold text-sm transition-all flex items-center gap-2.5 active:scale-95 shadow-lg"
            >
              <IconWhatsApp size={18} className="text-[#25D366]" />
              <span>WhatsApp Us (+254 703 605 266)</span>
            </a>
          </div>
        </div>
      </section>

      {/* 11. FOOTER */}
      <footer className="bg-[#04060C] border-t border-slate-800/80 pt-16 pb-12 text-slate-400 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
            {/* Col 1 */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl overflow-hidden border border-amber-500/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo.jpg" alt="MashupHost Logo" className="h-full w-full object-cover" />
                </div>
                <span className="text-base font-black text-white">
                  MASHUP<span className="text-amber-400">HOST</span>
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
                Kenya’s high-speed optical fiber network &amp; enterprise hardware store. Truly unlimited data, automated M-Pesa billing, and nationwide equipment delivery.
              </p>
              <p className="text-xs text-slate-400">
                Nairobi Operations Hub &bull; 24/7 Dispatch Hotline: <strong className="text-white">+254 703 605 266</strong>
              </p>
            </div>

            {/* Col 2 */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-white">Services</h4>
              <ul className="space-y-2 text-xs">
                <li><a href="#packages" className="hover:text-amber-400 transition-colors">Home Fiber Internet</a></li>
                <li><a href="#packages" className="hover:text-amber-400 transition-colors">Dedicated Business 1:1</a></li>
                <li><a href="#packages" className="hover:text-amber-400 transition-colors">Ultra Gigabit 1Gbps</a></li>
                <li><a href="#coverage" className="hover:text-amber-400 transition-colors">Coverage Check</a></li>
                <li><Link href="/track" className="text-amber-400 hover:text-amber-300 font-bold transition-colors">📍 Track My Order</Link></li>
              </ul>
            </div>

            {/* Col 3 */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-white">Hardware Shop</h4>
              <ul className="space-y-2 text-xs">
                <li><a href="#hardware" className="hover:text-amber-400 transition-colors">MikroTik Routers</a></li>
                <li><a href="#hardware" className="hover:text-amber-400 transition-colors">Ubiquiti APs</a></li>
                <li><a href="#hardware" className="hover:text-amber-400 transition-colors">Mini DC UPS</a></li>
                <li><a href="#hardware" className="hover:text-amber-400 transition-colors">Fiber Cables &amp; Patch Cords</a></li>
                <li><a href="#hardware" className="hover:text-amber-400 transition-colors">CCTV Cameras</a></li>
              </ul>
            </div>

            {/* Col 4 */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-white">Account &amp; Legal</h4>
              <ul className="space-y-2 text-xs">
                <li><Link href="/app" className="hover:text-amber-400 transition-colors">Customer Portal</Link></li>
                <li><Link href="/terms" className="hover:text-amber-400 transition-colors">Terms of Service</Link></li>
                <li><Link href="/refund-policy" className="hover:text-amber-400 transition-colors">Refund Policy</Link></li>
                <li><Link href="/referral-policy" className="hover:text-amber-400 transition-colors">Referral Policy</Link></li>
                <li>
                  <a
                    href="https://wa.me/254703605266?text=Hello%20MashupHost%20Support"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-emerald-400 transition-colors flex items-center gap-1 text-[#25D366]"
                  >
                    <IconWhatsApp size={13} />
                    <span>WhatsApp Support</span>
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-900 flex flex-wrap items-center justify-between gap-4 text-[11px] text-slate-400">
            <p>&copy; {new Date().getFullYear()} MASHUPHOST TELECOM. All rights reserved.</p>
            <div className="flex items-center gap-4 text-slate-400">
              <span>M-Pesa Safaricom Daraja Verified</span>
              <span>&bull;</span>
              <span>Kenya Internet Exchange (KIXP) Peered</span>
            </div>
          </div>
        </div>
      </footer>

      {/* 12. FLOATING WHATSAPP ASSISTANCE BUTTON */}
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3">
        {/* Floating Desktop Tooltip Banner */}
        <div className="hidden lg:flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-slate-900/95 border border-emerald-500/30 text-white text-xs font-medium shadow-2xl backdrop-blur-md">
          <span className="h-2 w-2 rounded-full bg-[#25D366]" />
          <span className="text-slate-300">
            Need help? <span className="text-[#25D366] font-bold">Chat with NOC</span>
          </span>
        </div>

        {/* Real WhatsApp Brand Floating Button */}
        <a
          href="https://wa.me/254703605266?text=Hello%20MashupHost%2C%20I%20want%20to%20inquire%20about%20fiber%20internet%20packages%20and%20hardware."
          target="_blank"
          rel="noopener noreferrer"
          className="group relative flex items-center justify-center gap-2.5 p-3.5 sm:px-4 sm:py-3.5 rounded-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-xs shadow-2xl shadow-emerald-500/50 hover:shadow-emerald-500/70 transition-all hover:scale-105 active:scale-95 ring-4 ring-emerald-500/20"
          title="Chat on WhatsApp (+254 703 605 266)"
          aria-label="Chat with MashupHost NOC on WhatsApp"
        >
          <IconWhatsApp size={22} className="text-white drop-shadow-md" />
          <span className="hidden sm:inline font-black tracking-wide uppercase text-[11px] text-white">
            WhatsApp
          </span>
        </a>
      </div>

      {/* 13. CART DRAWER WITH M-PESA CHECKOUT & AUTO-ACCOUNT CREATION */}
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />

      {/* 14. LIPA INTERNET / QUICK RENEW MODAL */}
      <QuickRenewModal isOpen={isRenewOpen} onClose={() => setIsRenewOpen(false)} />
    </div>
  );
}
