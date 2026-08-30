import { useState, useEffect } from 'react';

// Define available brand themes
export const BRAND_THEMES = {
  default: '#2563eb', // blue-600
  emerald: '#10b981', // emerald-500
  amber: '#f59e0b',   // amber-500
  rose: '#f43f5e',    // rose-500
  violet: '#8b5cf6',  // violet-500
  cyan: '#06b6d4',    // cyan-500
  indigo: '#6366f1',  // indigo-500
  teal: '#14b8a6',    // teal-500
};

export type BrandTheme = keyof typeof BRAND_THEMES;

/**
 * Hook to manage brand theme selection and persistence
 */
export function useBrandTheme(defaultTheme: BrandTheme = 'default') {
  const [selectedTheme, setSelectedTheme] = useState<BrandTheme>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('brand-theme');
      return (saved as BrandTheme) || defaultTheme;
    }
    return defaultTheme;
  });

  const [brandColor, setBrandColor] = useState<string>(() => {
    return BRAND_THEMES[selectedTheme];
  });

  // Update brand color when theme changes
  useEffect(() => {
    setBrandColor(BRAND_THEMES[selectedTheme]);
    // Save to localStorage
    localStorage.setItem('brand-theme', selectedTheme);
  }, [selectedTheme]);

  // Apply the brand color to the root element
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--brand-hue', getHueFromHex(brandColor).toString());
  }, [brandColor]);

  const setTheme = (theme: BrandTheme) => {
    setSelectedTheme(theme);
  };

  return {
    selectedTheme,
    brandColor,
    setTheme,
    themes: BRAND_THEMES,
  };
}

/**
 * Extract hue value from a hex color for dynamic theming
 */
function getHueFromHex(hex: string): number {
  // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, (m, r, g, b) => {
    return r + r + g + g + b + b;
  });

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return 0;

  const r = parseInt(result[1]!, 16) / 255;
  const g = parseInt(result[2]!, 16) / 255;
  const b = parseInt(result[3]!, 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;

  if (max === min) {
    h = 0; // achromatic
  } else {
    const d = max - min;
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h = Math.round(h * 60);
  }

  return h;
}