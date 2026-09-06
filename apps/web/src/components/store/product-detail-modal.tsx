"use client";

import { useState } from "react";
import { HardwareProduct, useCart } from "@/lib/hardware-store";

interface ProductDetailModalProps {
  product: HardwareProduct | null;
  isOpen: boolean;
  onClose: () => void;
  onInstantBuy?: (product: HardwareProduct, quantity: number) => void;
}

export function ProductDetailModal({
  product,
  isOpen,
  onClose,
  onInstantBuy,
}: ProductDetailModalProps) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [addedAnimation, setAddedAnimation] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen || !product) return null;

  const discountPercent = product.originalPrice
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : null;

  const handleAddToCart = () => {
    addItem(product, quantity);
    setAddedAnimation(true);
    setTimeout(() => setAddedAnimation(false), 1500);
  };

  const handleInstantBuy = () => {
    addItem(product, quantity);
    if (onInstantBuy) {
      onInstantBuy(product, quantity);
    }
  };

  const handleCopyShare = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard?.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl bg-[#090D16] border border-cyan-500/30 rounded-3xl text-slate-100 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-slate-900/80 border border-slate-700 hover:border-cyan-400 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
          title="Close dialog"
        >
          ✕
        </button>

        {/* Modal Scrollable Container */}
        <div className="overflow-y-auto p-6 sm:p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {/* Left: Product Image Showcase */}
            <div className="space-y-3">
              <div className="relative rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center p-4 group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="w-full h-64 sm:h-72 object-contain group-hover:scale-105 transition-transform duration-500"
                />

                {/* Brand Badge */}
                <div className="absolute top-3 left-3 flex gap-1.5">
                  <span className="px-2.5 py-1 rounded-md bg-slate-950/90 border border-slate-700 text-[11px] font-black uppercase text-cyan-400 tracking-wider">
                    {product.brand}
                  </span>
                  {product.badge && (
                    <span className="px-2.5 py-1 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-[11px] font-bold text-emerald-300">
                      {product.badge}
                    </span>
                  )}
                </div>

                {/* Discount Tag */}
                {discountPercent && discountPercent > 0 && (
                  <div className="absolute top-3 right-3 px-2.5 py-1 rounded-md bg-rose-500 text-white font-black text-xs shadow-md">
                    SAVE {discountPercent}%
                  </div>
                )}
              </div>

              {/* Trust Badges under image */}
              <div className="grid grid-cols-3 gap-2 text-center text-[10px] text-slate-400">
                <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="text-emerald-400 font-bold mb-0.5">🛡️ Warranty</div>
                  <div>{product.warranty || "1 Year"}</div>
                </div>
                <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="text-cyan-400 font-bold mb-0.5">⚡ Delivery</div>
                  <div>Same-Day / 24h</div>
                </div>
                <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="text-amber-400 font-bold mb-0.5">📱 M-Pesa</div>
                  <div>Instant STK</div>
                </div>
              </div>
            </div>

            {/* Right: Product Details & Purchase Actions */}
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 text-xs text-amber-400 mb-1">
                  <span>★</span>
                  <span className="font-bold text-white">{product.rating.toFixed(1)}</span>
                  <span className="text-slate-500">({product.reviewCount} customer reviews)</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-white leading-snug">
                  {product.name}
                </h2>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                      product.inStock ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${product.inStock ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                    {product.inStock ? `In Stock (${product.stock} units in Nairobi store)` : "Currently Out of Stock"}
                  </span>
                </div>
              </div>

              {/* Price section */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-950 border border-slate-800 flex items-baseline justify-between">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cash Price</div>
                  <div className="text-2xl sm:text-3xl font-black text-cyan-400">
                    KES {product.price.toLocaleString()}
                  </div>
                </div>
                {product.originalPrice && product.originalPrice > product.price && (
                  <div className="text-right">
                    <div className="text-[10px] text-slate-500">Regular Price</div>
                    <div className="text-sm text-slate-500 line-through">
                      KES {product.originalPrice.toLocaleString()}
                    </div>
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Overview</h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {product.description || product.shortDescription}
                </p>
              </div>

              {/* Technical Specifications */}
              {product.specs && product.specs.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                    Technical Specifications
                  </h4>
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5">
                    {product.specs.map((spec, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-slate-300">
                        <span className="text-cyan-400 text-[10px]">■</span>
                        <span>{spec}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quantity Selector & Action Buttons */}
              <div className="pt-2 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400">Quantity:</span>
                  <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl p-1">
                    <button
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                      className="w-7 h-7 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center disabled:opacity-30"
                    >
                      -
                    </button>
                    <span className="w-8 text-center text-xs font-bold text-white">{quantity}</span>
                    <button
                      onClick={() => setQuantity((q) => Math.min(product.stock || 20, q + 1))}
                      disabled={quantity >= (product.stock || 20)}
                      className="w-7 h-7 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    onClick={handleAddToCart}
                    disabled={!product.inStock}
                    className="py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-cyan-500/40 text-cyan-300 font-bold text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                  >
                    <span>{addedAnimation ? "✓ Added!" : "🛒 Add to Cart"}</span>
                  </button>

                  <button
                    onClick={handleInstantBuy}
                    disabled={!product.inStock}
                    className="py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black text-xs transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-40"
                  >
                    <span>⚡ Buy Now with M-Pesa</span>
                  </button>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <button
                    onClick={handleCopyShare}
                    className="hover:text-cyan-400 transition-colors flex items-center gap-1"
                  >
                    <span>🔗</span> {copiedLink ? "Link Copied!" : "Share Product"}
                  </button>
                  <span>Pre-tested with MikroTik RouterOS</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
