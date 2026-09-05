"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { HardwareProduct, getProducts, useCart } from "@/lib/hardware-store";
import { HardwareProductCard } from "@/components/store/hardware-product-card";
import { CartDrawer } from "@/components/store/cart-drawer";
import { useAuth } from "@/lib/auth-context";

const CATEGORIES = [
  { id: "all", label: "All Hardware", icon: "📦" },
  { id: "routers", label: "Routers & ONUs", icon: "🔀" },
  { id: "switches", label: "Switches", icon: "⚡" },
  { id: "wireless", label: "Wireless & APs", icon: "🌐" },
  { id: "fiber", label: "Fiber & Cables", icon: "🧵" },
  { id: "solar", label: "Solar & UPS", icon: "☀️" },
  { id: "cctv", label: "CCTV & Security", icon: "📹" },
];

export default function ShopPage() {
  const { user } = useAuth();
  const isSuperAdmin = !!user && !user.tenantId;

  const { itemCount } = useCart();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [products, setProducts] = useState<HardwareProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("all");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await getProducts(selectedCategory, searchQuery);
        setProducts(data);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [selectedCategory, searchQuery]);

  const brands = ["all", ...Array.from(new Set(products.map((p) => p.brand)))];

  const displayedProducts =
    selectedBrand === "all"
      ? products
      : products.filter((p) => p.brand.toLowerCase() === selectedBrand.toLowerCase());

  return (
    <div className="min-h-screen bg-[#060913] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Top Notification Banner */}
      <div className="bg-gradient-to-r from-emerald-600 via-cyan-600 to-blue-600 text-slate-950 text-xs font-black py-2 px-4 text-center tracking-wide flex items-center justify-center gap-3">
        <span>⚡ KENYA COUNTRYWIDE DISPATCH</span>
        <span className="hidden sm:inline">•</span>
        <span className="hidden sm:inline font-semibold">Same-day delivery in Nairobi & 24hr Courier Countrywide via Fargo & G4S</span>
        <span className="hidden md:inline">• Pay on Delivery with Safaricom M-Pesa</span>
      </div>

      {/* Navigation Header */}
      <header className="sticky top-0 z-40 bg-[#090D16]/90 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-emerald-400 p-0.5 shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform">
                <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center text-cyan-400 font-black text-lg">
                  M
                </div>
              </div>
              <div>
                <span className="text-lg font-black tracking-tight text-white group-hover:text-cyan-400 transition-colors">
                  MASHUP<span className="text-cyan-400">STORE</span>
                </span>
                <span className="hidden sm:inline-block ml-2 px-1.5 py-0.2 rounded bg-cyan-500/10 border border-cyan-500/30 text-[10px] font-bold text-cyan-400">
                  Carrier Hardware
                </span>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-5 text-xs font-semibold text-slate-400">
              <Link href="/" className="hover:text-cyan-400 transition-colors">Home</Link>
              <Link href="/#packages" className="hover:text-cyan-400 transition-colors">Fiber Packages</Link>
              <Link href="/shop" className="text-cyan-400 transition-colors">Hardware Shop</Link>
              <Link href="/#workflow" className="hover:text-cyan-400 transition-colors">How It Works</Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {isSuperAdmin && (
              <Link
                href="/admin/products"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold hover:bg-rose-500/20 transition-colors"
                title="Super Admin Price Management"
              >
                <span>✎</span> Update Prices
              </Link>
            )}

            {/* Cart Trigger */}
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-cyan-500/30 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-cyan-500/10"
            >
              <span>🛒</span>
              <span>Cart</span>
              {itemCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-cyan-500 text-slate-950 text-[10px] font-black">
                  {itemCount}
                </span>
              )}
            </button>

            <Link
              href="/login"
              className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors shadow-md shadow-cyan-500/20"
            >
              Portal Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Hero Section */}
        <div className="relative rounded-3xl bg-gradient-to-r from-slate-950 via-[#0a1224] to-slate-950 border border-cyan-500/20 p-8 sm:p-12 overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-bold">
              <span>🇰🇪</span> Kenya Carrier-Grade Telecom & Hardware Marketplace
            </div>
            <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-tight">
              Genuine MikroTik, Fiber & Solar Hardware.
            </h1>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Equip your ISP network, base station POP, or business hotspot with factory-sealed hardware. Pay instantly via Safaricom M-Pesa with automated receipts and same-day dispatch.
            </p>

            <div className="flex flex-wrap gap-4 pt-2 text-xs text-slate-400 font-medium">
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="text-emerald-400">✓</span> 100% Genuine Hardware
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="text-emerald-400">✓</span> 1-2 Year Warranty
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="text-emerald-400">✓</span> Safaricom STK Push
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="text-emerald-400">✓</span> Pre-configured with RouterOS
              </span>
            </div>
          </div>
        </div>

        {/* Search & Category Filter Bar */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative w-full sm:max-w-md">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
              <input
                type="text"
                placeholder="Search routers, switches, fiber cables, SFP, batteries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 shadow-inner"
              />
            </div>

            {/* Brand Pill Filter */}
            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
              <span className="text-xs text-slate-500 mr-1 shrink-0">Brand:</span>
              {brands.map((b) => (
                <button
                  key={b}
                  onClick={() => setSelectedBrand(b)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold capitalize transition-colors shrink-0 ${
                    selectedBrand.toLowerCase() === b.toLowerCase()
                      ? "bg-cyan-500 text-slate-950"
                      : "bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800"
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-800">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
                  selectedCategory === cat.id
                    ? "bg-gradient-to-r from-cyan-500 to-emerald-400 text-slate-950 shadow-lg shadow-cyan-500/20"
                    : "bg-slate-900/80 hover:bg-slate-800 text-slate-400 border border-slate-800"
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        <div>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 py-12">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div
                  key={i}
                  className="h-80 rounded-2xl bg-slate-950 border border-slate-800 animate-pulse"
                />
              ))}
            </div>
          ) : displayedProducts.length === 0 ? (
            <div className="text-center py-20 bg-slate-950/60 rounded-3xl border border-slate-800 space-y-3">
              <div className="text-4xl">🔍</div>
              <p className="text-base font-bold text-white">No products found matching your search</p>
              <p className="text-xs text-slate-400">
                Try selecting &quot;All Hardware&quot; or searching for a different keyword.
              </p>
              <button
                onClick={() => {
                  setSelectedCategory("all");
                  setSearchQuery("");
                  setSelectedBrand("all");
                }}
                className="mt-2 px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs"
              >
                Reset All Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {displayedProducts.map((product) => (
                <HardwareProductCard
                  key={product.id}
                  product={product}
                  onQuickBuy={() => setIsCartOpen(true)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Cart Drawer */}
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />

      {/* Footer */}
      <footer className="mt-16 border-t border-slate-800/80 bg-slate-950 py-8 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} MASHUPKGRID Technologies Ltd. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <span>Safaricom M-Pesa Authorized</span>
            <span>•</span>
            <span>MikroTik Certified Hardware</span>
            <span>•</span>
            <Link href="/" className="hover:text-cyan-400">Back to Main Website</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
