"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useCart, FALLBACK_PRODUCTS, HardwareProduct } from "@/lib/hardware-store";
import { CartDrawer } from "@/components/store/cart-drawer";
import { HardwareProductCard } from "@/components/store/hardware-product-card";
import {
  IconMpesa,
  IconCheck,
  IconArrowRight,
  IconRouter,
  IconShield,
  IconPulse,
  IconTerminal,
  IconUsers,
} from "@/components/icons";

interface PlanItem {
  id: string;
  name: string;
  speed: string;
  price: number; // KES per month
  popular?: boolean;
  type: "home" | "business";
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
    summary: "Ideal for basic browsing, WhatsApp, Zoom meetings, and standard HD streaming.",
    features: [
      "10 Mbps Unlimited High-Speed",
      "Connect 1 to 3 Devices",
      "Truly Unlimited (Zero FUP Caps)",
      "Standard WiFi Router Included",
      "99.9% Network SLA Uptime",
      "Instant M-Pesa Auto-Renewal",
    ],
  },
  {
    id: "home_silver",
    name: "Home Silver",
    speed: "20 Mbps",
    price: 2500,
    popular: true,
    type: "home",
    summary: "Our most popular residential plan. Smooth 4K streaming, online gaming, and family use.",
    features: [
      "20 Mbps Symmetrical Throughput",
      "Connect 4 to 8 Devices",
      "FREE Professional Installation",
      "Dual-Band Gigabit Router Included",
      "Smooth 4K Ultra-HD Netflix & YouTube",
      "24/7 Dedicated Support",
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
      "50 Mbps Ultra-Fast Fiber",
      "Connect 10+ Simultaneous Devices",
      "FREE Next-Gen WiFi 6 Router",
      "Zero Lag Multi-Player Gaming",
      "Priority Peering to KIXP & Google",
      "Same-Day Installation Guarantee",
    ],
  },
  {
    id: "home_platinum",
    name: "Home Platinum",
    speed: "100 Mbps",
    price: 6500,
    type: "home",
    summary: "Extreme gigabit performance for luxury homes, creators, and work-from-home villas.",
    features: [
      "100 Mbps High-Performance Fiber",
      "Connect 20+ Devices with Zero Congestion",
      "FREE Mesh WiFi 6 Coverage Kit",
      "Ultra-Low Latency to Global CDNs",
      "VIP Dedicated Support Line",
      "Free Static IP on Request",
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
      "50 Mbps Dedicated Symmetrical (1:1)",
      "1 Usable Public Static IPv4 Address",
      "99.95% Enterprise SLA Guarantee",
      "MikroTik Enterprise Cloud Gateway",
      "Dedicated BGP & Low Latency Routing",
      "4-Hour MTTR Priority Dispatch",
    ],
  },
  {
    id: "biz_sme",
    name: "Business SME",
    speed: "100 Mbps (1:1)",
    price: 15000,
    popular: true,
    type: "business",
    summary: "Mission-critical connectivity for corporate HQs, call centers, and institutions.",
    features: [
      "100 Mbps Dedicated 1:1 Symmetrical",
      "2 Usable Public Static IPv4 Addresses",
      "Direct Peering to Safaricom, Liquid & KIXP",
      "Dual-Path Redundant Fiber Uplink",
      "24/7 Managed NOC Telemetry Monitoring",
      "2-Hour Rapid Field Response",
    ],
  },
  {
    id: "biz_enterprise",
    name: "Business Enterprise",
    speed: "250 Mbps (1:1)",
    price: 28000,
    type: "business",
    summary: "Carrier-grade optical connectivity for fintechs, colleges, and regional tech hubs.",
    features: [
      "250 Mbps Pure Fiber Dedicated Bandwidth",
      "4 Usable Public Static IPv4 Addresses",
      "10G SFP+ Optical Hand-off Directly in Rack",
      "Custom BGP Autonomous System (AS) Peering",
      "Named Dedicated Network Engineer",
      "99.99% Financial-Grade SLA",
    ],
  },
];

