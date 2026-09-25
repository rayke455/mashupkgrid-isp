"use client";

import type { CSSProperties } from "react";
import { appOnlyLabel, type CaptiveThemeProps, type HotspotPackage } from "./types";

/**
 * The default captive portal. Built for the conditions a captive portal actually loads in: a
 * phone's captive-portal sheet, on a slow link, often through a small router. So: no images, no
 * web fonts, no animation libraries — system type, one accent colour (the ISP's own brand colour
 * when set), and every action reachable without scrolling past decoration.
 */

function formatKes(priceMinor: number): string {
  const whole = priceMinor / 100;
  return `KSh ${whole.toLocaleString("en-KE", { maximumFractionDigits: whole % 1 === 0 ? 0 : 2 })}`;
}

const DAY = 60 * 24;

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  // Whole weeks and whole days read as such; anything else (25 hours, 90 minutes) stays in hours,
  // which is how the package was sold.
  if (minutes % (DAY * 7) === 0) return plural(minutes / (DAY * 7), "week");
  if (minutes % DAY === 0) return plural(minutes / DAY, "day");
  const h = minutes / 60;
  return plural(Number.isInteger(h) ? h : +h.toFixed(1), "hour");
}

function formatData(mb: number | null): string {
  if (!mb) return "Unlimited data";
  return mb >= 1024 ? `${+(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

function formatSpeed(kbps: number | null): string | null {
  if (!kbps) return null;
  return kbps >= 1000 ? `${+(kbps / 1000).toFixed(1)} Mbps` : `${kbps} kbps`;
}

/** Brand colour as a CSS variable, or the platform blue. Only #rgb / #rrggbb is trusted. */
function accentStyle(brandColor?: string | null): CSSProperties {
  const ok = brandColor && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(brandColor.trim());
  return { ["--portal-accent" as string]: ok ? brandColor!.trim() : "#1d4ed8" };
}

function PackageRow({ pkg, onSelect }: { pkg: HotspotPackage; onSelect: () => void }) {
  const speed = formatSpeed(pkg.downloadKbps);
  const appOnly = appOnlyLabel(pkg.appPolicy);
  const flag = pkg.badge || (pkg.isPopular ? "Popular" : null);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-[var(--portal-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--portal-accent)] active:bg-slate-50"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[15px] font-semibold text-slate-900">{pkg.name}</span>
            {flag && (
              <span className="rounded-full bg-[var(--portal-accent)] px-2 py-0.5 text-[11px] font-semibold text-white">{flag}</span>
            )}
            {appOnly && (
              <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">{appOnly}</span>
            )}
          </span>
          <span className="mt-0.5 block text-[13px] text-slate-500">
            {[formatDuration(pkg.durationMinutes), formatData(pkg.dataCapMb), speed].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-base font-semibold tabular-nums text-slate-900">{formatKes(pkg.priceMinor)}</span>
          <span className="mt-0.5 block text-xs font-medium text-[var(--portal-accent)]">Buy</span>
        </span>
      </button>
    </li>
  );
}

export function MashupHostCleanTheme(props: CaptiveThemeProps) {
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

  return (
    <div style={accentStyle(brandColor)} className="min-h-screen bg-slate-50 text-slate-900 [color-scheme:light]">
      <div className="mx-auto w-full max-w-md px-4 pb-10 pt-6">
        {/* Header */}
        <header className="flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- tenant logo URL, any host
            <img src={logoUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl object-contain" />
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--portal-accent)] text-lg font-semibold text-white">
              {name.trim().charAt(0).toUpperCase() || "W"}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-slate-900">{name}</p>
            <p className="text-sm text-slate-500">Wi-Fi hotspot</p>
          </div>
        </header>

        <div className="mt-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{welcomeTitle || "Fast, reliable Wi-Fi"}</h1>
          <p className="mt-1 text-[15px] text-slate-600">{bannerSubtitle || "Pay with M-Pesa and connect instantly"}</p>
        </div>

        {/* Connection status */}
        {(completingRouterLogin || voucherResult || accountResult) && (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5" role="status">
            {completingRouterLogin ? (
              <p className="flex items-center gap-2 text-[15px] font-medium text-emerald-900">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" aria-hidden="true" />
                Connecting you…
              </p>
            ) : (
              <>
                <p className="text-[15px] font-semibold text-emerald-900">You&apos;re connected</p>
                {voucherResult?.expiresAt && (
                  <p className="mt-0.5 text-sm text-emerald-800">
                    Access until{" "}
                    {new Date(voucherResult.expiresAt).toLocaleString("en-KE", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
                {accountResult && <p className="mt-0.5 text-sm text-emerald-800">Signed in as {accountResult.username}</p>}
              </>
            )}
          </div>
        )}

        {/* Packages */}
        <section className="mt-6" aria-labelledby="packages-heading">
          <h2 id="packages-heading" className="text-sm font-semibold text-slate-900">
            Choose a package
          </h2>
          {loadingPackages ? (
            <ul className="mt-3 space-y-2.5" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <li key={i} className="h-[70px] animate-pulse rounded-2xl bg-slate-200/70" />
              ))}
            </ul>
          ) : sorted.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
              No packages are on sale right now.{helpPhone ? ` Call ${helpPhone} for help.` : ""}
            </p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {sorted.map((pkg) => (
                <PackageRow key={pkg.id} pkg={pkg} onSelect={() => onSelectPackage(pkg)} />
              ))}
            </ul>
          )}
        </section>

        {/* Already have access */}
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4" aria-labelledby="access-heading">
          <h2 id="access-heading" className="text-sm font-semibold text-slate-900">
            Already have access?
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onOpenVoucherModal}
              className="rounded-xl bg-[var(--portal-accent)] px-3 py-2.5 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--portal-accent)] focus-visible:ring-offset-2"
            >
              Enter voucher
            </button>
            <button
              type="button"
              onClick={onOpenAccountModal}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--portal-accent)]"
            >
              Account login
            </button>
          </div>
          {onOpenRecover && (
            <button type="button" onClick={onOpenRecover} className="mt-3 w-full text-center text-sm font-medium text-[var(--portal-accent)] hover:underline">
              Paid but not connected? Get connected
            </button>
          )}
        </section>

        {/* Home fibre, only when the ISP has published rates */}
        {fiberRates && fiberRates.length > 0 && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4" aria-labelledby="fibre-heading">
            <h2 id="fibre-heading" className="text-sm font-semibold text-slate-900">
              Home internet
            </h2>
            <ul className="mt-2 divide-y divide-slate-100">
              {fiberRates.map((rate) => (
                <li key={`${rate.speed}-${rate.price}`} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-700">
                    {rate.speed}
                    {rate.subtitle && <span className="ml-1.5 text-slate-500">{rate.subtitle}</span>}
                  </span>
                  <span className="font-medium tabular-nums text-slate-900">{rate.price}</span>
                </li>
              ))}
            </ul>
            {(installationFee || contactPhone) && (
              <p className="mt-2 text-sm text-slate-500">
                {installationFee ? `Installation ${installationFee}. ` : ""}
                {contactPhone ? (
                  <>
                    Call{" "}
                    <a href={`tel:${contactPhone}`} className="font-medium text-[var(--portal-accent)]">
                      {contactPhone}
                    </a>{" "}
                    to connect.
                  </>
                ) : null}
              </p>
            )}
          </section>
        )}

        {/* Help */}
        <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
          <span>
            Need help?{" "}
            {helpPhone && (
              <a href={`tel:${helpPhone}`} className="font-medium text-slate-800">
                {helpPhone}
              </a>
            )}
          </span>
          {onOpenSupport && (
            <button type="button" onClick={onOpenSupport} className="font-medium text-[var(--portal-accent)] hover:underline">
              Send us a message
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
