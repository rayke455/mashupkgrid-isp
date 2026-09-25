"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { type HardwareProduct, getProducts, useCart } from "@/lib/hardware-store";
import { useAuth } from "@/lib/auth-context";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { HardwareProductCard } from "@/components/store/hardware-product-card";
import { ProductDetailModal } from "@/components/store/product-detail-modal";
import { CartDrawer } from "@/components/store/cart-drawer";

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "routers", label: "Routers" },
  { id: "switches", label: "Switches" },
  { id: "wireless", label: "Wireless & access points" },
  { id: "fiber", label: "Fibre & cables" },
  { id: "solar", label: "Solar & UPS" },
  { id: "cctv", label: "CCTV" },
];

export default function ShopPage() {
  const { user } = useAuth();
  const isSuperAdmin = Boolean(user && !user.tenantId);
  const { itemCount } = useCart();

  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [brand, setBrand] = useState("all");
  const [products, setProducts] = useState<HardwareProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [detail, setDetail] = useState<HardwareProduct | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    getProducts(category, debounced)
      .then((data) => !cancelled && setProducts(data))
      .catch(() => !cancelled && setLoadError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [category, debounced]);

  const brands = ["all", ...Array.from(new Set(products.map((p) => p.brand))).sort()];
  const shown = brand === "all" ? products : products.filter((p) => p.brand === brand);

  return (
    <div className="force-light flex min-h-screen flex-col bg-white text-slate-900 antialiased">
      <SiteHeader />

      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <p className="hidden shrink-0 text-sm font-semibold text-slate-950 sm:block">Hardware store</p>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search routers, access points, cables…"
            aria-label="Search the store"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 sm:max-w-md"
          />
          <Link href="/track" className="hidden shrink-0 text-sm font-medium text-slate-600 hover:text-slate-950 md:block">
            Track an order
          </Link>
          {isSuperAdmin && (
            <Link href="/admin/products" className="hidden shrink-0 text-sm font-medium text-slate-600 hover:text-slate-950 md:block">
              Edit catalogue
            </Link>
          )}
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="relative shrink-0 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Cart
            {itemCount > 0 && (
              <span className="ml-2 inline-flex min-w-[20px] items-center justify-center rounded-full bg-white px-1.5 text-xs font-semibold text-slate-900">
                {itemCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Hardware for your network</h1>
          <p className="mt-3 text-base leading-7 text-slate-600">
            MikroTik routers, access points, fibre, cabling and power for ISPs and hotspots. Pay with M-Pesa at checkout, or when your order
            arrives.
          </p>
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-700">
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="text-emerald-600">
                ✓
              </span>
              Same-day delivery in Nairobi
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="text-emerald-600">
                ✓
              </span>
              Pay on delivery available
            </li>
          </ul>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1" role="tablist" aria-label="Categories">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={category === c.id}
                onClick={() => {
                  setCategory(c.id);
                  setBrand("all");
                }}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  category === c.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          {brands.length > 2 && (
            <label className="flex shrink-0 items-center gap-2 text-sm text-slate-600">
              Brand
              <select value={brand} onChange={(e) => setBrand(e.target.value)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900">
                {brands.map((b) => (
                  <option key={b} value={b}>
                    {b === "all" ? "All brands" : b}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="mt-6">
          {loading ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="h-80 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : loadError ? (
            <div className="rounded-2xl border border-slate-200 px-6 py-16 text-center">
              <p className="font-medium text-slate-900">The store couldn&apos;t load right now</p>
              <p className="mt-1 text-sm text-slate-500">Check your connection and try again in a moment.</p>
            </div>
          ) : shown.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 px-6 py-16 text-center">
              <p className="font-medium text-slate-900">Nothing matches that</p>
              <p className="mt-1 text-sm text-slate-500">Try another search or category.</p>
              <button
                type="button"
                onClick={() => {
                  setCategory("all");
                  setSearch("");
                  setBrand("all");
                }}
                className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Show everything
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shown.map((p) => (
                <HardwareProductCard key={p.id} product={p} onViewDetails={setDetail} onBuyNow={() => setCartOpen(true)} />
              ))}
            </div>
          )}
        </div>
      </main>

      <SiteFooter />

      <ProductDetailModal
        product={detail}
        onClose={() => setDetail(null)}
        onBuyNow={() => {
          setDetail(null);
          setCartOpen(true);
        }}
      />
      <CartDrawer isOpen={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
}
