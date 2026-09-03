"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { HardwareProduct, getProducts } from "@/lib/hardware-store";
import { HardwareProductCard } from "@/components/store/hardware-product-card";

const FIBER_PACKAGES = {
  home: [
    {
      name: "Starter Home Fiber",
      speed: "20 Mbps",
      price: 2000,
      period: "per month",
      badge: "Value Pick",
      description: "Fast, reliable unlimited fiber for family streaming, YouTube in 4K, and social browsing.",
      features: [
        "Unlimited High-Speed Fiber",
        "Free Dual-Band WiFi Router",
        "Free Installation & Cabling",
        "Standard 24/7 Customer Care",
        "Instant M-Pesa Renewal",
      ],
      popular: false,
    },
    {
      name: "Family Pro Fiber",
      speed: "50 Mbps",
      price: 3500,
      period: "per month",
      badge: "Most Popular",
      description: "Supercharged bandwidth for multiple concurrent 4K streams, remote work & gaming.",
      features: [
        "Unlimited Ultra-Fast Fiber",
        "Free High-Gain AC1200 Router",
        "Free Optical Drop Cable Installation",
        "Priority NOC Bandwidth Queue",
        "Zero Throttling (Fair Usage Free)",
      ],
      popular: true,
    },
    {
      name: "Ultra Stream Fiber",
      speed: "100 Mbps",
      price: 5500,
      period: "per month",
      badge: "Power Users",
      description: "Blazing 100Mbps line for smart homes, multi-device households, and high-bitrate uploads.",
      features: [
        "Symmetrical 100Mbps Upload/Download",
        "Free WiFi 6 Gigabit Router",
        "Same-Day Installation Guarantee",
        "Dedicated VIP WhatsApp Support",
        "Static IPv4 Address Available",
      ],
      popular: false,
    },
  ],
  business: [
    {
      name: "SME Dedicated Fiber",
      speed: "50 Mbps 1:1",
      price: 8000,
      period: "per month",
      badge: "Dedicated 1:1",
      description: "True 1:1 contention ratio for offices, cyber cafés, and retail locations.",
      features: [
        "1:1 Dedicated Symmetrical Speed",
        "99.9% Guaranteed Uptime SLA",
        "1 Free Public Static IPv4",
        "MikroTik RouterOS Pre-Configured",
        "4-Hour On-Site Support Response",
      ],
      popular: false,
    },
    {
      name: "Enterprise Dedicated Line",
      speed: "150 Mbps 1:1",
      price: 18000,
      period: "per month",
      badge: "Enterprise",
      description: "Enterprise leased line with dual redundant fiber rings and BGP multi-homing.",
      features: [
        "150 Mbps Clean Dedicated Pipe",
        "Sub-10ms Local Latency Guarantee",
        "/29 Subnet (5 Usable Public IPs)",
        "Dedicated NOC Engineer Assigned",
        "2-Hour Mean Time to Restore (MTTR)",
      ],
      popular: true,
    },
    {
      name: "Carrier Leased Fiber",
      speed: "500 Mbps 1:1",
      price: 45000,
      period: "per month",
      badge: "WISP & Carrier",
      description: "Direct Tier-1 carrier uplink engineered for local WISPs and residential fiber providers.",
      features: [
        "500 Mbps Uncompressed Capacity",
        "Direct KIXP Interconnect Peering",
        "BGP Routing with ASN Announcement",
        "Fiber Ring Auto-Failover (<50ms)",
        "24/7 Direct NOC Hot-Line",
      ],
      popular: false,
    },
  ],
};

const WORKFLOW_STEPS = [
  {
    num: "01",
    title: "Choose Fiber or Hardware",
    subtitle: "Select Your Deployment",
    desc: "Browse high-speed unlimited fiber packages for your home or office, or pick certified MikroTik routers, switches, fiber cables, and solar backup systems from our store.",
    icon: "🛒",
    tag: "30-Sec Selection",
  },
  {
    num: "02",
    title: "Instant M-Pesa Checkout",
    subtitle: "Zero Hassle Payment",
    desc: "Pay seamlessly with Safaricom M-Pesa STK Push, Till, or Paybill. Receive instant automated SMS confirmation, KRA invoice, and live tracking receipt.",
    icon: "📱",
    tag: "Sub-Second STK",
  },
  {
    num: "03",
    title: "24h Dispatch or 1-Click Provisioning",
    subtitle: "Rapid Delivery & Setup",
    desc: "Hardware orders are dispatched from our Nairobi logistics hub same-day. Hotspot & PPPoE routers provision instantly using our automated 1-click cloud scripts.",
    icon: "🚚",
    tag: "Fast Turnaround",
  },
  {
    num: "04",
    title: "24/7 Carrier NOC Monitoring",
    subtitle: "Carrier-Grade Reliability",
    desc: "Your connection and routers remain safeguarded by automated link telemetry, continuous latency probing, and real-time FreeRADIUS authentication.",
    icon: "🛡️",
    tag: "99.9% Uptime SLA",
  },
];