const FAQS = [
  {
    q: "How fast can I get connected after ordering?",
    a: "We offer same-day or 24-hour installation across all covered areas in Kenya. Once you confirm your location and complete your request, a certified fiber splicing team is dispatched with all equipment.",
  },
  {
    q: "Are the fiber internet packages truly unlimited?",
    a: "Yes! All our home and business fiber plans come with 100% truly unlimited data. We do not enforce Fair Usage Policies (FUP), throttling, or speed reductions at any time of day or night.",
  },
  {
    q: "What happens to my connection when power goes off (KPLC blackout)?",
    a: "Our core optical network and POP towers are equipped with industrial LiFePO4 battery banks and backup generators. You can also purchase our Mini DC UPS from the hardware shop to keep your home router and ONU powered for 4 to 6 hours during local blackouts.",
  },
  {
    q: "How does the M-Pesa automated billing work?",
    a: "Billing is 100% automated via Safaricom Daraja. When your subscription is due, you receive an SMS reminder and can pay via instant M-Pesa STK push. Your account and internet session are renewed automatically within 15 seconds without calling support.",
  },
  {
    q: "What warranty and support do you provide for hardware?",
    a: "All networking hardware (MikroTik routers, switches, fiber accessories, solar batteries) comes with a 1-year official replacement warranty. If a product fails under normal operating conditions, our NOC team replaces it promptly.",
  },
  {
    q: "How do I check if my estate or neighborhood has fiber coverage?",
    a: "Type your county or neighborhood into our interactive coverage tool below, or send us a quick WhatsApp message with your GPS pin. Our team will verify building fiber duct availability within 2 minutes.",
  },
];

