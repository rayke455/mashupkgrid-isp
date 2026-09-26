"use client";

import type { CSSProperties } from "react";
import { appOnlyLabel, type CaptiveThemeProps, type HotspotPackage, type ThemeMeta } from "./types";

/**
 * A family of captive-portal themes built from one well-tested layout and a palette.
 *
 * Each theme differs in what a customer actually notices — colours, how the packages are laid out
 * (a list, a two-column grid, or compact price tiles), the header treatment and the corner
 * radius — while sharing the parts that must not vary: system fonts, no images or animation
 * libraries, every action reachable without scrolling past decoration, and the same accessible
 * structure. That is what lets an ISP switch between fifteen looks without any of them being a
 * slower or worse portal than the default.
 */

/** Ids of the palette themes. Permanent: a tenant's saved choice refers to them. */
export type PaletteThemeId = "green-line" | "sunset" | "ocean" | "midnight" | "campus" | "warm-sand" | "royal" | "brand-classic";

export interface PalettePreset {
  id: PaletteThemeId;
  name: string;
  category: string;
  description: string;
  appearance: "light" | "dark";
  /** Page background, card surface, primary text, secondary text, accent, text on accent, borders. */
  bg: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  onAccent: string;
  border: string;
  /** How packages are presented. */
  layout: "list" | "grid" | "tiles";
  /** "band": a coloured header band with the brand on it. "plain": brand on the page. "hero": a
   *  centred title block on the accent colour. */
  header: "band" | "plain" | "hero";
  radius: "md" | "xl" | "2xl";
  /** When true the ISP's own brand colour (from Settings) replaces the preset accent. */
  useBrandColor?: boolean;
}

function formatKes(priceMinor: number): string {
  const whole = priceMinor / 100;
  return `KSh ${whole.toLocaleString("en-KE", { maximumFractionDigits: whole % 1 === 0 ? 0 : 2 })}`;
}

