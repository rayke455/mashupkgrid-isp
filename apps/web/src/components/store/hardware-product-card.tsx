"use client";

import { useState } from "react";
import { HardwareProduct, useCart } from "@/lib/hardware-store";

interface HardwareProductCardProps {
  product: HardwareProduct;
  onQuickBuy?: (product: HardwareProduct) => void;
}

export function HardwareProductCard({ product, onQuickBuy }: HardwareProductCardProps) {
  const { addItem } = useCart();
  const [showSpecs, setShowSpecs] = useState(false);
  const [addedAnimation, setAddedAnimation] = useState(false);

  const handleAddToCart = () => {
    addItem(product, 1);
    setAddedAnimation(true);
    setTimeout(() => setAddedAnimation(false), 1200);
  };

  const handleQuickBuy = () => {
    addItem(product, 1);
    if (onQuickBuy) {
      onQuickBuy(product);
    }
  };

  const discountPercent = product.originalPrice
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : null;

  return (
    <div className="group relative rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950/90 border border-slate-800/80 hover:border-cyan-500/50 transition-all duration-300 flex flex-col overflow-hidden shadow-lg hover:shadow-cyan-500/10">
      {/* Top badges */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-1.5">
        <span className="px-2 py-0.5 rounded-md bg-slate-950/80 backdrop-blur-md border border-slate-700 text-[10px] font-bold tracking-wider uppercase text-cyan-400">
          {product.brand}
        </span>
        {product.badge && (
          <span className="px-2 py-0.5 rounded-md bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border border-emerald-500/40 text-[10px] font-bold text-emerald-300">
            {product.badge}
          </span>
        )}
      </div>

      {discountPercent && discountPercent > 0 && (
        <div className="absolute top-3 right-3 z-10 px-2 py-0.5 rounded-md bg-rose-500 text-white font-bold text-[10px] shadow-md">
          -{discountPercent}%
        </div>
      )}

      {/* Image Thumbnail */}
      <div className="relative h-48 w-full bg-slate-950 overflow-hidden flex items-center justify-center p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.imageUrl}
          alt={product.name}
          className="w-full h-full object-cover rounded-xl group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-60" />
      </div>

      {/* Card Body */}
      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div>
          <div className="flex items-center gap-1.5 text-amber-400 text-xs mb-1">
            <span>★</span>
            <span className="font-bold text-slate-200">{product.rating.toFixed(1)}</span>
            <span className="text-slate-500 text-[11px]">({product.reviewCount})</span>
            <span className="mx-1 text-slate-700">•</span>
            <span
              className={`text-[11px] font-medium ${
                product.inStock ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {product.inStock ? `In Stock (${product.stock})` : "Out of Stock"}
            </span>
          </div>

          <h4 className="font-bold text-sm text-white line-clamp-2 group-hover:text-cyan-400 transition-colors">
            {product.name}
          </h4>

          <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
            {product.shortDescription}
          </p>
        </div>

        {/* Specs Toggle */}
        <div>
          <button
            onClick={() => setShowSpecs(!showSpecs)}
            className="text-[11px] font-medium text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
          >
            <span>{showSpecs ? "Hide Technical Specs ▲" : "View Technical Specs ▼"}</span>
          </button>

          {showSpecs && (
            <ul className="mt-2 p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 text-[11px] text-slate-300 space-y-1 animate-in fade-in">
              {product.specs.map((spec, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-cyan-400 font-bold shrink-0">✓</span>
                  <span>{spec}</span>
                </li>
              ))}
              <li className="pt-1 text-[10px] text-slate-500 border-t border-slate-800 flex items-center gap-1">
                <span>🛡️</span>
                <span>{product.warranty}</span>
              </li>
            </ul>
          )}
        </div>

        {/* Pricing & CTA */}
        <div className="pt-3 border-t border-slate-800/80">
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <span className="text-xs text-slate-400 block leading-none mb-0.5">Kenya Cash Price</span>
              <div className="flex items-baseline gap-2">
                <span className="text-base font-extrabold text-cyan-300">
                  KES {product.price.toLocaleString()}
                </span>
                {product.originalPrice && (
                  <span className="text-xs text-slate-500 line-through">
                    KES {product.originalPrice.toLocaleString()}
                  </span>
                )}
              </div>
            </div>
            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-medium">
              Till / Paybill
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleAddToCart}
              className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                addedAnimation
                  ? "bg-emerald-500 border-emerald-400 text-slate-950"
                  : "bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200"
              }`}
            >
              {addedAnimation ? "✓ Added" : "+ Add to Cart"}
            </button>
            <button
              onClick={handleQuickBuy}
              className="py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 text-xs font-bold transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-1"
            >
              <span>⚡</span>
              Buy with M-Pesa
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
