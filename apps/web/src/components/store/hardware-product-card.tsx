"use client";

import { useState } from "react";
import { type HardwareProduct, useCart } from "@/lib/hardware-store";

export const ksh = (n: number) => `KSh ${n.toLocaleString("en-KE")}`;

export function StockLabel({ product }: { product: HardwareProduct }) {
  if (!product.inStock) return <span className="text-rose-600">Out of stock</span>;
  if (product.stock <= 5) return <span className="text-amber-700">Only {product.stock} left</span>;
  return <span className="text-emerald-700">In stock</span>;
}

export function HardwareProductCard({
  product,
  onViewDetails,
  onBuyNow,
}: {
  product: HardwareProduct;
  onViewDetails: (product: HardwareProduct) => void;
  onBuyNow: () => void;
}) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);
  const saving = product.originalPrice && product.originalPrice > product.price ? product.originalPrice - product.price : 0;

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition-shadow hover:shadow-md">
      <button type="button" onClick={() => onViewDetails(product)} className="relative flex h-48 items-center justify-center bg-slate-50 p-5" aria-label={`View ${product.name}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={product.imageUrl} alt="" className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]" />
        {product.badge && <span className="absolute left-3 top-3 rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200">{product.badge}</span>}
      </button>

      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs font-medium text-slate-500">{product.brand}</p>
        <h3 className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug text-slate-950">
          <button type="button" onClick={() => onViewDetails(product)} className="text-left hover:text-brand-700">
            {product.name}
          </button>
        </h3>
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">{product.shortDescription}</p>

        <div className="mt-auto pt-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-lg font-semibold tabular-nums text-slate-950">{ksh(product.price)}</p>
            <p className="text-xs">
              <StockLabel product={product} />
            </p>
          </div>
          {saving > 0 && (
            <p className="text-xs text-slate-500">
              <span className="line-through">{ksh(product.originalPrice!)}</span> · save {ksh(saving)}
            </p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!product.inStock}
              onClick={() => {
                addItem(product, 1);
                setAdded(true);
                setTimeout(() => setAdded(false), 1200);
              }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {added ? "Added" : "Add to cart"}
            </button>
            <button
              type="button"
              disabled={!product.inStock}
              onClick={() => {
                addItem(product, 1);
                onBuyNow();
              }}
              className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Buy now
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
