/**
 * Generates a Tailwind-shaped 11-step color scale (50-950) from one tenant-chosen hex color,
 * treating that color as the "600" shade — the one this app's buttons/active-nav/etc. actually
 * use most. Not a perceptually-tuned scale the way Tailwind's own palettes are (those are
 * hand-tuned per hue); this is a straightforward HSL lightness sweep around the input's own hue
 * and saturation, good enough for a white-label accent color without pulling in a color library.
 */

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function hexToHsl(hex: string): Hsl {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l: l * 100 };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    default:
      h = ((r - g) / d + 4) / 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgbTriplet(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const hPrime = h / 60;
  const x = c * (1 - Math.abs((hPrime % 2) - 1));
  const m = lNorm - c / 2;

  let [r, g, b] = [0, 0, 0];
  if (hPrime >= 0 && hPrime < 1) [r, g, b] = [c, x, 0];
  else if (hPrime < 2) [r, g, b] = [x, c, 0];
  else if (hPrime < 3) [r, g, b] = [0, c, x];
  else if (hPrime < 4) [r, g, b] = [0, x, c];
  else if (hPrime < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const toByte = (v: number) => Math.round((v + m) * 255);
  return `${toByte(r)} ${toByte(g)} ${toByte(b)}`;
}

// Target lightness per shade, and a saturation multiplier that pulls the very light/dark ends
// slightly toward neutral (avoids neon pastels at 50 and an oversaturated near-black at 950).
const SHADE_CURVE: Record<string, { lightness: number; saturationMul: number }> = {
  "50": { lightness: 97, saturationMul: 0.5 },
  "100": { lightness: 93, saturationMul: 0.6 },
  "200": { lightness: 86, saturationMul: 0.75 },
  "300": { lightness: 76, saturationMul: 0.85 },
  "400": { lightness: 65, saturationMul: 0.95 },
  "500": { lightness: 58, saturationMul: 1 },
  "600": { lightness: 50, saturationMul: 1 },
  "700": { lightness: 42, saturationMul: 1 },
  "800": { lightness: 34, saturationMul: 0.9 },
  "900": { lightness: 27, saturationMul: 0.8 },
  "950": { lightness: 15, saturationMul: 0.7 },
};

/** Returns CSS custom property names mapped to "R G B" triplet strings, ready to spread into a
 *  React inline `style` object. Falsy/malformed input returns an empty object — the caller
 *  should render nothing extra in that case and let globals.css's default scale apply. */
export function generateBrandScale(hex: string | null | undefined): Record<string, string> {
  if (!hex || !/^#?[0-9a-fA-F]{6}$/.test(hex)) return {};
  const { h, s } = hexToHsl(hex);

  const vars: Record<string, string> = {};
  for (const [shade, { lightness, saturationMul }] of Object.entries(SHADE_CURVE)) {
    vars[`--brand-${shade}`] = hslToRgbTriplet(h, s * saturationMul, lightness);
  }
  return vars;
}