const STORE_TABS = [
  { id: "all", label: "All Hardware" },
  { id: "routers", label: "Routers & ONUs" },
  { id: "switches", label: "Switches" },
  { id: "wireless", label: "Wireless APs" },
  { id: "fiber", label: "Fiber & Cables" },
  { id: "solar", label: "Solar Backup" },
];

export function WavecoreTelecomExperience({ onOpenCart }: { onOpenCart: () => void }) {
  const [fiberTab, setFiberTab] = useState<"home" | "business">("home");
  const [storeTab, setStoreTab] = useState("all");
  const [products, setProducts] = useState<HardwareProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [selectedPlanModal, setSelectedPlanModal] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoadingProducts(true);
      try {
        const data = await getProducts(storeTab);
        setProducts(data.slice(0, 8)); // show top 8 on landing page
      } finally {
        setLoadingProducts(false);
      }
    }
    load();
  }, [storeTab]);

  return (
    <div className="space-y-28">
      {/* SECTION 1: WaveCore Workflow ("How It Works") */}
      <section id="workflow" className="relative pt-12 scroll-mt-24">
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold uppercase tracking-wider">
            <span>⚡</span> WaveCore Automated Workflow
          </div>
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white">
            How WaveCore Delivers High-Speed Telecom
          </h2>
          <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
            From purchasing equipment to provisioning high-speed fiber across Kenya, our end-to-end workflow handles everything on automated autopilot.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {WORKFLOW_STEPS.map((step) => (
            <div
              key={step.num}
              className="relative p-6 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950 border border-slate-800/80 hover:border-cyan-500/40 transition-all duration-300 flex flex-col justify-between group shadow-xl hover:shadow-cyan-500/10"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-3xl font-black font-mono text-cyan-500/30 group-hover:text-cyan-400 transition-colors">
                    {step.num}
                  </span>
                  <span className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-xl">
                    {step.icon}
                  </span>
                </div>
                <div className="space-y-1.5 mb-3">
                  <span className="text-[10px] font-mono font-bold text-emerald-400 tracking-wider uppercase">
                    {step.tag}
                  </span>
                  <h3 className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors">
                    {step.title}
                  </h3>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{step.desc}</p>
              </div>

              <div className="mt-6 pt-3 border-t border-slate-800/80 flex items-center gap-2 text-[11px] text-slate-500 font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>{step.subtitle}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 2: Fiber Internet Packages */}
      <section id="packages" className="relative scroll-mt-24">
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold uppercase tracking-wider">
            <span>🌐</span> High-Speed Fiber Internet
          </div>
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white">
            Unlimited Fiber For Homes &amp; Enterprises
          </h2>
          <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
            Ultra-fast speeds with zero data caps, free high-performance WiFi routers, and instant automated M-Pesa renewals.
          </p>

          {/* Tab Switcher */}
          <div className="inline-flex p-1.5 rounded-2xl bg-slate-950 border border-slate-800/80 mt-4 shadow-xl">
            <button
              onClick={() => setFiberTab("home")}
              className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${
                fiberTab === "home"
                  ? "bg-gradient-to-r from-cyan-500 to-emerald-400 text-slate-950 shadow-md shadow-cyan-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              🏠 Home Fiber Packages
            </button>
            <button
              onClick={() => setFiberTab("business")}
              className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${
                fiberTab === "business"
                  ? "bg-gradient-to-r from-cyan-500 to-emerald-400 text-slate-950 shadow-md shadow-cyan-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              🏢 Dedicated Business Fiber
            </button>
          </div>
        </div>

        {/* Packages Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {FIBER_PACKAGES[fiberTab].map((pkg) => (
            <div
              key={pkg.name}
              className={`relative rounded-3xl p-8 flex flex-col justify-between transition-all duration-300 ${
                pkg.popular
                  ? "bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-cyan-400 shadow-2xl shadow-cyan-500/20 ring-1 ring-cyan-400/50"
                  : "bg-slate-950/80 border border-slate-800 hover:border-slate-700 shadow-xl"
              }`}
            >
              {pkg.badge && (
                <div className="absolute -top-3 left-8 px-3 py-0.5 rounded-full bg-cyan-500 text-slate-950 font-black text-[10px] tracking-wider uppercase shadow-md">
                  {pkg.badge}
                </div>
              )}

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-white">{pkg.name}</h3>
                  <p className="text-xs text-slate-400 mt-1">{pkg.description}</p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-400 block">Bandwidth Speed</span>
                    <span className="text-2xl font-black text-cyan-300 font-mono">{pkg.speed}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black text-white font-mono">
                      KES {pkg.price.toLocaleString()}
                    </span>
                    <span className="text-[11px] text-slate-400 block">{pkg.period}</span>
                  </div>
                </div>

                <ul className="space-y-3 text-xs text-slate-300">
                  {pkg.features.map((feat, idx) => (
                    <li key={idx} className="flex items-center gap-2.5">
                      <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-bold">
                        ✓
                      </span>
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-8">
                <button
                  onClick={() => setSelectedPlanModal(pkg.name)}
                  className={`w-full py-3.5 rounded-xl font-bold text-xs transition-all shadow-lg flex items-center justify-center gap-2 ${
                    pkg.popular
                      ? "bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 shadow-emerald-500/20"
                      : "bg-slate-900 hover:bg-slate-800 text-white border border-slate-700"
                  }`}
                >
                  <span>⚡</span> Order Package with M-Pesa
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 3: Hardware Store Showcase (Ecommerce on Landing Page) */}
      <section id="store" className="relative scroll-mt-24">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold uppercase tracking-wider">
              <span>🛒</span> WaveCore Hardware Store
            </div>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white">
              Carrier-Grade Hardware Store
            </h2>
            <p className="text-sm text-slate-400 max-w-xl">
              Equip your ISP with factory-certified MikroTik routers, Gigabit switches, outdoor fiber cables, and uninterruptible solar DC power.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/shop"
              className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-all shadow-lg shadow-cyan-500/20 flex items-center gap-2"
            >
              <span>Explore All Products in Store</span>
              <span>&rarr;</span>
            </Link>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 border-b border-slate-800">
          {STORE_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStoreTab(tab.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                storeTab === tab.id
                  ? "bg-gradient-to-r from-cyan-500 to-emerald-400 text-slate-950 shadow-md shadow-cyan-500/20"
                  : "bg-slate-900/80 hover:bg-slate-800 text-slate-400 border border-slate-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Product Cards */}
        {loadingProducts ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 py-8">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-80 rounded-2xl bg-slate-950 border border-slate-800 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {products.map((p) => (
              <HardwareProductCard key={p.id} product={p} onQuickBuy={onOpenCart} />
            ))}
          </div>
        )}
      </section>

      {/* SECTION 4: Kenya POP Coverage & SLA */}
      <section id="coverage" className="relative p-8 sm:p-12 rounded-3xl bg-slate-950 border border-slate-800/80 overflow-hidden shadow-2xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold uppercase">
              <span>🇰🇪</span> National Infrastructure
            </div>
            <h2 className="text-2xl sm:text-4xl font-black text-white">
              Carrier Telemetry &amp; Points of Presence Across Kenya
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              We operate high-capacity optical POPs across Nairobi, Kiambu, Machakos, Nakuru, Mombasa, Eldoret, and Kisumu, connected via direct fiber to the Kenya Internet Exchange Point (KIXP).
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-xl font-black text-cyan-400 font-mono">99.98%</span>
                <span className="text-xs text-slate-400 block">Carrier Core Uptime</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-xl font-black text-emerald-400 font-mono">&lt; 3.8ms</span>
                <span className="text-xs text-slate-400 block">Nairobi Metro Latency</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-xl font-black text-white font-mono">10 Gbps</span>
                <span className="text-xs text-slate-400 block">Redundant Fiber Ring</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-xl font-black text-amber-400 font-mono">24/7/365</span>
                <span className="text-xs text-slate-400 block">Active NOC Engineers</span>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-[#090D16] border border-cyan-500/30 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="font-bold text-sm text-white">Primary Carrier Backbone Nodes</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                All Systems Operational
              </span>
            </div>
            <div className="space-y-2.5 text-xs">
              {[
                { name: "Nairobi Central POP (KIXP Peering)", latency: "1.2ms", load: "34%" },
                { name: "Utawala & Dandora Distribution Node", latency: "2.8ms", load: "48%" },
                { name: "Mombasa Subsea Gateway Link", latency: "6.4ms", load: "29%" },
                { name: "Nakuru & Rift Valley Metro Ring", latency: "4.1ms", load: "41%" },
                { name: "Kisumu & Western Kenya Fiber Link", latency: "5.3ms", load: "38%" },
              ].map((pop, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-slate-200 font-medium">{pop.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px]">
                    <span className="text-cyan-400">{pop.latency}</span>
                    <span>Load: {pop.load}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Plan Order Modal */}
      {selectedPlanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-[#090D16] border border-cyan-500/30 rounded-2xl p-6 text-slate-100 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-base">Order {selectedPlanModal}</h3>
              <button onClick={() => setSelectedPlanModal(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <p className="text-xs text-slate-300">
              Enter your mobile number and service location. Our installations technician will activate your fiber connection within 24 hours.
            </p>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">M-Pesa Phone Number</label>
                <input
                  type="tel"
                  placeholder="0712345678"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Installation Building &amp; County</label>
                <input
                  type="text"
                  placeholder="e.g. Utawala, Nairobi"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
            <div className="pt-2">
              <button
                onClick={() => {
                  alert("Order request received! Our support team will call you within 15 minutes to schedule router installation.");
                  setSelectedPlanModal(null);
                }}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20"
              >
                Confirm Installation Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
