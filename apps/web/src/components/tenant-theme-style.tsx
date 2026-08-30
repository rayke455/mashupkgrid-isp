"use client";

import type { CSSProperties, ReactNode } from "react";
import { generateBrandScale } from "@/lib/color-scale";

/**
 * Wraps its children in a div carrying the tenant's brand-color CSS custom properties as inline
 * styles — every Tailwind class already written as `bg-brand-600`, `text-brand-400`, etc.
 * resolves `var(--brand-600)` at paint time (see tailwind.config.ts), so this is the entire
 * white-labeling mechanism: no per-component changes needed anywhere else. A tenant with no
 * saved brand color renders a plain wrapper with no inline styles, and globals.css's default
 * `:root` values apply exactly as before white-labeling existed.
 */
export function TenantThemeStyle({ brandColor, children }: { brandColor: string | null; children: ReactNode }) {
  const vars = generateBrandScale(brandColor);
  return <div style={vars as CSSProperties}>{children}</div>;
}
