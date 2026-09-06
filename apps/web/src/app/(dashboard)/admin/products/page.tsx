"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  HardwareProduct,
  getProducts,
  updateProductPrice,
  updateProduct,
  createProduct,
  deleteProduct,
} from "@/lib/hardware-store";

const PRESET_IMAGES = [
  { label: "MikroTik hAP ax3 (WiFi 6)", url: "/products/mikrotik-hap-ax3.jpg" },
  { label: "MikroTik hAP ax2 (WiFi 6)", url: "/products/mikrotik-hap-ax2.jpg" },
  { label: "MikroTik hEX RB750Gr3", url: "/products/mikrotik-hex.jpg" },
  { label: "MikroTik RB5009UG+S+IN", url: "/products/mikrotik-rb5009.jpg" },
  { label: "MikroTik CCR2004-16G-2S+", url: "/products/mikrotik-ccr2004.jpg" },
  { label: "MikroTik CRS326-24G-2S+RM", url: "/products/mikrotik-crs326.jpg" },
  { label: "MikroTik CRS328-24P-4S+RM", url: "/products/mikrotik-crs328.jpg" },
  { label: "MikroTik cAP ax AP", url: "/products/mikrotik-cap-ax.jpg" },
  { label: "Ubiquiti UniFi 6 Pro", url: "/products/ubiquiti-unifi-6-pro.jpg" },
  { label: "Ubiquiti UniFi 6 Lite", url: "/products/ubiquiti-unifi-6-lite.jpg" },
  { label: "Ubiquiti LiteBeam 5AC Gen2", url: "/products/ubiquiti-litebeam-5ac.jpg" },
  { label: "Ubiquiti PowerBeam 5AC", url: "/products/ubiquiti-powerbeam-5ac.jpg" },
  { label: "Ubiquiti AC Mesh AP", url: "/products/ubiquiti-ac-mesh.jpg" },
  { label: "Huawei HG8310M Bridge ONU", url: "/products/huawei-hg8310m.jpg" },
  { label: "Huawei HG8546M Routing ONU", url: "/products/huawei-hg8546m.jpg" },
  { label: "HSGQ XPON Single-Port ONU", url: "/products/hsgq-xpon-onu.jpg" },
  { label: "Fiber Drop Cable 1000m Drum", url: "/products/fiber-drop-cable-1000m.jpg" },
  { label: "Cat6 Outdoor Cable 305m", url: "/products/cat6-cable-305m.jpg" },
  { label: "16-Core Fiber NAP Box", url: "/products/fiber-nap-box-16core.jpg" },
  { label: "Optical Power Meter & VFL Toolkit", url: "/products/optical-toolkit-opm-vfl.jpg" },
  { label: "LiFePO4 100Ah 12.8V Battery", url: "/products/lifepo4-battery-100ah.jpg" },
  { label: "Hybrid Solar Inverter 1kVA / 12V", url: "/products/hybrid-inverter-1kva.jpg" },
  { label: "Mini DC UPS 8800mAh", url: "/products/mini-dc-ups-8800.jpg" },
  { label: "Mini DC UPS 10400mAh", url: "/products/mini-dc-ups-10400.jpg" },
  { label: "Hikvision 2MP IP Bullet", url: "/products/hikvision-2mp-bullet.jpg" },
  { label: "Dahua 4MP Starlight Dome", url: "/products/dahua-4mp-dome.jpg" },
  { label: "8-Channel PoE NVR 4K", url: "/products/nvr-8ch-poe.jpg" },
  { label: "Custom External Image URL...", url: "" },
];

