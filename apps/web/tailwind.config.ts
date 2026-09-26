import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";
import plugin from "tailwindcss/plugin";

/**
 * Light mode for the dashboard without rewriting every class in it.
 *
 * The dashboard was built dark-first: `bg-obsidian-950`, `text-white`, `border-obsidian-800`,
 * `text-slate-400` and so on, hard-coded in hundreds of places. Instead of adding a light variant
 * to each, every shade of those scales resolves a CSS variable. `:root` holds the normal values,
 * and `.theme-light` (set on the dashboard root by ThemeProvider) redefines them so a dark surface
 * becomes a light one and light text becomes dark. Anything outside the dashboard, and anything
 * wrapped in `.theme-native`, keeps the ordinary values.
 */
const SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"] as const;
const TINT_SCALES = ["emerald", "amber", "rose", "sky", "cyan", "orange", "red", "yellow", "green", "teal", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "lime"] as const;
const VARIABLE_SCALES = ["slate", ...TINT_SCALES] as const;

function hexToTriplet(hex: string): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return `${parseInt(full.slice(0, 2), 16)} ${parseInt(full.slice(2, 4), 16)} ${parseInt(full.slice(4, 6), 16)}`;
}

function varScale(name: string): Record<string, string> {
  return Object.fromEntries(SHADES.map((shade) => [shade, `rgb(var(--${name}-${shade}) / <alpha-value>)`]));
}

const OBSIDIAN: Record<string, string> = {
  50: "#f8fafc", 100: "#f1f5f9", 200: "#e2e8f0", 300: "#cbd5e1", 400: "#94a3b8", 500: "#64748b",
  600: "#475569", 700: "#334155", 800: "#1e293b", 850: "#131a2a", 900: "#0f172a", 950: "#090d16",
};

/** What each dark-mode shade becomes in light mode. Surfaces flip, text flips, accents darken. */
const LIGHT_OVERRIDES: Record<string, string> = {
  "--white": hexToTriplet(colors.slate[900]),
  "--obsidian-950": hexToTriplet(colors.slate[50]),
  "--obsidian-900": "255 255 255",
  "--obsidian-850": hexToTriplet(colors.slate[100]),
  "--obsidian-800": hexToTriplet(colors.slate[200]),
  "--obsidian-700": hexToTriplet(colors.slate[300]),
  "--obsidian-600": hexToTriplet(colors.slate[400]),
  "--obsidian-500": hexToTriplet(colors.slate[500]),
  "--obsidian-400": hexToTriplet(colors.slate[600]),
  "--obsidian-300": hexToTriplet(colors.slate[700]),
  "--obsidian-200": hexToTriplet(colors.slate[800]),
  "--obsidian-100": hexToTriplet(colors.slate[900]),
  "--obsidian-50": hexToTriplet(colors.slate[950]),
  "--slate-100": hexToTriplet(colors.slate[800]),
  "--slate-200": hexToTriplet(colors.slate[700]),
  "--slate-300": hexToTriplet(colors.slate[600]),
  "--slate-400": hexToTriplet(colors.slate[500]),
  "--slate-500": hexToTriplet(colors.slate[500]),
  "--slate-600": hexToTriplet(colors.slate[400]),
  "--slate-700": hexToTriplet(colors.slate[300]),
  "--slate-800": hexToTriplet(colors.slate[200]),
  "--slate-900": hexToTriplet(colors.slate[100]),
  "--slate-950": hexToTriplet(colors.slate[50]),
  // Coloured tints: the dark shades used as backgrounds become pale tints, the light shades used
  // as text on dark become the deep shades that read on white.
  ...Object.fromEntries(
    TINT_SCALES.flatMap((c) => [
      [`--${c}-950`, hexToTriplet(colors[c][50])],
      [`--${c}-900`, hexToTriplet(colors[c][100])],
      [`--${c}-800`, hexToTriplet(colors[c][200])],
      [`--${c}-200`, hexToTriplet(colors[c][800])],
      [`--${c}-300`, hexToTriplet(colors[c][700])],
      [`--${c}-400`, hexToTriplet(colors[c][600])],
    ])
  ),
  // The tenant's brand scale is set at runtime, so point at its own shades instead of fixed values.
  "--brand-950": "var(--brand-50)",
  "--brand-900": "var(--brand-100)",
  "--brand-300": "var(--brand-700)",
  "--brand-400": "var(--brand-600)",
};