const DAY = 60 * 24;
function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (minutes % (DAY * 7) === 0) return plural(minutes / (DAY * 7), "week");
  if (minutes % DAY === 0) return plural(minutes / DAY, "day");
  const h = minutes / 60;
  return plural(Number.isInteger(h) ? h : +h.toFixed(1), "hour");
}
function formatData(mb: number | null): string {
  if (!mb) return "Unlimited";
  return mb >= 1024 ? `${+(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}
function formatSpeed(kbps: number | null): string | null {
  if (!kbps) return null;
  return kbps >= 1000 ? `${+(kbps / 1000).toFixed(1)} Mbps` : `${kbps} kbps`;
}

const RADIUS = { md: "rounded-lg", xl: "rounded-xl", "2xl": "rounded-2xl" } as const;

function vars(p: PalettePreset, brandColor?: string | null): CSSProperties {
  const brandOk = p.useBrandColor && brandColor && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(brandColor.trim());
  return {
    ["--p-bg" as string]: p.bg,
    ["--p-surface" as string]: p.surface,
    ["--p-text" as string]: p.text,
    ["--p-muted" as string]: p.muted,
    ["--p-accent" as string]: brandOk ? brandColor!.trim() : p.accent,
    ["--p-on-accent" as string]: p.onAccent,
    ["--p-border" as string]: p.border,
  };
}

function PackageItem({ pkg, layout, radius, onSelect }: { pkg: HotspotPackage; layout: PalettePreset["layout"]; radius: string; onSelect: () => void }) {
  const speed = formatSpeed(pkg.downloadKbps);
  const appOnly = appOnlyLabel(pkg.appPolicy);
  const flag = pkg.badge || (pkg.isPopular ? "Popular" : null);
  const base = `w-full border border-[var(--p-border)] bg-[var(--p-surface)] text-left transition-colors hover:border-[var(--p-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--p-accent)] ${radius}`;

  if (layout === "tiles") {
    return (
      <li>
        <button type="button" onClick={onSelect} className={`${base} flex flex-col items-center px-3 py-4 text-center`}>
          <span className="text-lg font-semibold tabular-nums text-[var(--p-text)]">{formatKes(pkg.priceMinor)}</span>
          <span className="mt-1 text-sm font-medium text-[var(--p-text)]">{pkg.name}</span>
          <span className="mt-0.5 text-xs text-[var(--p-muted)]">{[formatDuration(pkg.durationMinutes), formatData(pkg.dataCapMb)].join(" · ")}</span>
          {(flag || appOnly) && (
            <span className="mt-2 rounded-full bg-[var(--p-accent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--p-on-accent)]">{appOnly ?? flag}</span>
          )}
        </button>
      </li>
    );
  }

  if (layout === "grid") {
    return (
      <li>
        <button type="button" onClick={onSelect} className={`${base} flex h-full flex-col px-4 py-3.5`}>
          <span className="flex items-start justify-between gap-2">
            <span className="text-[15px] font-semibold text-[var(--p-text)]">{pkg.name}</span>
            {flag && <span className="shrink-0 rounded-full bg-[var(--p-accent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--p-on-accent)]">{flag}</span>}
          </span>
          <span className="mt-1 text-xs text-[var(--p-muted)]">{[formatDuration(pkg.durationMinutes), formatData(pkg.dataCapMb), speed].filter(Boolean).join(" · ")}</span>
          {appOnly && <span className="mt-1 text-xs font-medium text-[var(--p-accent)]">{appOnly}</span>}
          <span className="mt-3 flex items-end justify-between">
            <span className="text-lg font-semibold tabular-nums text-[var(--p-text)]">{formatKes(pkg.priceMinor)}</span>
            <span className={`rounded-md bg-[var(--p-accent)] px-2.5 py-1 text-xs font-semibold text-[var(--p-on-accent)]`}>Buy</span>
          </span>
        </button>
      </li>
    );
  }

  return (
    <li>
      <button type="button" onClick={onSelect} className={`${base} flex items-center gap-3 px-4 py-3.5`}>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[15px] font-semibold text-[var(--p-text)]">{pkg.name}</span>
            {flag && <span className="rounded-full bg-[var(--p-accent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--p-on-accent)]">{flag}</span>}
            {appOnly && <span className="rounded-full border border-[var(--p-border)] px-2 py-0.5 text-[11px] font-semibold text-[var(--p-muted)]">{appOnly}</span>}
          </span>
          <span className="mt-0.5 block text-[13px] text-[var(--p-muted)]">{[formatDuration(pkg.durationMinutes), formatData(pkg.dataCapMb), speed].filter(Boolean).join(" · ")}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-base font-semibold tabular-nums text-[var(--p-text)]">{formatKes(pkg.priceMinor)}</span>
          <span className="mt-0.5 block text-xs font-medium text-[var(--p-accent)]">Buy</span>
        </span>
      </button>
    </li>
  );
}

export function createPaletteTheme(preset: PalettePreset) {
  const radius = RADIUS[preset.radius];
  const scheme = preset.appearance === "dark" ? "[color-scheme:dark]" : "[color-scheme:light]";

  function PaletteTheme(props: CaptiveThemeProps) {
    const {
      tenantName,
      contactPhone,
      supportPhone,
      welcomeTitle,
      bannerSubtitle,
      installationFee,
      fiberRates,
      logoUrl,
      brandColor,
      packages,
      loadingPackages,
      onSelectPackage,
      onOpenVoucherModal,
      onOpenAccountModal,
      onOpenRecover,
      onOpenSupport,
      voucherResult,
      accountResult,
      completingRouterLogin,
    } = props;

    const sorted = [...(packages ?? [])].sort((a, b) => a.priceMinor - b.priceMinor);
    const helpPhone = supportPhone || contactPhone;
    const name = tenantName || "Wi-Fi";
    const initial = name.trim().charAt(0).toUpperCase() || "W";
    const title = welcomeTitle || "Fast, reliable Wi-Fi";
    const subtitle = bannerSubtitle || "Pay with M-Pesa and connect instantly";

    const brand = (
      <div className="flex items-center gap-3">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- tenant logo URL, any host
          <img src={logoUrl} alt="" className={`h-11 w-11 shrink-0 bg-white object-contain ${radius}`} />
        ) : (
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center text-lg font-semibold ${radius} ${preset.header === "plain" ? "bg-[var(--p-accent)] text-[var(--p-on-accent)]" : "bg-white/15 text-[var(--p-on-accent)]"}`}>
            {initial}
          </span>
        )}
        <div className="min-w-0">
          <p className={`truncate text-base font-semibold ${preset.header === "plain" ? "text-[var(--p-text)]" : "text-[var(--p-on-accent)]"}`}>{name}</p>
          <p className={`text-sm ${preset.header === "plain" ? "text-[var(--p-muted)]" : "text-[var(--p-on-accent)] opacity-80"}`}>Wi-Fi hotspot</p>
        </div>
      </div>
    );

    const listClass =
      preset.layout === "list" ? "mt-3 space-y-2.5" : preset.layout === "grid" ? "mt-3 grid grid-cols-2 gap-2.5" : "mt-3 grid grid-cols-3 gap-2";

    return (
      <div style={vars(preset, brandColor)} className={`min-h-screen bg-[var(--p-bg)] text-[var(--p-text)] ${scheme}`}>
        {preset.header !== "plain" && (
          <div className="bg-[var(--p-accent)]">
            <div className={`mx-auto w-full max-w-md px-4 ${preset.header === "hero" ? "pb-8 pt-6" : "py-4"}`}>
              {brand}
              {preset.header === "hero" && (
                <div className="mt-6">
                  <h1 className="text-2xl font-semibold tracking-tight text-[var(--p-on-accent)]">{title}</h1>
                  <p className="mt-1 text-[15px] text-[var(--p-on-accent)] opacity-85">{subtitle}</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className={`mx-auto w-full max-w-md px-4 pb-10 ${preset.header === "hero" ? "-mt-3 pt-0" : "pt-6"}`}>
          {preset.header === "plain" && <header>{brand}</header>}
          {preset.header !== "hero" && (
            <div className="mt-6">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              <p className="mt-1 text-[15px] text-[var(--p-muted)]">{subtitle}</p>
            </div>
          )}

          {(completingRouterLogin || voucherResult || accountResult) && (
            <div className={`mt-5 border border-emerald-500/40 bg-emerald-500/10 px-4 py-3.5 ${radius}`} role="status">
              {completingRouterLogin ? (
                <p className="flex items-center gap-2 text-[15px] font-medium">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" aria-hidden="true" />
                  Connecting you…
                </p>
              ) : (
                <>
                  <p className="text-[15px] font-semibold">You&apos;re connected</p>
                  {voucherResult?.expiresAt && (
                    <p className="mt-0.5 text-sm text-[var(--p-muted)]">
                      Access until {new Date(voucherResult.expiresAt).toLocaleString("en-KE", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                  {accountResult && <p className="mt-0.5 text-sm text-[var(--p-muted)]">Signed in as {accountResult.username}</p>}
                </>
              )}
            </div>
          )}

          <section className={preset.header === "hero" ? "mt-5" : "mt-6"} aria-labelledby="packages-heading">
            <h2 id="packages-heading" className="text-sm font-semibold">
              Choose a package
            </h2>
            {loadingPackages ? (
              <ul className={listClass} aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <li key={i} className={`h-[70px] animate-pulse bg-[var(--p-border)] ${radius}`} />
                ))}
              </ul>
            ) : sorted.length === 0 ? (
              <p className={`mt-3 border border-dashed border-[var(--p-border)] bg-[var(--p-surface)] px-4 py-6 text-center text-sm text-[var(--p-muted)] ${radius}`}>
                No packages are on sale right now.{helpPhone ? ` Call ${helpPhone} for help.` : ""}
              </p>
            ) : (
              <ul className={listClass}>
                {sorted.map((pkg) => (
                  <PackageItem key={pkg.id} pkg={pkg} layout={preset.layout} radius={radius} onSelect={() => onSelectPackage(pkg)} />
                ))}
              </ul>
            )}
          </section>

          <section className={`mt-6 border border-[var(--p-border)] bg-[var(--p-surface)] p-4 ${radius}`} aria-labelledby="access-heading">
            <h2 id="access-heading" className="text-sm font-semibold">
              Already have access?
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onOpenVoucherModal}
                className={`bg-[var(--p-accent)] px-3 py-2.5 text-sm font-semibold text-[var(--p-on-accent)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--p-accent)] focus-visible:ring-offset-2 ${radius}`}
              >
                Enter voucher
              </button>
              <button
                type="button"
                onClick={onOpenAccountModal}
                className={`border border-[var(--p-border)] px-3 py-2.5 text-sm font-semibold hover:border-[var(--p-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--p-accent)] ${radius}`}
              >
                Account login
              </button>
            </div>
            {onOpenRecover && (
              <button type="button" onClick={onOpenRecover} className="mt-3 w-full text-center text-sm font-medium text-[var(--p-accent)] hover:underline">
                Paid but not connected? Get connected
              </button>
            )}
          </section>

          {fiberRates && fiberRates.length > 0 && (
            <section className={`mt-6 border border-[var(--p-border)] bg-[var(--p-surface)] p-4 ${radius}`} aria-labelledby="fibre-heading">
              <h2 id="fibre-heading" className="text-sm font-semibold">
                Home internet
              </h2>
              <ul className="mt-2 divide-y divide-[var(--p-border)]">
                {fiberRates.map((rate) => (
                  <li key={`${rate.speed}-${rate.price}`} className="flex items-center justify-between py-2 text-sm">
                    <span>
                      {rate.speed}
                      {rate.subtitle && <span className="ml-1.5 text-[var(--p-muted)]">{rate.subtitle}</span>}
                    </span>
                    <span className="font-medium tabular-nums">{rate.price}</span>
                  </li>
                ))}
              </ul>
              {(installationFee || contactPhone) && (
                <p className="mt-2 text-sm text-[var(--p-muted)]">
                  {installationFee ? `Installation ${installationFee}. ` : ""}
                  {contactPhone ? (
                    <>
                      Call{" "}
                      <a href={`tel:${contactPhone}`} className="font-medium text-[var(--p-accent)]">
                        {contactPhone}
                      </a>{" "}
                      to connect.
                    </>
                  ) : null}
                </p>
              )}
            </section>
          )}

          <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--p-muted)]">
            <span>
              Need help?{" "}
              {helpPhone && (
                <a href={`tel:${helpPhone}`} className="font-medium text-[var(--p-text)]">
                  {helpPhone}
                </a>
              )}
            </span>
            {onOpenSupport && (
              <button type="button" onClick={onOpenSupport} className="font-medium text-[var(--p-accent)] hover:underline">
                Send us a message
              </button>
            )}
          </footer>
        </div>
      </div>
    );
  }
  PaletteTheme.displayName = `PaletteTheme(${preset.id})`;
  return PaletteTheme;
}