export default function AdminProductsPage() {
  const { user } = useAuth();
  const isSuperAdmin = !!user && !user.tenantId;

  const [products, setProducts] = useState<HardwareProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [newPriceValue, setNewPriceValue] = useState<string>("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [stockFilter, setStockFilter] = useState<"all" | "in" | "out">("all");

  // Add Product Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBrand, setNewBrand] = useState("MikroTik");
  const [newCategory, setNewCategory] = useState<HardwareProduct["category"]>("routers");
  const [newPrice, setNewPrice] = useState("");
  const [newOriginalPrice, setNewOriginalPrice] = useState("");
  const [newStock, setNewStock] = useState("15");
  const [newBadge, setNewBadge] = useState("");
  const [newShortDesc, setNewShortDesc] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newImageUrl, setNewImageUrl] = useState("/products/mikrotik-hap-ax3.jpg");
  const [newSpecs, setNewSpecs] = useState("Gigabit Ethernet\nDual Core CPU\nRouterOS L4");

  // Edit Product Modal state
  const [editingProduct, setEditingProduct] = useState<HardwareProduct | null>(null);
  const [editName, setEditName] = useState("");
  const [editBrand, setEditBrand] = useState("");
  const [editCategory, setEditCategory] = useState<HardwareProduct["category"]>("routers");
  const [editPrice, setEditPrice] = useState("");
  const [editOriginalPrice, setEditOriginalPrice] = useState("");
  const [editStock, setEditStock] = useState("");
  const [editBadge, setEditBadge] = useState("");
  const [editShortDesc, setEditShortDesc] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editSpecs, setEditSpecs] = useState("");

  const loadAllProducts = async () => {
    try {
      setLoading(true);
      const data = await getProducts();
      setProducts(data);
    } catch {
      setErrorMsg("Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllProducts();
  }, []);

  // Filtered list
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch =
        searchQuery === "" ||
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.id.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCat = selectedCategory === "all" || product.category === selectedCategory;

      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "in" && product.inStock) ||
        (stockFilter === "out" && !product.inStock);

      return matchesSearch && matchesCat && matchesStock;
    });
  }, [products, searchQuery, selectedCategory, stockFilter]);

  // Inventory stats
  const stats = useMemo(() => {
    const totalCount = products.length;
    const inStockCount = products.filter((p) => p.inStock).length;
    const outOfStockCount = totalCount - inStockCount;
    const totalInventoryValue = products.reduce(
      (acc, p) => acc + p.price * (p.stock || 0),
      0
    );
    return { totalCount, inStockCount, outOfStockCount, totalInventoryValue };
  }, [products]);

  const handleStartEditPrice = (product: HardwareProduct) => {
    setEditingPriceId(product.id);
    setNewPriceValue(product.price.toString());
  };

  const handleSavePrice = async (productId: string) => {
    const priceNum = parseFloat(newPriceValue);
    if (isNaN(priceNum) || priceNum <= 0) {
      setErrorMsg("Please enter a valid price greater than 0");
      return;
    }

    try {
      setSaveLoading(true);
      setErrorMsg(null);
      await updateProductPrice(productId, priceNum);
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, price: priceNum } : p))
      );
      setSuccessMsg(`Price updated successfully to KES ${priceNum.toLocaleString()}`);
      setEditingPriceId(null);
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update price";
      setErrorMsg(msg);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleToggleStock = async (product: HardwareProduct) => {
    const nextInStock = !product.inStock;
    try {
      await updateProduct(product.id, { inStock: nextInStock });
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, inStock: nextInStock } : p))
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to toggle stock status";
      setErrorMsg(msg);
    }
  };

  const handleDelete = async (productId: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;
    try {
      await deleteProduct(productId);
      setProducts((prev) => prev.filter((p) => p.id !== productId));
      setSuccessMsg(`Deleted ${name}`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete product";
      setErrorMsg(msg);
    }
  };

  const handleStartEditProduct = (product: HardwareProduct) => {
    setEditingProduct(product);
    setEditName(product.name);
    setEditBrand(product.brand);
    setEditCategory(product.category);
    setEditPrice(product.price.toString());
    setEditOriginalPrice(product.originalPrice ? product.originalPrice.toString() : "");
    setEditStock((product.stock || 0).toString());
    setEditBadge(product.badge || "");
    setEditShortDesc(product.shortDescription || "");
    setEditDesc(product.description || "");
    setEditImageUrl(product.imageUrl);
    setEditSpecs((product.specs || []).join("\n"));
  };

  const handleSaveEditedProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    const priceNum = parseFloat(editPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      setErrorMsg("Price must be a valid number greater than 0");
      return;
    }

    const origPriceNum = editOriginalPrice ? parseFloat(editOriginalPrice) : undefined;
    const stockNum = parseInt(editStock, 10) || 0;
    const specsList = editSpecs
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      setSaveLoading(true);
      setErrorMsg(null);

      const updated = await updateProduct(editingProduct.id, {
        name: editName.trim(),
        brand: editBrand.trim(),
        category: editCategory,
        price: priceNum,
        originalPrice: origPriceNum,
        stock: stockNum,
        inStock: stockNum > 0,
        badge: editBadge.trim() || undefined,
        shortDescription: editShortDesc.trim() || editName.trim(),
        description: editDesc.trim() || editShortDesc.trim(),
        imageUrl: editImageUrl.trim(),
        specs: specsList,
      });

      setProducts((prev) =>
        prev.map((p) => (p.id === editingProduct.id ? { ...p, ...updated } : p))
      );
      setEditingProduct(null);
      setSuccessMsg(`Product "${editName}" updated successfully!`);
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update product";
      setErrorMsg(msg);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const priceNum = parseFloat(newPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      setErrorMsg("Price must be a number greater than 0");
      return;
    }

    const origPriceNum = newOriginalPrice ? parseFloat(newOriginalPrice) : undefined;
    const stockNum = parseInt(newStock, 10) || 10;
    const specsList = newSpecs
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      setSaveLoading(true);
      const created = await createProduct({
        name: newName.trim(),
        brand: newBrand.trim(),
        category: newCategory,
        price: priceNum,
        originalPrice: origPriceNum,
        stock: stockNum,
        inStock: stockNum > 0,
        badge: newBadge.trim() || undefined,
        shortDescription: newShortDesc.trim() || newName.trim(),
        description: newDesc.trim() || newShortDesc.trim(),
        imageUrl: newImageUrl.trim(),
        specs: specsList,
        warranty: "1 Year Official Warranty",
        featured: false,
      });

      setProducts((prev) => [created, ...prev]);
      setShowAddModal(false);
      setSuccessMsg(`Product "${created.name}" created successfully at KES ${priceNum.toLocaleString()}!`);
      setNewName("");
      setNewPrice("");
      setNewOriginalPrice("");
      setNewShortDesc("");
      setNewDesc("");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create product";
      setErrorMsg(msg);
    } finally {
      setSaveLoading(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-2xl flex items-center justify-center mx-auto">
          🔒
        </div>
        <h2 className="text-2xl font-bold text-white">Super Administrator Access Required</h2>
        <p className="text-sm text-slate-400 max-w-lg mx-auto">
          You are signed in as a tenant account. Only platform Super Administrators are authorized to update product prices and configure inventory.
        </p>
        <div className="pt-2">
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm transition-colors"
          >
            <span>🛒</span> Go to Hardware Store
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[11px] font-extrabold uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30">
              Super Admin Exclusive
            </span>
            <span className="text-xs text-slate-400">• Store Inventory Authority</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            Hardware Products & Catalog Management
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure networking equipment, update selling prices in KES, manage stock quantities, and select authentic images.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/shop"
            target="_blank"
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors flex items-center gap-1.5"
          >
            <span>👁️</span> Preview Live Shop
          </Link>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-bold text-xs transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-1.5"
          >
            <span>+</span> Add New Product
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2 animate-in fade-in">
          <span>✓</span> {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2 animate-in fade-in">
          <span>⚠️</span> {errorMsg}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
          <div className="text-[11px] font-bold text-slate-400 uppercase">Total Catalog Items</div>
          <div className="text-2xl font-black text-white mt-1">{stats.totalCount}</div>
          <div className="text-[10px] text-cyan-400 mt-0.5">Across 6 hardware categories</div>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
          <div className="text-[11px] font-bold text-slate-400 uppercase">In-Stock Products</div>
          <div className="text-2xl font-black text-emerald-400 mt-1">{stats.inStockCount}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Ready for immediate dispatch</div>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
          <div className="text-[11px] font-bold text-slate-400 uppercase">Out of Stock</div>
          <div className={`text-2xl font-black mt-1 ${stats.outOfStockCount > 0 ? "text-rose-400" : "text-slate-400"}`}>
            {stats.outOfStockCount}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Requiring restocking</div>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
          <div className="text-[11px] font-bold text-slate-400 uppercase">Total Warehouse Value</div>
          <div className="text-2xl font-black text-cyan-300 mt-1">
            KES {stats.totalInventoryValue.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Evaluated at current retail prices</div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">🔍</span>
          <input
            type="text"
            placeholder="Search products by model, brand, or code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="all">All Categories</option>
            <option value="routers">Routers & ONUs</option>
            <option value="switches">Switches & Cloud Routers</option>
            <option value="wireless">Wireless & APs</option>
            <option value="fiber">Fiber & Cables</option>
            <option value="solar">Solar & Power</option>
            <option value="cctv">CCTV & Surveillance</option>
          </select>

          <select
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value as "all" | "in" | "out")}
            className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="all">All Stock Status</option>
            <option value="in">In Stock Only</option>
            <option value="out">Out of Stock Only</option>
          </select>

          {(searchQuery || selectedCategory !== "all" || stockFilter !== "all") && (
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("all");
                setStockFilter("all");
              }}
              className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 text-xs hover:text-white"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Products Table */}
      <div className="rounded-2xl bg-slate-950 border border-slate-800/80 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/90 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3.5 px-4">Product Details</th>
                <th className="py-3.5 px-3">Category</th>
                <th className="py-3.5 px-4 font-bold text-cyan-300">Price (KES)</th>
                <th className="py-3.5 px-3">Inventory</th>
                <th className="py-3.5 px-3">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-500">
                    Loading hardware catalog...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-500">
                    No products found matching your search.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-900/40 transition-colors">
                    {/* Details */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center p-1">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700 text-[10px] font-bold text-cyan-400 uppercase">
                              {product.brand}
                            </span>
                            {product.badge && (
                              <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-[10px] font-semibold text-emerald-400">
                                {product.badge}
                              </span>
                            )}
                          </div>
                          <p className="font-bold text-slate-200 mt-0.5 line-clamp-1">{product.name}</p>
                          <p className="text-[11px] text-slate-500 font-mono">{product.id}</p>
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-3.5 px-3">
                      <span className="capitalize px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
                        {product.category}
                      </span>
                    </td>

                    {/* Price with Quick Super Admin Edit */}
                    <td className="py-3.5 px-4 font-mono">
                      {editingPriceId === product.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            value={newPriceValue}
                            onChange={(e) => setNewPriceValue(e.target.value)}
                            className="w-24 px-2 py-1 bg-slate-900 border border-cyan-500 rounded text-xs text-cyan-300 focus:outline-none"
                            placeholder="Price"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSavePrice(product.id)}
                            disabled={saveLoading}
                            className="px-2 py-1 rounded bg-cyan-500 text-slate-950 font-bold text-[11px] hover:bg-cyan-400"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingPriceId(null)}
                            className="px-1.5 py-1 text-slate-400 hover:text-white text-[11px]"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 group/price">
                          <span className="text-sm font-bold text-cyan-300">
                            KES {product.price.toLocaleString()}
                          </span>
                          <button
                            onClick={() => handleStartEditPrice(product)}
                            className="opacity-60 group-hover/price:opacity-100 text-[11px] text-cyan-400 hover:underline"
                            title="Quick Edit Price"
                          >
                            ✎ Price
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Inventory */}
                    <td className="py-3.5 px-3">
                      <span className="font-semibold text-slate-200">{product.stock} units</span>
                    </td>

                    {/* Status Toggle */}
                    <td className="py-3.5 px-3">
                      <button
                        onClick={() => handleToggleStock(product)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                          product.inStock
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                            : "bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20"
                        }`}
                      >
                        {product.inStock ? "● In Stock" : "○ Out of Stock"}
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        onClick={() => handleStartEditProduct(product)}
                        className="text-[11px] text-cyan-400 hover:text-cyan-300 hover:underline font-bold"
                      >
                        Edit Details
                      </button>
                      <button
                        onClick={() => handleDelete(product.id, product.name)}
                        className="text-[11px] text-rose-400 hover:text-rose-300 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Product Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-2xl bg-[#090D16] border border-cyan-500/30 rounded-3xl p-6 text-slate-100 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-white">Edit Product Details</h3>
                <p className="text-xs text-slate-400 font-mono">{editingProduct.id}</p>
              </div>
              <button
                onClick={() => setEditingProduct(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditedProduct} className="space-y-4 pt-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Product Title *</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Brand *</label>
                  <input
                    type="text"
                    required
                    value={editBrand}
                    onChange={(e) => setEditBrand(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Category *</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as HardwareProduct["category"])}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="routers">Routers & ONUs</option>
                    <option value="switches">Switches & Cloud Routers</option>
                    <option value="wireless">Wireless & APs</option>
                    <option value="fiber">Fiber Optics & Cables</option>
                    <option value="solar">Solar & Power Backup</option>
                    <option value="cctv">CCTV & Surveillance</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-cyan-300 font-bold mb-1">Selling Price (KES) *</label>
                  <input
                    type="number"
                    required
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-cyan-500/50 rounded-lg text-white focus:outline-none focus:border-cyan-400 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Original Price (KES)</label>
                  <input
                    type="number"
                    value={editOriginalPrice}
                    onChange={(e) => setEditOriginalPrice(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Stock Quantity *</label>
                  <input
                    type="number"
                    required
                    value={editStock}
                    onChange={(e) => setEditStock(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Image Preset Picker */}
              <div className="space-y-2 p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="block text-slate-300 font-bold">Select Authentic Image Preset</label>
                  <span className="text-[10px] text-cyan-400">Quick 1-Click Catalog</span>
                </div>
                <select
                  onChange={(e) => {
                    if (e.target.value) setEditImageUrl(e.target.value);
                  }}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none"
                >
                  <option value="">-- Choose from Genuine Hardware Images --</option>
                  {PRESET_IMAGES.map((img, idx) => (
                    <option key={idx} value={img.url}>
                      {img.label}
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-3 pt-1">
                  <input
                    type="text"
                    required
                    placeholder="Image URL..."
                    value={editImageUrl}
                    onChange={(e) => setEditImageUrl(e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none"
                  />
                  {editImageUrl && (
                    <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-700 overflow-hidden shrink-0 flex items-center justify-center p-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={editImageUrl} alt="Preview" className="w-full h-full object-contain" />
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Badge (Optional)</label>
                  <input
                    type="text"
                    placeholder="Bestseller, WiFi 6, Hot Deal"
                    value={editBadge}
                    onChange={(e) => setEditBadge(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Short Description</label>
                  <input
                    type="text"
                    required
                    value={editShortDesc}
                    onChange={(e) => setEditShortDesc(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Full Description</label>
                <textarea
                  rows={2}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Bullet Specifications (1 per line)
                </label>
                <textarea
                  rows={3}
                  value={editSpecs}
                  onChange={(e) => setEditSpecs(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none font-mono text-[11px]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveLoading}
                  className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-lg shadow-cyan-500/20"
                >
                  {saveLoading ? "Saving..." : "Update Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-xl bg-[#090D16] border border-cyan-500/30 rounded-2xl p-6 text-slate-100 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-white">Add New Hardware Product</h3>
                <p className="text-xs text-slate-400">Add networking gear to the store with your pricing</p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="space-y-4 pt-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Product Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. MikroTik hEX S Gigabit Router"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Brand</label>
                  <input
                    type="text"
                    required
                    placeholder="MikroTik, Ubiquiti, HSGQ, etc."
                    value={newBrand}
                    onChange={(e) => setNewBrand(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as HardwareProduct["category"])}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="routers">Routers & ONUs</option>
                    <option value="switches">Switches & Cloud Routers</option>
                    <option value="wireless">Wireless & APs</option>
                    <option value="fiber">Fiber Optics & Cables</option>
                    <option value="solar">Solar & Power Backup</option>
                    <option value="cctv">CCTV & Surveillance</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-cyan-300 font-bold mb-1">Selling Price (KES) *</label>
                  <input
                    type="number"
                    required
                    placeholder="8500"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-cyan-500/50 rounded-lg text-white focus:outline-none focus:border-cyan-400 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Original Price (KES)</label>
                  <input
                    type="number"
                    placeholder="9500"
                    value={newOriginalPrice}
                    onChange={(e) => setNewOriginalPrice(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Stock Quantity</label>
                  <input
                    type="number"
                    required
                    value={newStock}
                    onChange={(e) => setNewStock(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Image Preset Picker */}
              <div className="space-y-2 p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="block text-slate-300 font-bold">Select Authentic Image Preset</label>
                  <span className="text-[10px] text-cyan-400">Genuine Hardware</span>
                </div>
                <select
                  onChange={(e) => {
                    if (e.target.value) setNewImageUrl(e.target.value);
                  }}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none"
                >
                  <option value="">-- Choose Genuine Hardware Preset --</option>
                  {PRESET_IMAGES.map((img, idx) => (
                    <option key={idx} value={img.url}>
                      {img.label}
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-3 pt-1">
                  <input
                    type="text"
                    required
                    placeholder="Or enter image URL..."
                    value={newImageUrl}
                    onChange={(e) => setNewImageUrl(e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none"
                  />
                  {newImageUrl && (
                    <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-700 overflow-hidden shrink-0 flex items-center justify-center p-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={newImageUrl} alt="Preview" className="w-full h-full object-contain" />
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Badge (Optional)</label>
                  <input
                    type="text"
                    placeholder="Bestseller, WiFi 6, Hot Deal"
                    value={newBadge}
                    onChange={(e) => setNewBadge(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Short Description</label>
                  <input
                    type="text"
                    required
                    placeholder="Key specs summary for product card..."
                    value={newShortDesc}
                    onChange={(e) => setNewShortDesc(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Bullet Specifications (1 per line)
                </label>
                <textarea
                  rows={3}
                  value={newSpecs}
                  onChange={(e) => setNewSpecs(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none font-mono text-[11px]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveLoading}
                  className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-lg shadow-cyan-500/20"
                >
                  {saveLoading ? "Saving..." : "Create Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
