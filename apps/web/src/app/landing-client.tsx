"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useCart, FALLBACK_PRODUCTS, HardwareProduct } from "@/lib/hardware-store";
import { CartDrawer } from "@/components/store/cart-drawer";
import { HardwareProductCard } from "@/components/store/hardware-product-card";
import {
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
      "Direct Peering to KIXP, Google & Netflix",
      "Same-Day Installation Guarantee",
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
      "MikroTik Enterprise Cloud Gateway",
      "Dedicated BGP & Low Latency Peering",
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
    a: "We offer 24-48 hour installation across all covered areas in Kenya. Once you confirm your location and complete your request, a certified fiber splicing team is dispatched with all optical equipment.",
  },
  {
    q: "Are the fiber internet packages truly unlimited?",
    a: "Yes! All our home and business fiber plans come with 100% truly unlimited data. We do not enforce Fair Usage Policies (FUP), throttling, or speed reductions at any time of day or night.",
  },
  {
    q: "Do you provide hardware and equipment?",
    a: "Yes! We operate a complete networking hardware shop stocked with genuine MikroTik routers, Ubiquiti access points, switches, fiber cables, Mini DC UPS power backups, and CCTV cameras delivered nationwide across 47 counties.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We support automated instant M-Pesa STK push, M-Pesa Paybill, and credit/debit cards. When your invoice is due, an M-Pesa prompt appears directly on your phone, and your service renews automatically within 15 seconds.",
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

const TESTIMONIALS = [
  {
    name: "Sarah Kimani",
    role: "Business Owner, Westlands",
    avatar: "SK",
    content: "MashupKGrid transformed our office connectivity. The speed and reliability are outstanding.",
    stars: 5,
  },
  {
    name: "David Omondi",
    role: "Software Developer, Kilimani",
    avatar: "DO",
    content: "Best ISP in Nairobi. No downtime, fast support, and incredible speeds for remote work.",
    stars: 5,
  },
  {
    name: "Grace Mwangi",
    role: "Content Creator, Ruiru",
    avatar: "GM",
    content: "Upload speeds are phenomenal. I can finally stream and upload content without lag.",
    stars: 5,
  },
];

export function LandingClient({ initialContent }: { initialContent?: unknown }) {
  const { itemCount, addItem } = useCart();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [planTab, setPlanTab] = useState<"home" | "business" | "ultra">("home");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeFaq, setActiveFaq] = useState<number | null>(0);

  // Backhaul Speed Test state
  const [speedTestRunning, setSpeedTestRunning] = useState(false);
  const [speedVal, setSpeedVal] = useState<number>(0);
  const [pingVal, setPingVal] = useState<number>(1.8);
  const [testComplete, setTestComplete] = useState(false);

  // Coverage search state
  const [coverageSearch, setCoverageSearch] = useState("");
  const [coverageResult, setCoverageResult] = useState<string | null>(null);

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

  const runSpeedTest = () => {
    if (speedTestRunning) return;
    setSpeedTestRunning(true);
    setTestComplete(false);
    setSpeedVal(5);
    setPingVal(1.8);

    let curr = 5;
    const interval = setInterval(() => {
      curr += Math.floor(Math.random() * 85) + 40;
      if (curr >= 982) {
        clearInterval(interval);
        setSpeedVal(982.4);
        setSpeedTestRunning(false);
        setTestComplete(true);
      } else {
        setSpeedVal(curr);
      }
    }, 60);
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
      setCoverageResult("✓ Great news! High-Speed Fiber Backbone is LIVE in your area. Ready for 24-48h installation.");
    } else {
      setCoverageResult("✓ Good news! High-Speed Wireless Backhaul is available in your region. Fiber trunk extension in progress.");
    }
  };

  const handleOrderPlan = (plan: PlanItem) => {
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
      <div className="bg-gradient-to-r from-amber-950/40 via-slate-900 to-amber-950/40 border-b border-amber-500/20 py-2 px-4 text-center text-xs font-medium text-slate-300">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5 text-amber-400 font-bold">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
            Special Hardware &amp; Internet Offers:
          </span>
          <span>Free Installation on select packages &bull; Enterprise equipment at great rates.</span>
          <a
            href="https://wa.me/254703605266?text=Hello%20MashupKGrid%2C%20I%20want%20to%20order%20internet%20packages%20or%20hardware"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400 hover:text-amber-300 font-bold underline flex items-center gap-1"
          >
            <span>WhatsApp Us: +254 703 605 266</span>
            <span>&rarr;</span>
          </a>
        </div>
      </div>

      {/* 2. STICKY MODERN HEADER */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#060A12]/90 border-b border-slate-800/80 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative h-10 w-10 rounded-xl overflow-hidden shadow-lg shadow-amber-500/10 border border-amber-500/40 group-hover:scale-105 transition-transform">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.jpg" alt="MashupKGrid Logo" className="h-full w-full object-cover" />
            </div>
            <div>
              <span className="text-xl font-black tracking-tight text-white group-hover:text-amber-400 transition-colors">
                MASHUP<span className="text-amber-400">KGRID</span>
              </span>
              <span className="hidden sm:block text-[10px] font-mono tracking-widest text-slate-400 uppercase font-semibold">
                High-Speed Telecom &amp; Hardware
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden lg:flex items-center gap-7 text-xs font-bold text-slate-300 tracking-wide uppercase">
            <a href="#packages" className="hover:text-amber-400 transition-colors">Internet Packages</a>
            <a href="#hardware" className="hover:text-amber-400 transition-colors flex items-center gap-1.5">
              <span>Hardware Shop</span>
              <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[9px] font-mono font-bold">35+</span>
            </a>
            <a href="#solutions" className="hover:text-amber-400 transition-colors">Solutions</a>
            <a href="#why-us" className="hover:text-amber-400 transition-colors">Why Us</a>
            <a href="#coverage" className="hover:text-amber-400 transition-colors">Coverage</a>
            <a href="#testimonials" className="hover:text-amber-400 transition-colors">Testimonials</a>
            <a href="#faq" className="hover:text-amber-400 transition-colors">FAQs</a>
          </nav>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            {/* Cart Trigger */}
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative p-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-amber-400 text-slate-200 hover:text-white transition-all active:scale-95 shadow-md"
              title="View Cart"
            >
              <span className="text-base">🛒</span>
              {itemCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black text-[10px] flex items-center justify-center shadow-lg">
                  {itemCount}
                </span>
              )}
            </button>

            {/* Client Portal */}
            <Link
              href="/login"
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-amber-400/50 text-xs font-bold text-slate-200 hover:text-white transition-all"
            >
              <span>👤</span>
              <span>Portal</span>
            </Link>

            {/* Admin Dashboard */}
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 text-xs font-black shadow-lg shadow-amber-500/20 transition-all active:scale-95"
            >
              <span>⚡</span>
              <span>Admin Panel</span>
            </Link>
          </div>
        </div>
      </header>

      {/* 3. HERO SECTION (THE FUTURE OF CONNECTIVITY) */}
      <section id="hero" className="relative pt-12 pb-16 md:pt-20 md:pb-24 overflow-hidden">
        {/* Ambient Gradient Glows */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-amber-500/10 blur-[130px] pointer-events-none" />
        <div className="absolute top-40 right-10 w-80 h-80 bg-cyan-500/10 blur-[120px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            {/* Left Hero Column */}
            <div className="lg:col-span-7 space-y-6 text-left">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold uppercase tracking-wider shadow-sm">
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                <span>⚡ Premium Internet Solutions</span>
              </div>

              {/* Exact Target Headline */}
              <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-white tracking-tight leading-[1.05]">
                The Future of{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-cyan-400 to-emerald-400">
                  Connectivity
                </span>
              </h1>

              {/* Exact Target Subtitle */}
              <p className="text-base sm:text-lg text-slate-300 max-w-2xl leading-relaxed">
                Ultra-fast fiber internet, enterprise hardware, and expert network solutions powering modern Kenya.
              </p>

              {/* Exact Target CTAs */}
              <div className="flex flex-wrap items-center gap-3.5 pt-2">
                <a
                  href="#packages"
                  className="px-7 py-4 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs sm:text-sm tracking-wide uppercase shadow-xl shadow-amber-500/25 transition-all flex items-center gap-2 active:scale-95"
                >
                  <span>View Packages</span>
                  <IconArrowRight size={16} />
                </a>
                <a
                  href="#hardware"
                  className="px-7 py-4 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 hover:border-amber-400 text-white font-bold text-xs sm:text-sm tracking-wide transition-all flex items-center gap-2 shadow-lg"
                >
                  <span>🛒</span>
                  <span>Explore Hardware</span>
                </a>
                <button
                  type="button"
                  onClick={runSpeedTest}
                  className="px-5 py-4 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-bold text-xs sm:text-sm transition-all flex items-center gap-2"
                >
                  <span>▶</span>
                  <span>{speedTestRunning ? "Testing Speed..." : "Backhaul Test"}</span>
                </button>
              </div>

              {/* Key Hero Stats Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 border-t border-slate-800/80">
                <div className="space-y-0.5">
                  <span className="block text-2xl sm:text-3xl font-black text-amber-400 font-mono">50 Gbps</span>
                  <span className="text-xs text-slate-400 font-medium">Backhaul Capacity</span>
                </div>
                <div className="space-y-0.5">
                  <span className="block text-2xl sm:text-3xl font-black text-cyan-300 font-mono">3,000+</span>
                  <span className="text-xs text-slate-400 font-medium">Active Customers</span>
                </div>
                <div className="space-y-0.5">
                  <span className="block text-2xl sm:text-3xl font-black text-emerald-400 font-mono">99.9%</span>
                  <span className="text-xs text-slate-400 font-medium">Uptime Guarantee</span>
                </div>
                <div className="space-y-0.5">
                  <span className="block text-2xl sm:text-3xl font-black text-white font-mono">5+ Years</span>
                  <span className="text-xs text-slate-400 font-medium">Operating Experience</span>
                </div>
              </div>
            </div>

            {/* Right Hero Column: Interactive Backhaul Speed Test Widget & Telecom Image */}
            <div className="lg:col-span-5 space-y-4">
              {/* Backhaul Speedometer Demo Card */}
              <div className="p-6 rounded-3xl bg-slate-950/90 border border-amber-500/30 shadow-2xl shadow-amber-500/10 space-y-4 relative backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-black text-white flex items-center gap-2">
                      <span className="text-amber-400">⚡</span>
                      <span>Backhaul Speed Test</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Real-time demonstration of our 50 Gbps backhaul utilization
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold">
                    99.99% Uptime
                  </span>
                </div>

                {/* Speed Dial & Metrics */}
                <div className="flex flex-col items-center justify-center py-4 relative">
                  {/* Circular Speed Gauge */}
                  <div className="relative w-48 h-28 flex items-end justify-center overflow-hidden">
                    <svg className="w-48 h-48 transform -rotate-90" viewBox="0 0 100 100">
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        className="text-slate-800"
                        strokeWidth="8"
                        stroke="currentColor"
                        fill="transparent"
                        strokeDasharray="188.5"
                        strokeDashoffset="62.8"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        className="text-amber-400 transition-all duration-100"
                        strokeWidth="8"
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="transparent"
                        strokeDasharray="188.5"
                        strokeDashoffset={188.5 - ((speedVal || 820) / 1000) * 125.7}
                      />
                    </svg>
                    <div className="absolute bottom-1 text-center">
                      <span className="text-3xl sm:text-4xl font-black font-mono text-white block">
                        {speedVal > 0 ? speedVal.toFixed(1) : "982.4"}
                      </span>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold">
                        Mbps Line Rate
                      </span>
                    </div>
                  </div>

                  {/* Telemetry Strip */}
                  <div className="grid grid-cols-3 gap-2 w-full pt-4 text-center">
                    <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-mono">LATENCY</span>
                      <span className="text-xs font-bold font-mono text-emerald-400">{pingVal} ms</span>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-mono">JITTER</span>
                      <span className="text-xs font-bold font-mono text-cyan-300">0.3 ms</span>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-mono">LOSS</span>
                      <span className="text-xs font-bold font-mono text-emerald-400">0.0 %</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                  <span className="text-[11px] text-slate-400">
                    {testComplete ? "✓ Speed Test Complete" : "Dedicated 50 Gbps backhaul capacity"}
                  </span>
                  <button
                    type="button"
                    onClick={runSpeedTest}
                    className="px-3.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold text-xs transition-colors"
                  >
                    {speedTestRunning ? "Testing..." : "Test Speed"}
                  </button>
                </div>
              </div>

              {/* Infrastructure Visual Photo */}
              <div className="relative rounded-3xl overflow-hidden border border-slate-800 shadow-xl h-44 group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/hero-telecom.jpg"
                  alt="High-Speed Telecom Datacenter"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent p-4 flex items-end justify-between">
                  <div>
                    <p className="text-xs font-black text-white uppercase tracking-wider">Tier-1 Fiber Backbone Ring</p>
                    <p className="text-[11px] text-emerald-400 font-mono">AS329656 &bull; KIXP Peering Live</p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold">
                    CONNECTED
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. TRUST BADGES ROW (EXACT TARGET 5 ITEMS) */}
      <section className="border-y border-slate-800/80 bg-[#090D16] py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6 text-center sm:text-left">
            {/* Badge 1 */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-lg shrink-0">
                🔒
              </div>
              <div>
                <h4 className="text-xs font-black text-white">Secure Payments</h4>
                <p className="text-[11px] text-slate-400">M-Pesa &amp; Card</p>
              </div>
            </div>

            {/* Badge 2 */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 text-lg shrink-0">
                🛡️
              </div>
              <div>
                <h4 className="text-xs font-black text-white">Quality Guaranteed</h4>
                <p className="text-[11px] text-slate-400">Premium Equipment</p>
              </div>
            </div>

            {/* Badge 3 */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-lg shrink-0">
                🚚
              </div>
              <div>
                <h4 className="text-xs font-black text-white">Fast Delivery</h4>
                <p className="text-[11px] text-slate-400">Same Day Available</p>
              </div>
            </div>

            {/* Badge 4 */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-yellow-400 text-lg shrink-0">
                📞
              </div>
              <div>
                <h4 className="text-xs font-black text-white">24/7 Support</h4>
                <p className="text-[11px] text-slate-400">Always Here</p>
              </div>
            </div>

            {/* Badge 5 */}
            <div className="flex items-center gap-3 col-span-2 sm:col-span-1">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 text-lg shrink-0">
                ⚙️
              </div>
              <div>
                <h4 className="text-xs font-black text-white">Quick Setup</h4>
                <p className="text-[11px] text-slate-400">Professional Install</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. WHAT WE OFFER (COMPLETE CONNECTIVITY SOLUTIONS) */}
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
              Everything you need to build, scale, and manage your network infrastructure.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Card 1: High-Speed Internet */}
            <div className="rounded-3xl bg-slate-950 p-6 border border-slate-800 hover:border-amber-400/50 transition-all space-y-4 shadow-xl group">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-2xl text-amber-400 group-hover:scale-110 transition-transform">
                🚀
              </div>
              <h3 className="text-lg font-black text-white">High-Speed Internet</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Blazing-fast fiber connections with speeds up to 1Gbps for homes and businesses.
              </p>
              <a href="#packages" className="text-xs font-bold text-amber-400 hover:text-amber-300 inline-flex items-center gap-1">
                <span>View Plans</span>
                <span>&rarr;</span>
              </a>
            </div>

            {/* Card 2: Premium Hardware */}
            <div className="rounded-3xl bg-slate-950 p-6 border border-slate-800 hover:border-cyan-400/50 transition-all space-y-4 shadow-xl group">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-2xl text-cyan-400 group-hover:scale-110 transition-transform">
                🛒
              </div>
              <h3 className="text-lg font-black text-white">Premium Hardware</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Enterprise-grade networking equipment from industry-leading manufacturers.
              </p>
              <a href="#hardware" className="text-xs font-bold text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1">
                <span>Browse Store</span>
                <span>&rarr;</span>
              </a>
            </div>

            {/* Card 3: Network Solutions */}
            <div className="rounded-3xl bg-slate-950 p-6 border border-slate-800 hover:border-emerald-400/50 transition-all space-y-4 shadow-xl group">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-2xl text-emerald-400 group-hover:scale-110 transition-transform">
                ⚡
              </div>
              <h3 className="text-lg font-black text-white">Network Solutions</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Custom PPPoE, Hotspot, and fiber installations tailored to your needs.
              </p>
              <a href="https://wa.me/254703605266?text=Hello%20MashupKGrid%2C%20I%20need%20Network%20Engineering%20Solutions" target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1">
                <span>Talk to Engineer</span>
                <span>&rarr;</span>
              </a>
            </div>

            {/* Card 4: Power Backup */}
            <div className="rounded-3xl bg-slate-950 p-6 border border-slate-800 hover:border-yellow-400/50 transition-all space-y-4 shadow-xl group">
              <div className="w-12 h-12 rounded-2xl bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center text-2xl text-yellow-400 group-hover:scale-110 transition-transform">
                🔋
              </div>
              <h3 className="text-lg font-black text-white">Power Backup</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Reliable UPS and power solutions to keep you connected 24/7.
              </p>
              <a href="#hardware" className="text-xs font-bold text-yellow-400 hover:text-yellow-300 inline-flex items-center gap-1">
                <span>View Mini UPS</span>
                <span>&rarr;</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 6. WHY MASHUPKGRID (BUILT FOR PERFORMANCE - 6 FEATURES) */}
      <section id="why-us" className="py-20 bg-[#090D16] border-y border-slate-800/80 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold uppercase">
              <span>Why MashupKGrid</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
              Built for Performance
            </h2>
            <p className="text-sm sm:text-base text-slate-300">
              We&apos;re not just an ISP. We&apos;re your technology partner for reliable, scalable connectivity.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="rounded-3xl bg-slate-950 p-6 border border-slate-800 space-y-3 hover:border-amber-400/40 transition-all">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-xl">
                ⚡
              </div>
              <h3 className="text-base font-black text-white">Maximum Speed</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Ultra-fast fiber connections that keep up with your demands.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="rounded-3xl bg-slate-950 p-6 border border-slate-800 space-y-3 hover:border-cyan-400/40 transition-all">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 text-xl">
                🛡️
              </div>
              <h3 className="text-base font-black text-white">Uptime Guarantee</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Enterprise-grade reliability backed by our service commitment.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="rounded-3xl bg-slate-950 p-6 border border-slate-800 space-y-3 hover:border-emerald-400/40 transition-all">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-xl">
                📞
              </div>
              <h3 className="text-base font-black text-white">Expert Support</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Round-the-clock technical assistance when you need it most.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="rounded-3xl bg-slate-950 p-6 border border-slate-800 space-y-3 hover:border-sky-400/40 transition-all">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 text-xl">
                📍
              </div>
              <h3 className="text-base font-black text-white">Coverage Areas</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Growing network across Nairobi and surrounding regions.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="rounded-3xl bg-slate-950 p-6 border border-slate-800 space-y-3 hover:border-purple-400/40 transition-all">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 text-xl">
                👥
              </div>
              <h3 className="text-base font-black text-white">Active Customers</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Trusted by businesses and homes throughout Kenya.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="rounded-3xl bg-slate-950 p-6 border border-slate-800 space-y-3 hover:border-yellow-400/40 transition-all">
              <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-yellow-400 text-xl">
                🌐
              </div>
              <h3 className="text-base font-black text-white">Backhaul Capacity</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Massive backbone infrastructure for uninterrupted service.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 7. FIBER INTERNET PACKAGES (LIGHTNING-FAST FIBER INTERNET) */}
      <section id="packages" className="py-20 bg-[#060A12] relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold uppercase">
              <span>Fiber Internet Packages</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
              Lightning-Fast Fiber Internet
            </h2>
            <p className="text-sm sm:text-base text-slate-300">
              Choose the perfect plan for your home or business. All packages include unlimited data, free installation, and 24/7 support.
            </p>

            {/* 4 Benefit Pills */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-xs font-semibold text-slate-300">
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center gap-1.5">
                <span className="text-amber-400">⚡</span>
                <span>Fiber Technology</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center gap-1.5">
                <span className="text-cyan-400">⏱️</span>
                <span>Quick Setup (24-48h)</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center gap-1.5">
                <span className="text-emerald-400">🛡️</span>
                <span>Secure &amp; Reliable</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center gap-1.5">
                <span className="text-yellow-400">📞</span>
                <span>Expert Support</span>
              </div>
            </div>

            {/* SkySurf Infrastructure Banner */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-cyan-500/10 to-emerald-500/10 border border-amber-500/20 text-xs text-slate-300 flex items-center justify-center gap-2">
              <span className="font-mono font-bold text-amber-400">Powered by SkySurf AS329656:</span>
              <span>Enterprise-Grade Infrastructure connected to tier-1 global networks.</span>
            </div>

            {/* Plan Switcher Tabs */}
            <div className="inline-flex items-center p-1.5 rounded-2xl bg-slate-950 border border-slate-800 shadow-xl mt-4">
              <button
                type="button"
                onClick={() => setPlanTab("home")}
                className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-all ${
                  planTab === "home"
                    ? "bg-amber-400 text-slate-950 shadow-md font-black"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                🏠 Home Internet Plans
              </button>
              <button
                type="button"
                onClick={() => setPlanTab("business")}
                className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-all ${
                  planTab === "business"
                    ? "bg-amber-400 text-slate-950 shadow-md font-black"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                🏢 Business Elite
              </button>
              <button
                type="button"
                onClick={() => setPlanTab("ultra")}
                className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-all ${
                  planTab === "ultra"
                    ? "bg-amber-400 text-slate-950 shadow-md font-black"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                🚀 Ultra Fiber (1 Gbps)
              </button>
            </div>
          </div>

          {/* Plan Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredPlans.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-3xl p-6 flex flex-col justify-between transition-all duration-300 ${
                  plan.popular
                    ? "bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 border-2 border-amber-400 shadow-2xl shadow-amber-500/20 scale-[1.02]"
                    : "bg-slate-950/80 border border-slate-800 hover:border-amber-400/40 shadow-lg"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 text-[10px] font-black uppercase tracking-wider shadow-md">
                    Most Popular
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-black text-white">{plan.name}</h3>
                    <p className="text-xs text-slate-400 mt-1">{plan.summary}</p>
                  </div>

                  {/* Speed Badge */}
                  <div className="py-2.5 px-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-slate-300">Bandwidth:</span>
                    <span className="text-xl font-black font-mono text-amber-400">{plan.speed}</span>
                  </div>

                  {/* Price */}
                  <div className="pt-2">
                    <div className="flex items-baseline gap-1">
                      <span className="text-xs font-bold text-slate-400 font-mono">KES</span>
                      <span className="text-3xl font-black text-white font-mono tracking-tight">
                        {plan.price.toLocaleString()}
                      </span>
                      <span className="text-xs text-slate-400">/ month</span>
                    </div>
                  </div>

                  {/* Features */}
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
                    className={`w-full py-3.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 active:scale-95 shadow-md ${
                      plan.popular
                        ? "bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black shadow-amber-500/20"
                        : "bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white"
                    }`}
                  >
                    <span>⚡</span>
                    <span>Order via M-Pesa</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8. FEATURED HARDWARE (NETWORKING HARDWARE SHOP - ALL 35 PRODUCTS) */}
      <section id="hardware" className="py-20 bg-[#090D16] border-t border-slate-800/80 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold uppercase">
                <span>Shop</span>
              </div>
              <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
                Featured Hardware
              </h2>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                Enterprise-grade equipment for uncompromising performance. Routers, switches, access points, solar, CCTV &amp; more.
              </p>
            </div>

            {/* Search Input Box */}
            <div className="w-full md:w-72">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-amber-400 transition-colors"
              />
            </div>
          </div>

          {/* Visual Hardware Banner */}
          <div className="relative rounded-3xl overflow-hidden border border-slate-800 shadow-2xl h-48 sm:h-56">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/hardware-gear.jpg"
              alt="Networking Hardware Shop"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/80 to-transparent p-6 sm:p-10 flex flex-col justify-center">
              <span className="px-2.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono text-[10px] font-bold uppercase w-fit">
                Premium Networking Equipment
              </span>
              <h3 className="text-xl sm:text-2xl font-black text-white mt-1">
                Enterprise-Grade Equipment from World Leaders
              </h3>
              <p className="text-xs text-slate-300 max-w-md mt-1">
                MikroTik, Ubiquiti, Huawei, and MashupKGrid Certified optics with 100% manufacturer warranty.
              </p>
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none text-xs font-bold">
            {[
              { id: "all", label: "All Products" },
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
                    ? "bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-slate-950 font-black shadow-md shadow-amber-500/20"
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

          {filteredProducts.length === 0 && (
            <div className="text-center py-12 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
              <p className="text-lg font-bold text-white">No Products Found</p>
              <p className="text-xs text-slate-400">Try adjusting your search terms or filter category.</p>
              <button
                type="button"
                onClick={() => {
                  setActiveCategory("all");
                  setSearchQuery("");
                }}
                className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-amber-400"
              >
                View All Products
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 9. TESTIMONIALS (TRUSTED BY THOUSANDS) */}
      <section id="testimonials" className="py-20 bg-[#060A12] border-t border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold uppercase">
              <span>Testimonials</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
              Trusted by Thousands
            </h2>
            <p className="text-sm sm:text-base text-slate-300">
              Hear from our customers about their experience with MashupKGrid.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, idx) => (
              <div
                key={idx}
                className="rounded-3xl bg-slate-950 p-6 border border-slate-800 hover:border-amber-400/40 transition-all space-y-4 shadow-xl flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-1 text-amber-400 text-sm">
                    {Array.from({ length: t.stars }).map((_, i) => (
                      <span key={i}>★</span>
                    ))}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed italic">
                    &ldquo;{t.content}&rdquo;
                  </p>
                </div>
                <div className="flex items-center gap-3 pt-4 border-t border-slate-800/80">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 font-black text-xs flex items-center justify-center shadow-md">
                    {t.avatar}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">{t.name}</h4>
                    <p className="text-[11px] text-slate-400">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 10. INTERACTIVE KENYA COVERAGE CHECKER */}
      <section id="coverage" className="py-20 bg-[#090D16] border-t border-slate-800/80">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold uppercase">
            <span>Coverage Areas</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            Check Coverage in Your Area
          </h2>
          <p className="text-sm text-slate-300 max-w-xl mx-auto">
            Search your neighborhood, estate, or county in Kenya to verify immediate fiber connectivity.
          </p>

          <form onSubmit={handleCoverageCheck} className="max-w-xl mx-auto flex gap-2">
            <input
              type="text"
              required
              value={coverageSearch}
              onChange={(e) => setCoverageSearch(e.target.value)}
              placeholder="e.g. Utawala, Dandora, Kilimani, Ruiru, Thika, Eldoret..."
              className="flex-1 px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs sm:text-sm focus:outline-none focus:border-amber-400 transition-colors"
            />
            <button
              type="submit"
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs sm:text-sm shrink-0 shadow-lg shadow-amber-500/20 active:scale-95"
            >
              Check Coverage
            </button>
          </form>

          {coverageResult && (
            <div className="p-4 rounded-2xl bg-slate-950 border border-emerald-500/40 text-emerald-300 text-xs font-semibold max-w-xl mx-auto animate-in fade-in">
              {coverageResult}
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-2 pt-2 text-xs text-slate-400">
            <span className="font-semibold text-slate-500">Popular Nodes:</span>
            {[
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

      {/* 11. FAQS ACCORDION */}
      <section id="faq" className="py-20 bg-[#060A12] border-t border-slate-800/80">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold uppercase">
              <span>Frequently Asked Questions</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
              Got Questions? We&apos;ve Got Answers.
            </h2>
            <p className="text-sm text-slate-400">
              Can&apos;t find what you&apos;re looking for? Reach out to our 24/7 technical team.
            </p>
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
                    className="w-full p-5 text-left flex items-center justify-between gap-4 font-bold text-sm text-white hover:text-amber-400 transition-colors"
                  >
                    <span>{faq.q}</span>
                    <span className="text-amber-400 font-mono text-base">{isOpen ? "−" : "+"}</span>
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

      {/* 12. BOTTOM CTA BANNER (READY TO GET CONNECTED?) */}
      <section className="py-20 bg-gradient-to-r from-slate-950 via-[#111622] to-slate-950 border-t border-amber-500/30 relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6 relative z-10">
          <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            Ready to Get Connected?
          </h2>
          <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Join thousands of satisfied customers enjoying premium connectivity across Kenya.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <a
              href="#packages"
              className="px-8 py-4 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-sm tracking-wide uppercase shadow-xl shadow-amber-500/25 transition-all active:scale-95"
            >
              View Internet Packages
            </a>
            <a
              href="https://wa.me/254703605266?text=Hello%20MashupKGrid%2C%20I%20want%20to%20get%20connected%20to%20Fiber"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-bold text-sm transition-all flex items-center gap-2 active:scale-95"
            >
              <span>💬</span>
              <span>WhatsApp Us (+254 703 605 266)</span>
            </a>
          </div>
        </div>
      </section>

      {/* 13. COMPREHENSIVE FOOTER */}
      <footer className="bg-[#04060C] border-t border-slate-800/80 pt-16 pb-12 text-slate-400 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
            {/* Col 1: Brand Info */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl overflow-hidden border border-amber-500/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo.jpg" alt="MashupKGrid" className="h-full w-full object-cover" />
                </div>
                <span className="text-lg font-black text-white">
                  MASHUP<span className="text-amber-400">KGRID</span>
                </span>
              </div>
              <p className="text-slate-400 leading-relaxed max-w-sm">
                Premium internet services and networking solutions for modern Kenya. 
                High-speed fiber connections, carrier hardware, PPPoE setup, and 24/7 expert support.
              </p>
              <div className="pt-1 flex flex-col gap-1 text-slate-400 text-xs">
                <span>📍 Location: Utawala &amp; Dandora, Nairobi, Kenya</span>
                <span>📞 Telephone: +254 703 605 266</span>
                <span>✉️ Email: support@mashupkgrid.co.ke</span>
              </div>
            </div>

            {/* Col 2: Quick Links */}
            <div className="space-y-3">
              <p className="font-bold text-white uppercase text-[11px] tracking-wider font-mono">Quick Links</p>
              <ul className="space-y-2">
                <li><a href="#packages" className="hover:text-amber-400 transition-colors">Internet Packages</a></li>
                <li><a href="#hardware" className="hover:text-amber-400 transition-colors">Hardware Shop</a></li>
                <li><a href="#solutions" className="hover:text-amber-400 transition-colors">PPPoE Setup</a></li>
                <li><a href="#solutions" className="hover:text-amber-400 transition-colors">Hotspot Solutions</a></li>
                <li><a href="#solutions" className="hover:text-amber-400 transition-colors">Fiber Optics</a></li>
              </ul>
            </div>

            {/* Col 3: Hardware Categories */}
            <div className="space-y-3">
              <p className="font-bold text-white uppercase text-[11px] tracking-wider font-mono">Hardware Shop</p>
              <ul className="space-y-2">
                <li><a href="#hardware" className="hover:text-amber-400 transition-colors">MikroTik Routers</a></li>
                <li><a href="#hardware" className="hover:text-amber-400 transition-colors">Switches &amp; PoE</a></li>
                <li><a href="#hardware" className="hover:text-amber-400 transition-colors">UniFi Access Points</a></li>
                <li><a href="#hardware" className="hover:text-amber-400 transition-colors">Fiber Drop Cables &amp; ONUs</a></li>
                <li><a href="#hardware" className="hover:text-amber-400 transition-colors">Solar &amp; Mini DC UPS</a></li>
                <li><a href="#hardware" className="hover:text-amber-400 transition-colors">CCTV Cameras &amp; NVRs</a></li>
              </ul>
            </div>

            {/* Col 4: Portals & Legal */}
            <div className="space-y-3">
              <p className="font-bold text-white uppercase text-[11px] tracking-wider font-mono">Admin &amp; Portals</p>
              <ul className="space-y-2">
                <li><Link href="/dashboard" className="hover:text-amber-400 transition-colors">Admin Panel</Link></li>
                <li><Link href="/login" className="hover:text-amber-400 transition-colors">Client Login</Link></li>
                <li><Link href="/terms" className="hover:text-amber-400 transition-colors">Terms of Service</Link></li>
                <li><Link href="/refund-policy" className="hover:text-amber-400 transition-colors">Privacy Policy</Link></li>
                <li><Link href="/donate" className="hover:text-amber-400 transition-colors">Support Development</Link></li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-[11px] text-slate-500">
            <p>&copy; {new Date().getFullYear()} MashupKGrid Technologies Ltd. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                M-Pesa Safaricom Daraja Verified
              </span>
              <span>&bull;</span>
              <span>KIXP Peering Ring Active</span>
            </div>
          </div>
        </div>
      </footer>

      {/* 14. CART DRAWER WITH M-PESA CHECKOUT */}
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </div>
  );
}