export function LandingClient({ initialContent }: { initialContent?: unknown }) {
  const { itemCount, addItem } = useCart();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [planType, setPlanType] = useState<"home" | "business">("home");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [activeFaq, setActiveFaq] = useState<number | null>(0);

  // Speedometer Interactive Test Demo state
  const [speedTestRunning, setSpeedTestRunning] = useState(false);
  const [speedVal, setSpeedVal] = useState<number>(0);
  const [pingVal, setPingVal] = useState<number>(2);
  const [testComplete, setTestComplete] = useState(false);

  // Coverage search state
  const [coverageSearch, setCoverageSearch] = useState("");
  const [coverageResult, setCoverageResult] = useState<string | null>(null);

  const filteredPlans = useMemo(
    () => FIBER_PLANS.filter((p) => p.type === planType),
    [planType]
  );

  const filteredProducts = useMemo(() => {
    if (activeCategory === "all") return FALLBACK_PRODUCTS;
    return FALLBACK_PRODUCTS.filter((p) => p.category === activeCategory);
  }, [activeCategory]);

  const runSpeedTest = () => {
    if (speedTestRunning) return;
    setSpeedTestRunning(true);
    setTestComplete(false);
    setSpeedVal(10);
    setPingVal(1.8);

    let curr = 10;
    const interval = setInterval(() => {
      curr += Math.floor(Math.random() * 85) + 35;
      if (curr >= 982) {
        clearInterval(interval);
        setSpeedVal(982.4);
        setSpeedTestRunning(false);
        setTestComplete(true);
      } else {
        setSpeedVal(curr);
      }
    }, 70);
  };

  const handleCoverageCheck = (e: React.FormEvent) => {
    e.preventDefault();
    if (!coverageSearch.trim()) return;
    const q = coverageSearch.toLowerCase();
    if (
      q.includes("nairobi") ||
      q.includes("utawala") ||
      q.includes("dandora") ||
      q.includes("kilimani") ||
      q.includes("westlands") ||
      q.includes("kiambu") ||
      q.includes("ruiru") ||
      q.includes("thika") ||
      q.includes("machakos") ||
      q.includes("mombasa") ||
      q.includes("nakuru") ||
      q.includes("eldoret") ||
      q.includes("kisumu")
    ) {
      setCoverageResult("✓ Great news! High-Speed Fiber Backbone is LIVE in your area. Ready for 24h installation.");
    } else {
      setCoverageResult("✓ Good news! High-Speed Wireless Backhaul is available. Fiber trunk extension is in progress.");
    }
  };

  const handleOrderPlan = (plan: PlanItem) => {
    // Add plan as service item to cart & open cart drawer
    addItem(
      {
        id: `plan_${plan.id}`,
        name: `${plan.name} (${plan.speed}) - Monthly Fiber Subscription`,
        slug: plan.id,
        brand: "MashupKGrid Fiber",
        category: "fiber",
        price: plan.price,
        stock: 999,
        inStock: true,
        rating: 5.0,
        reviewCount: 84,
        shortDescription: plan.summary,
        description: plan.summary,
        imageUrl: "/fiber-home.jpg",
        specs: plan.features,
        warranty: "Guaranteed SLA",
        featured: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      1
    );
    setIsCartOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#060913] text-slate-100 font-sans selection:bg-cyan-500 selection:text-slate-950 overflow-x-hidden">
      {/* 1. TOP CARRIER ANNOUNCEMENT RIBBON */}
      <div className="bg-gradient-to-r from-cyan-950 via-slate-900 to-cyan-950 border-b border-cyan-500/20 py-2 px-4 text-center text-xs font-medium text-slate-300">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5 text-cyan-400 font-bold">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
            Special Kenya ISP Offer:
          </span>
          <span>FREE Installation &amp; Dual-Band WiFi Router on all 20M+ Home Fiber Plans.</span>
          <a
            href="https://wa.me/254702537372?text=Hello%20MashupKGrid%2C%20I%20want%20to%20get%20connected%20to%20Fiber"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300 font-bold underline flex items-center gap-1"
          >
            <span>WhatsApp Dispatch: +254 702 537 372</span>
            <span>&rarr;</span>
          </a>
        </div>
      </div>

      {/* 2. STICKY MODERN GLASS HEADER */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#060913]/85 border-b border-slate-800/80 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative h-10 w-10 rounded-xl overflow-hidden shadow-lg shadow-cyan-500/20 border border-cyan-500/40 group-hover:scale-105 transition-transform">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.jpg" alt="MashupKGrid Logo" className="h-full w-full object-cover" />
            </div>
            <div>
              <span className="text-xl font-black tracking-tight text-white group-hover:text-cyan-400 transition-colors">
                MASHUP<span className="text-cyan-400">KGRID</span>
              </span>
              <span className="hidden sm:block text-[10px] font-mono tracking-widest text-slate-400 uppercase font-semibold">
                High-Speed Telecom &amp; Hardware
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-7 text-xs font-bold text-slate-300 tracking-wide uppercase">
            <a href="#hero" className="hover:text-cyan-400 transition-colors">Home</a>
            <a href="#packages" className="hover:text-cyan-400 transition-colors">Fiber Packages</a>
            <a href="#store" className="hover:text-cyan-400 transition-colors flex items-center gap-1">
              <span>Hardware Store</span>
              <span className="px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 text-[9px] font-mono">16+</span>
            </a>
            <a href="#workflow" className="hover:text-cyan-400 transition-colors">How It Works</a>
            <a href="#solutions" className="hover:text-cyan-400 transition-colors">Engineering</a>
            <a href="#coverage" className="hover:text-cyan-400 transition-colors">Coverage</a>
            <a href="#faq" className="hover:text-cyan-400 transition-colors">FAQ</a>
          </nav>

          {/* Right Action Icons */}
          <div className="flex items-center gap-3">
            {/* Cart Trigger */}
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative p-2.5 rounded-xl bg-slate-900/90 border border-slate-700 hover:border-cyan-500 text-slate-200 hover:text-white transition-all active:scale-95"
              title="View Cart"
            >
              <span className="text-base">🛒</span>
              {itemCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 font-black text-[10px] flex items-center justify-center shadow-lg">
                  {itemCount}
                </span>
              )}
            </button>

            {/* Portal / Sign In */}
            <Link
              href="/login"
              className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-cyan-500/50 text-xs font-bold text-slate-200 hover:text-white transition-all"
            >
              <span>👤</span>
              <span>Client Portal</span>
            </Link>

            {/* Dashboard / Admin */}
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 text-xs font-black shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
            >
              <span>⚡</span>
              <span>NOC Dashboard</span>
            </Link>
          </div>
        </div>
      </header>

      {/* 3. HERO SECTION (CARRIER TELECOM WITH REAL GENERATED VISUAL) */}
      <section id="hero" className="relative pt-12 pb-20 md:pt-16 md:pb-28 overflow-hidden">
        {/* Ambient Glows */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-cyan-500/10 blur-[130px] pointer-events-none" />
        <div className="absolute top-40 right-10 w-80 h-80 bg-emerald-500/10 blur-[120px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            {/* Left Content Column */}
            <div className="lg:col-span-7 space-y-6 text-left">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold uppercase tracking-wider">
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                <span>Connecting Kenya • One Home &amp; Enterprise at a Time</span>
              </div>

              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.1]">
                High-Speed Fiber Internet &amp;{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-emerald-400">
                  Carrier Hardware
                </span>{" "}
                Powering Modern Kenya.
              </h1>

              <p className="text-sm sm:text-base text-slate-300 max-w-2xl leading-relaxed">
                Ultra-fast, zero-buffering fiber broadband up to 1Gbps, enterprise networking gear from MikroTik &amp; Ubiquiti, 
                automated M-Pesa billing, and 24/7 dedicated carrier NOC monitoring.
              </p>

              {/* Primary Action Buttons */}
              <div className="flex flex-wrap items-center gap-3.5 pt-2">
                <a
                  href="#packages"
                  className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 via-cyan-500 to-sky-500 hover:from-emerald-400 hover:to-sky-400 text-slate-950 font-black text-xs sm:text-sm tracking-wide uppercase shadow-xl shadow-cyan-500/25 transition-all flex items-center gap-2 active:scale-95"
                >
                  <span>⚡</span>
                  <span>View Fiber Packages</span>
                </a>
                <a
                  href="#store"
                  className="px-6 py-3.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 hover:border-cyan-400 text-white font-bold text-xs sm:text-sm tracking-wide transition-all flex items-center gap-2 shadow-lg"
                >
                  <span>🛒</span>
                  <span>Browse Hardware Store</span>
                </a>
                <button
                  type="button"
                  onClick={runSpeedTest}
                  className="px-5 py-3.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-bold text-xs sm:text-sm transition-all flex items-center gap-2"
                >
                  <span>▶</span>
                  <span>{speedTestRunning ? "Testing..." : "Live Speed Test"}</span>
                </button>
              </div>

              {/* Interactive Backhaul Speedometer Test Bar */}
              {(speedTestRunning || testComplete) && (
                <div className="p-4 rounded-2xl bg-slate-950/90 border border-cyan-500/40 shadow-xl space-y-2 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-400">Target Backbone: KIXP Nairobi Core Ring</span>
                    <span className="text-emerald-400 font-bold">Latency: {pingVal} ms (0.3ms Jitter)</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl sm:text-3xl font-black font-mono text-cyan-300">
                      {speedVal.toFixed(1)} <span className="text-xs font-sans text-slate-400">Mbps Throughput</span>
                    </span>
                    <span className="text-xs font-bold text-slate-400">
                      {testComplete ? "✓ Line Rate Achieved" : "Measuring Optical Bandwidth..."}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-75"
                      style={{ width: `${Math.min(100, (speedVal / 1000) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Key Trust Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-800/80">
                <div>
                  <span className="block text-2xl sm:text-3xl font-black text-white font-mono">1 Gbps</span>
                  <span className="text-xs text-slate-400 font-medium">Max Fiber Speed</span>
                </div>
                <div>
                  <span className="block text-2xl sm:text-3xl font-black text-emerald-400 font-mono">99.98%</span>
                  <span className="text-xs text-slate-400 font-medium">Carrier SLA Uptime</span>
                </div>
                <div>
                  <span className="block text-2xl sm:text-3xl font-black text-cyan-300 font-mono">47</span>
                  <span className="text-xs text-slate-400 font-medium">Counties Delivery</span>
                </div>
                <div>
                  <span className="block text-2xl sm:text-3xl font-black text-amber-400 font-mono">24/7</span>
                  <span className="text-xs text-slate-400 font-medium">Dedicated NOC Support</span>
                </div>
              </div>
            </div>

            {/* Right Visual Column (Photorealistic Real Datacenter Image) */}
            <div className="lg:col-span-5 relative">
              <div className="relative rounded-3xl overflow-hidden border border-cyan-500/30 shadow-2xl shadow-cyan-500/15 group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/hero-telecom.jpg"
                  alt="High Speed Fiber Optic Datacenter Infrastructure"
                  className="w-full h-[360px] sm:h-[440px] object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#060913] via-transparent to-transparent opacity-80" />

                {/* Floating Telemetry Badge */}
                <div className="absolute bottom-4 left-4 right-4 p-4 rounded-2xl bg-slate-950/85 backdrop-blur-md border border-cyan-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                      <IconPulse size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-black text-white uppercase tracking-wider">10G Core Backbone Active</p>
                      <p className="text-[11px] text-emerald-400 font-mono">0.8ms Direct Peering Latency</p>
                    </div>
                  </div>
                  <span className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold text-[10px]">
                    ONLINE
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. FIBER INTERNET PACKAGES (HOME VS DEDICATED BUSINESS 1:1) */}
      <section id="packages" className="py-20 bg-[#090D16] border-y border-slate-800/80 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4 mb-12">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold uppercase">
              <span>⚡</span> High-Speed Fiber Internet
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Choose Your High-Speed Connection
            </h2>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              No contracts, no data caps, and zero fair usage throttling. All packages feature automated instant M-Pesa renewals.
            </p>

            {/* Plan Type Switcher Tab */}
            <div className="inline-flex items-center p-1.5 rounded-2xl bg-slate-950 border border-slate-800 shadow-xl mt-4">
              <button
                type="button"
                onClick={() => setPlanType("home")}
                className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-all ${
                  planType === "home"
                    ? "bg-cyan-500 text-slate-950 shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                🏠 Home Fiber Plans
              </button>
              <button
                type="button"
                onClick={() => setPlanType("business")}
                className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-all ${
                  planType === "business"
                    ? "bg-cyan-500 text-slate-950 shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                🏢 Business Dedicated (1:1)
              </button>
            </div>
          </div>

          {/* Pricing Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredPlans.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-3xl p-6 flex flex-col justify-between transition-all duration-300 ${
                  plan.popular
                    ? "bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 border-2 border-cyan-400 shadow-2xl shadow-cyan-500/20 scale-[1.02]"
                    : "bg-slate-950/80 border border-slate-800 hover:border-cyan-500/40 shadow-lg"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 text-slate-950 text-[10px] font-black uppercase tracking-wider shadow-md">
                    Most Popular
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-black text-white">{plan.name}</h3>
                    <p className="text-xs text-slate-400 mt-1">{plan.summary}</p>
                  </div>

                  {/* Speed Banner */}
                  <div className="py-2.5 px-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-slate-300">Bandwidth:</span>
                    <span className="text-xl font-black font-mono text-cyan-300">{plan.speed}</span>
                  </div>

                  {/* Price in KES */}
                  <div className="pt-2">
                    <div className="flex items-baseline gap-1">
                      <span className="text-xs font-bold text-slate-400 font-mono">KES</span>
                      <span className="text-3xl font-black text-white font-mono tracking-tight">
                        {plan.price.toLocaleString()}
                      </span>
                      <span className="text-xs text-slate-400">/ month</span>
                    </div>
                  </div>

                  {/* Features List */}
                  <ul className="space-y-2.5 pt-4 border-t border-slate-800/80 text-xs text-slate-300">
                    {plan.features.map((f, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-emerald-400 shrink-0 font-bold">✓</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-6">
                  <button
                    type="button"
                    onClick={() => handleOrderPlan(plan)}
                    className={`w-full py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 active:scale-95 shadow-md ${
                      plan.popular
                        ? "bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black shadow-emerald-500/20"
                        : "bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white"
                    }`}
                  >
                    <span>⚡</span>
                    <span>Order with M-Pesa</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. VISUAL FEATURE: REAL IMAGE SHOWCASE (HOME LIVING ROOM WIFI EXPERIENCE) */}
      <section className="py-20 bg-[#060913]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-gradient-to-r from-slate-950 via-[#07101e] to-slate-950 border border-cyan-500/30 p-8 sm:p-12 overflow-hidden shadow-2xl">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
              {/* Photo Column */}
              <div className="lg:col-span-6">
                <div className="relative rounded-2xl overflow-hidden border border-slate-700 shadow-xl group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/fiber-home.jpg"
                    alt="Seamless 4K Home Fiber WiFi Experience"
                    className="w-full h-[320px] sm:h-[380px] object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-slate-950/80 backdrop-blur-md border border-cyan-500/40 text-cyan-300 text-[10px] font-mono font-bold">
                    Zero Buffering 4K HDR
                  </div>
                </div>
              </div>

              {/* Text Column */}
              <div className="lg:col-span-6 space-y-5">
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold uppercase">
                  <span>🚀</span> Direct Kenya IXP Peering
                </div>
                <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
                  Seamless Connectivity for Your Entire Household &amp; Office.
                </h2>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Stream 4K movies on your smart TV, play low-ping competitive multiplayer games, attend high-definition Zoom conferences, 
                  and back up gigabytes to cloud storage simultaneously without anyone experiencing lag or drops.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
                    <span className="text-lg mb-1 block">📶</span>
                    <h4 className="font-bold text-sm text-white">Full Home WiFi 6</h4>
                    <p className="text-xs text-slate-400 mt-0.5">Dual-band beamforming covers every room with high signal strength.</p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
                    <span className="text-lg mb-1 block">🔋</span>
                    <h4 className="font-bold text-sm text-white">Blackout Immunity</h4>
                    <p className="text-xs text-slate-400 mt-0.5">Compatible with our Mini DC UPS for uninterrupted power during outages.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. COMPLETE HARDWARE ECOMMERCE STORE (ALL 6 CARRIER CATEGORIES) */}
      <section id="store" className="py-20 bg-[#090D16] border-t border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold uppercase">
                <span>🛒</span> Carrier-Grade Hardware Shop
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                Networking Hardware &amp; Telecom Equipment
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                Enterprise routers, switches, optical transceivers, solar backup batteries, and CCTV systems with genuine Kenya warranty and express delivery.
              </p>
            </div>

            <Link
              href="/shop"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-cyan-500/40 text-cyan-300 hover:text-white font-bold text-xs transition-all shadow-md shrink-0"
            >
              <span>Explore Full Store Catalog &rarr;</span>
            </Link>
          </div>

          {/* Visual Studio Hardware Banner */}
          <div className="relative rounded-3xl overflow-hidden border border-slate-800 shadow-2xl h-48 sm:h-64">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/hardware-gear.jpg"
              alt="Professional MikroTik and Optical Fiber Hardware"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/70 to-transparent p-6 sm:p-10 flex flex-col justify-center">
              <span className="px-2.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-mono text-[10px] font-bold uppercase w-fit">
                Carrier Hardware Hub
              </span>
              <h3 className="text-xl sm:text-2xl font-black text-white mt-1">Official Hardware &amp; Splicing Tools</h3>
              <p className="text-xs text-slate-300 max-w-md mt-1">
                MikroTik RouterOS licenses, optical fiber fusion tools, and SFP+ modules pre-configured for Kenyan ISPs.
              </p>
            </div>
          </div>

          {/* Category Filter Pills (All 6 carrier hardware categories) */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none text-xs font-bold">
            {[
              { id: "all", label: "All Equipment" },
              { id: "routers", label: "Routers & Gateways" },
              { id: "switches", label: "Switches & PoE" },
              { id: "wireless", label: "Wireless & APs" },
              { id: "fiber", label: "Fiber Optics & ONUs" },
              { id: "solar", label: "Solar & DC UPS" },
              { id: "cctv", label: "CCTV & Security" },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`px-4 py-2 rounded-xl transition-all whitespace-nowrap ${
                  activeCategory === cat.id
                    ? "bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 font-black shadow-md shadow-emerald-500/20"
                    : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Products Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredProducts.map((product) => (
              <HardwareProductCard
                key={product.id}
                product={product}
                onQuickBuy={() => setIsCartOpen(true)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* 7. FOUR-STEP INSTANT PROVISIONING WORKFLOW */}
      <section id="workflow" className="py-20 bg-[#060913] border-t border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-3 mb-16">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold uppercase">
              <span>⚡</span> Simple &amp; Fast
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              How MashupKGrid Delivers High-Speed Telecom
            </h2>
            <p className="text-sm text-slate-300">
              From plan selection to active fiber light in your premises in 4 transparent steps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              {
                step: "01",
                title: "Select Solution",
                desc: "Choose an unlimited home or business fiber plan, or select hardware from our carrier store.",
                icon: "📋",
              },
              {
                step: "02",
                title: "Instant M-Pesa Pay",
                desc: "Receive an automated Safaricom STK prompt on your phone for instant, secure cashless payment.",
                icon: "📱",
              },
              {
                step: "03",
                title: "24h Express Dispatch",
                desc: "Our splicing team runs the drop fiber or dispatches your hardware with tracking across 47 counties.",
                icon: "🚚",
              },
              {
                step: "04",
                title: "24/7 NOC Telemetry",
                desc: "Sub-15 second automated renewal, zero throttling, and real-time carrier link monitoring.",
                icon: "🛰️",
              },
            ].map((st, i) => (
              <div
                key={i}
                className="relative rounded-3xl bg-slate-950/80 border border-slate-800 p-6 space-y-4 hover:border-cyan-500/40 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-3xl font-black font-mono text-slate-700 group-hover:text-cyan-400 transition-colors">
                    {st.step}
                  </span>
                  <span className="text-2xl">{st.icon}</span>
                </div>
                <h3 className="font-bold text-base text-white">{st.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{st.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8. PROFESSIONAL NETWORK ENGINEERING SOLUTIONS */}
      <section id="solutions" className="py-20 bg-[#090D16] border-t border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold uppercase">
              <span>🛠️</span> Professional ISP Services
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Telecom Network Engineering Solutions
            </h2>
            <p className="text-sm text-slate-300">
              End-to-end infrastructure services for Kenyan ISPs, commercial buildings, and estates.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="rounded-3xl bg-slate-950 p-6 border border-slate-800 space-y-3 hover:border-cyan-500/40 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-xl text-cyan-400">
                🌐
              </div>
              <h3 className="font-bold text-base text-white">PPPoE Setup &amp; AAA</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Design IP pools, VLAN trunks, FreeRADIUS AAA integration, and automated subscriber bandwidth queues.
              </p>
            </div>

            <div className="rounded-3xl bg-slate-950 p-6 border border-slate-800 space-y-3 hover:border-emerald-500/40 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-xl text-emerald-400">
                🎟️
              </div>
              <h3 className="font-bold text-base text-white">Hotspot Captive Portals</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Branded WiFi landing pages with self-service M-Pesa voucher top-ups, rate limiting, and client isolation.
              </p>
            </div>

            <div className="rounded-3xl bg-slate-950 p-6 border border-slate-800 space-y-3 hover:border-amber-500/40 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-xl text-amber-400">
                📡
              </div>
              <h3 className="font-bold text-base text-white">POP Tower Deployment</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Point of Presence setups, point-to-point microwave backhauls, antenna alignment, and solar battery sizing.
              </p>
            </div>

            <div className="rounded-3xl bg-slate-950 p-6 border border-slate-800 space-y-3 hover:border-sky-500/40 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-xl text-sky-400">
                ⚡
              </div>
              <h3 className="font-bold text-base text-white">Fiber Splicing &amp; OTDR</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Fusion splicing, optical distribution frames (ODF), OTDR fault location, and neat server rack cable management.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 9. INTERACTIVE KENYA COVERAGE CHECKER */}
      <section id="coverage" className="py-20 bg-[#060913] border-t border-slate-800/80">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold uppercase">
            <span>📍</span> Kenya National Footprint
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            Check Fiber Availability in Your Neighborhood
          </h2>
          <p className="text-sm text-slate-300 max-w-xl mx-auto">
            Search your town, estate, or county to verify building fiber readiness.
          </p>

          <form onSubmit={handleCoverageCheck} className="max-w-xl mx-auto flex gap-2">
            <input
              type="text"
              required
              value={coverageSearch}
              onChange={(e) => setCoverageSearch(e.target.value)}
              placeholder="e.g. Utawala, Dandora, Kilimani, Ruiru, Eldoret..."
              className="flex-1 px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs sm:text-sm focus:outline-none focus:border-cyan-500"
            />
            <button
              type="submit"
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-bold text-xs sm:text-sm shrink-0 shadow-lg shadow-emerald-500/20"
            >
              Check Coverage
            </button>
          </form>

          {coverageResult && (
            <div className="p-4 rounded-2xl bg-slate-950 border border-emerald-500/40 text-emerald-300 text-xs font-semibold max-w-xl mx-auto animate-in fade-in">
              {coverageResult}
            </div>
          )}

          {/* Quick Town Pills */}
          <div className="flex flex-wrap justify-center gap-2 pt-2 text-xs text-slate-400">
            <span className="font-semibold text-slate-500">Live Coverage Nodes:</span>
            {[
              "Nairobi (All Estates)",
              "Utawala",
              "Dandora",
              "Kilimani",
              "Westlands",
              "Ruiru",
              "Thika",
              "Machakos",
              "Nakuru",
              "Eldoret",
              "Mombasa",
              "Kisumu",
            ].map((node, idx) => (
              <span key={idx} className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px]">
                {node}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* 10. FREQUENTLY ASKED QUESTIONS (FAQ ACCORDION) */}
      <section id="faq" className="py-20 bg-[#090D16] border-t border-slate-800/80">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold uppercase">
              <span>❓</span> Clarity &amp; Transparency
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-3">
            {FAQS.map((faq, idx) => {
              const isOpen = activeFaq === idx;
              return (
                <div
                  key={idx}
                  className="rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => setActiveFaq(isOpen ? null : idx)}
                    className="w-full p-5 text-left flex items-center justify-between gap-4 font-bold text-sm text-white hover:text-cyan-400 transition-colors"
                  >
                    <span>{faq.q}</span>
                    <span className="text-cyan-400 font-mono text-base">{isOpen ? "−" : "+"}</span>
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 text-xs text-slate-300 leading-relaxed border-t border-slate-800/60 pt-3">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 11. HIGH CONVERSION PRE-FOOTER CTA */}
      <section className="py-20 bg-gradient-to-r from-slate-950 via-[#071322] to-slate-950 border-t border-cyan-500/30 relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6 relative z-10">
          <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            Ready to Experience Kenya&apos;s Most Reliable Telecom?
          </h2>
          <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Order your fiber package or enterprise networking hardware today and enjoy same-day deployment with automated M-Pesa billing.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <a
              href="#packages"
              className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black text-sm tracking-wide uppercase shadow-xl shadow-emerald-500/25 transition-all"
            >
              Get Connected Now
            </a>
            <a
              href="https://wa.me/254702537372?text=Hello%20MashupKGrid%2C%20I%20want%20to%20consult%20an%20engineer"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-bold text-sm transition-all flex items-center gap-2"
            >
              <span>💬</span>
              <span>Talk to an Engineer</span>
            </a>
          </div>
        </div>
      </section>

      {/* 12. COMPREHENSIVE CARRIER FOOTER */}
      <footer className="bg-[#04060c] border-t border-slate-800/80 pt-16 pb-12 text-slate-400 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
            {/* Col 1: Brand Info */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl overflow-hidden border border-cyan-500/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo.jpg" alt="MashupKGrid" className="h-full w-full object-cover" />
                </div>
                <span className="text-lg font-black text-white">
                  MASHUP<span className="text-cyan-400">KGRID</span>
                </span>
              </div>
              <p className="text-slate-400 leading-relaxed max-w-sm">
                Kenya&apos;s premier high-speed internet service provider and networking hardware distributor. 
                Delivering ultra-fast home broadband, 1:1 business dedicated circuits, and carrier equipment across 47 counties.
              </p>
              <div className="pt-1 flex items-center gap-4 text-slate-400 text-sm">
                <span>📍 Nairobi, Kenya</span>
                <span>•</span>
                <span>📞 +254 702 537 372</span>
              </div>
            </div>

            {/* Col 2: Services */}
            <div className="space-y-3">
              <p className="font-bold text-white uppercase text-[11px] tracking-wider font-mono">Services</p>
              <ul className="space-y-2">
                <li><a href="#packages" className="hover:text-cyan-400 transition-colors">Home Fiber Internet</a></li>
                <li><a href="#packages" className="hover:text-cyan-400 transition-colors">Business Dedicated (1:1)</a></li>
                <li><a href="#solutions" className="hover:text-cyan-400 transition-colors">PPPoE Server Setup</a></li>
                <li><a href="#solutions" className="hover:text-cyan-400 transition-colors">Hotspot Billing &amp; Portals</a></li>
                <li><a href="#solutions" className="hover:text-cyan-400 transition-colors">Tower POP Links</a></li>
              </ul>
            </div>

            {/* Col 3: Hardware Shop */}
            <div className="space-y-3">
              <p className="font-bold text-white uppercase text-[11px] tracking-wider font-mono">Hardware Shop</p>
              <ul className="space-y-2">
                <li><a href="#store" className="hover:text-cyan-400 transition-colors">MikroTik Routers</a></li>
                <li><a href="#store" className="hover:text-cyan-400 transition-colors">Gigabit &amp; PoE Switches</a></li>
                <li><a href="#store" className="hover:text-cyan-400 transition-colors">UniFi Access Points</a></li>
                <li><a href="#store" className="hover:text-cyan-400 transition-colors">Fiber ONUs &amp; Drop Cables</a></li>
                <li><a href="#store" className="hover:text-cyan-400 transition-colors">Mini DC UPS &amp; Solar</a></li>
              </ul>
            </div>

            {/* Col 4: Portals & Legal */}
            <div className="space-y-3">
              <p className="font-bold text-white uppercase text-[11px] tracking-wider font-mono">Portals &amp; Legal</p>
              <ul className="space-y-2">
                <li><Link href="/login" className="hover:text-cyan-400 transition-colors">Customer Self-Service</Link></li>
                <li><Link href="/dashboard" className="hover:text-cyan-400 transition-colors">NOC Admin Dashboard</Link></li>
                <li><Link href="/terms" className="hover:text-cyan-400 transition-colors">Terms of Service</Link></li>
                <li><Link href="/refund-policy" className="hover:text-cyan-400 transition-colors">Refund &amp; Return Policy</Link></li>
                <li><Link href="/donate" className="hover:text-cyan-400 transition-colors">Buy Us Coffee (M-Pesa)</Link></li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-[11px] text-slate-500">
            <p>&copy; {new Date().getFullYear()} MashupKGrid Technologies Ltd. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Safaricom Daraja 2.0 Certified
              </span>
              <span>•</span>
              <span>KIXP Peering Active</span>
            </div>
          </div>
        </div>
      </footer>

      {/* 13. CART DRAWER COMPONENT WITH M-PESA CHECKOUT */}
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </div>
  );
}