export function paletteThemeMeta(preset: PalettePreset, extra: Pick<ThemeMeta, "badgeColor" | "accentColor">): ThemeMeta {
  return {
    id: preset.id,
    name: preset.name,
    category: preset.category,
    description: preset.description,
    inlineHelp: true,
    appearance: preset.appearance,
    ...extra,
  };
}

/** The eight palette themes. Ids are permanent: a tenant's saved choice refers to them. */
export const PALETTE_PRESETS: (PalettePreset & Pick<ThemeMeta, "badgeColor" | "accentColor">)[] = [
  {
    id: "green-line",
    name: "Green Line",
    category: "Everyday",
    description: "Green header band, package list, the ISP's logo up top. Familiar to anyone who has used M-Pesa.",
    appearance: "light",
    bg: "#f4f7f4", surface: "#ffffff", text: "#0f1f14", muted: "#5b6b60", accent: "#16803c", onAccent: "#ffffff", border: "#d8e3da",
    layout: "list", header: "band", radius: "xl",
    badgeColor: "bg-green-700 text-white", accentColor: "border-green-600",
  },
  {
    id: "sunset",
    name: "Sunset",
    category: "Everyday",
    description: "Warm orange hero with packages in a two-column grid. Bright, quick to scan on a phone in daylight.",
    appearance: "light",
    bg: "#fff8f1", surface: "#ffffff", text: "#2a1707", muted: "#7a5a43", accent: "#ea580c", onAccent: "#ffffff", border: "#f3dfcf",
    layout: "grid", header: "hero", radius: "2xl",
    badgeColor: "bg-orange-600 text-white", accentColor: "border-orange-500",
  },
  {
    id: "ocean",
    name: "Ocean",
    category: "Everyday",
    description: "Teal hero and compact price tiles — three packages per row, prices first. Good for long price lists.",
    appearance: "light",
    bg: "#f2f8f9", surface: "#ffffff", text: "#0b2a31", muted: "#4c6b72", accent: "#0f766e", onAccent: "#ffffff", border: "#cfe2e5",
    layout: "tiles", header: "hero", radius: "xl",
    badgeColor: "bg-teal-700 text-white", accentColor: "border-teal-600",
  },
  {
    id: "midnight",
    name: "Midnight",
    category: "Dark",
    description: "Near-black with a single blue accent and a plain header. Easy on the eyes at night; no glow effects.",
    appearance: "dark",
    bg: "#0b0f17", surface: "#131926", text: "#f1f5f9", muted: "#94a3b8", accent: "#3b82f6", onAccent: "#ffffff", border: "#243044",
    layout: "list", header: "plain", radius: "xl",
    badgeColor: "bg-blue-600 text-white", accentColor: "border-blue-500",
  },
  {
    id: "campus",
    name: "Campus",
    category: "Venues",
    description: "Indigo band and a grid of packages, sized for students buying short bundles between classes.",
    appearance: "light",
    bg: "#f5f5fb", surface: "#ffffff", text: "#1a1a3d", muted: "#5f5f8a", accent: "#4f46e5", onAccent: "#ffffff", border: "#dcdcf0",
    layout: "grid", header: "band", radius: "md",
    badgeColor: "bg-indigo-600 text-white", accentColor: "border-indigo-500",
  },
  {
    id: "warm-sand",
    name: "Warm Sand",
    category: "Venues",
    description: "Sand and brown tones with generous spacing, for cafés, guest houses and lodges.",
    appearance: "light",
    bg: "#f8f3ec", surface: "#fffdf9", text: "#2b2118", muted: "#7a6a5a", accent: "#9a5b2e", onAccent: "#ffffff", border: "#e8dccb",
    layout: "list", header: "plain", radius: "2xl",
    badgeColor: "bg-amber-800 text-white", accentColor: "border-amber-700",
  },
  {
    id: "royal",
    name: "Royal",
    category: "Dark",
    description: "Deep purple with price tiles on a dark surface. Distinctive without any animation.",
    appearance: "dark",
    bg: "#140f24", surface: "#1e1636", text: "#f5f3ff", muted: "#b4a8d6", accent: "#a855f7", onAccent: "#ffffff", border: "#332a52",
    layout: "tiles", header: "band", radius: "xl",
    badgeColor: "bg-purple-600 text-white", accentColor: "border-purple-500",
  },
  {
    id: "brand-classic",
    name: "Brand Classic",
    category: "Recommended",
    description: "A header band in your own brand colour (from Settings), packages in a grid. The safe choice for a company Wi-Fi.",
    appearance: "light",
    bg: "#f8fafc", surface: "#ffffff", text: "#0f172a", muted: "#64748b", accent: "#1d4ed8", onAccent: "#ffffff", border: "#e2e8f0",
    layout: "grid", header: "band", radius: "xl", useBrandColor: true,
    badgeColor: "bg-blue-700 text-white", accentColor: "border-blue-600",
  },
];
