"use client";

import { useState, useEffect } from "react";
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
  const [newImageUrl, setNewImageUrl] = useState("https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=800&q=80");
  const [newSpecs, setNewSpecs] = useState("Gigabit Ethernet\nDual Core CPU\nRouterOS L4");

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
      // Reset modal fields
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

  // If a tenant lands on this page, show strict role isolation message:
  if (!isSuperAdmin) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-2xl flex items-center justify-center mx-auto">
          🔒
        </div>
        <h2 className="text-2xl font-bold text-white">Super Administrator Access Required</h2>
        <p className="text-sm text-slate-400 max-w-lg mx-auto">
          You are signed in as a tenant account. As a tenant, you can browse and purchase hardware from the store, but only platform Super Administrators are authorized to update product prices and configure inventory.
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
            <span className="text-xs text-slate-400">• Store Pricing Authority</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            Hardware Products & Price Management
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Update cash prices in KES, manage stock levels, and add networking hardware. Tenants cannot modify these prices.
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
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
          <span>✓</span> {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
          <span>⚠️</span> {errorMsg}
        </div>
      )}

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
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-500">
                    No products found. Click &quot;Add New Product&quot; to begin.
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-900/40 transition-colors">
                    {/* Details */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="w-full h-full object-cover"
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
                            title="Edit Price"
                          >
                            ✎ Edit
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
                  <label className="block text-slate-300 font-medium mb-1">Image URL</label>
                  <input
                    type="url"
                    required
                    value={newImageUrl}
                    onChange={(e) => setNewImageUrl(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Short Description</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Key specs summary for product card..."
                  value={newShortDesc}
                  onChange={(e) => setNewShortDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none"
                />
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
