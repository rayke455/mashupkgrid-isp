"use client";

import { useEffect, useState } from "react";
import { type HardwareProduct, useCart } from "@/lib/hardware-store";
import { StockLabel, ksh } from "./hardware-product-card";

export function ProductDetailModal({
  product,
  onClose,
  onBuyNow,
}: {
  product: HardwareProduct | null;
  onClose: () => void;
  onBuyNow: () => void;
}) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setQuantity(1);
    setAdded(false);
    if (!product) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [product, onClose]);

  if (!product) return null;
  const max = Math.max(1, product.stock);

  return (
    <div className="force-light fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={product.name}
        className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white text-slate-900 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 z-10 rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
          ✕
        </button>
        <div className="grid gap-6 overflow-y-auto p-5 sm:p-7 md:grid-cols-2">
          <div className="flex items-center justify-center rounded-xl bg-slate-50 p-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={product.imageUrl} alt={product.name} className="h-64 w-full object-contain" />
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-sm text-slate-500">{product.brand}</p>
              <h2 className="mt-0.5 text-xl font-semibold leading-snug text-slate-950">{product.name}</h2>
              <p className="mt-1 text-sm">
                <StockLabel product={product} />
              </p>
            </div>

            <div>
              <p className="text-2xl font-semibold tabular-nums text-slate-950">{ksh(product.price)}</p>
              {product.originalPrice && product.originalPrice > product.price && (
                <p className="text-sm text-slate-500">
                  Was <span className="line-through">{ksh(product.originalPrice)}</span>
                </p>
              )}
            </div>

            <p className="text-sm leading-6 text-slate-600">{product.description || product.shortDescription}</p>

            {product.specs.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-slate-900">Specifications</h3>
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  {product.specs.map((spec) => (
                    <li key={spec} className="flex gap-2">
                      <span aria-hidden="true" className="text-slate-400">
                        ·
                      </span>
                      {spec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-900">Warranty:</span> {product.warranty}
            </p>

            <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
              <span className="text-sm text-slate-600">Quantity</span>
              <div className="flex items-center rounded-lg border border-slate-300">
                <button type="button" aria-label="Fewer" className="px-3 py-1.5 text-slate-700 disabled:opacity-40" disabled={quantity <= 1} onClick={() => setQuantity((q) => q - 1)}>
                  −
                </button>
                <span className="w-8 text-center text-sm tabular-nums">{quantity}</span>
                <button type="button" aria-label="More" className="px-3 py-1.5 text-slate-700 disabled:opacity-40" disabled={quantity >= max} onClick={() => setQuantity((q) => q + 1)}>
                  +
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!product.inStock}
                onClick={() => {
                  addItem(product, quantity);
                  setAdded(true);
                }}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                {added ? "Added to cart" : "Add to cart"}
              </button>
              <button
                type="button"
                disabled={!product.inStock}
                onClick={() => {
                  addItem(product, quantity);
                  onBuyNow();
                }}
                className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                Buy now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