const SOLID_BACKGROUNDS = ["bg-brand-500", "bg-brand-600", "bg-brand-700", "bg-emerald-600", "bg-emerald-700", "bg-rose-600", "bg-red-600", "bg-obsidian-100"];
const SOLID_SELECTOR = `.theme-light :is(${SOLID_BACKGROUNDS.map((c) => `[class~="${c}"]`).join(", ")})`;

const themeVariables = plugin(({ addBase }) => {
  const defaults: Record<string, string> = { "--white": "255 255 255" };
  for (const scale of VARIABLE_SCALES) for (const shade of SHADES) defaults[`--${scale}-${shade}`] = hexToTriplet(colors[scale][shade]);
  for (const [shade, hex] of Object.entries(OBSIDIAN)) defaults[`--obsidian-${shade}`] = hexToTriplet(hex);
  addBase({
    ":root": defaults,
    ".theme-light": { ...LIGHT_OVERRIDES, colorScheme: "light" },
    // Content designed light on its own (a printable statement, a receipt) keeps real colours.
    ".theme-native": { ...defaults, colorScheme: "light" },
    // Solid brand or status buttons keep white text in light mode, where `text-white` otherwise
    // resolves to dark text. Attribute selectors on purpose: Tailwind treats a class selector in
    // plugin CSS as a utility and would also emit `dark:`/`hover:` copies of this rule, which then
    // match ordinary cards.
    [SOLID_SELECTOR]: { color: "#fff" },
    [`${SOLID_SELECTOR} *`]: { color: "inherit" },
    // `white` flips to dark for text, but a solid white surface (a switch knob, a light-first card
    // with no dark variant) should stay white. Tints like `bg-white/5` still flip, which is right.
    '.theme-light [class~="bg-white"]': { backgroundColor: "#fff" },
  });
});


const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  // Class-based dark mode, with one opt-out: anything inside `.force-light` renders its light
  // styles even though the root <html> carries `dark`. The public marketing, legal and auth pages
  // are a light design, and the shared primitives in components/ui.tsx (Input, Label, Card…)
  // would otherwise always resolve their `dark:` variants there. The dashboard never uses
  // `.force-light`, so its behaviour is identical to plain `darkMode: "class"`.
  darkMode: ["variant", "&:is(.dark *):not(:is(.force-light, .force-light *))"],
  theme: {
    extend: {
      colors: {
        // Each shade resolves a CSS custom property at runtime (defined in globals.css, and
        // overridden per-tenant by <TenantThemeStyle> — see components/tenant-theme-style.tsx)
        // instead of a fixed hex baked in at build time. This is the one thing that makes
        // white-label branding possible at all: Tailwind classes like `bg-brand-600` are
        // otherwise resolved once, at build time, the same for every tenant. The `<alpha-value>`
        // placeholder is Tailwind's own mechanism for keeping opacity modifiers (`bg-brand-600/50`)
        // working with a CSS-var color — it requires the var to hold an "R G B" triplet, not a
        // hex string, which is why globals.css defines these as space-separated numbers.
        brand: {
          50: "rgb(var(--brand-50) / <alpha-value>)",
          100: "rgb(var(--brand-100) / <alpha-value>)",
          200: "rgb(var(--brand-200) / <alpha-value>)",
          300: "rgb(var(--brand-300) / <alpha-value>)",
          400: "rgb(var(--brand-400) / <alpha-value>)",
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
          800: "rgb(var(--brand-800) / <alpha-value>)",
          900: "rgb(var(--brand-900) / <alpha-value>)",
          950: "rgb(var(--brand-950) / <alpha-value>)",
        },
        white: "rgb(var(--white) / <alpha-value>)",
        ...Object.fromEntries(VARIABLE_SCALES.map((name) => [name, varScale(name)])),
        obsidian: { ...varScale("obsidian"), 850: "rgb(var(--obsidian-850) / <alpha-value>)" },
        mpesa: {
          50: "#ecfdf5",
          100: "#d1fae5",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
        },
      },
      boxShadow: {
        // Same reason the brand color scale above resolves a CSS variable: `shadow-glow` is the
        // accent glow under primary buttons and active nav, so baking the default blue in meant
        // it stayed blue no matter what brand color a tenant picked.
        glow: "0 0 25px -4px rgba(6, 182, 212, 0.45)",
        "glow-cyan": "0 0 25px -4px rgba(0, 242, 254, 0.5)",
        "glow-emerald": "0 0 25px -4px rgba(0, 255, 135, 0.45)",
        subtle: "0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.04)",
        card: "0 4px 6px -1px rgba(0, 0, 0, 0.04), 0 2px 4px -2px rgba(0, 0, 0, 0.04)",
      },
    },
  },
  plugins: [themeVariables],
};

export default config;
