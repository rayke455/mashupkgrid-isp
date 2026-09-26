"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { CustomerPortal, type PortalView } from "@/components/customer-portal";
import { IconChat, IconGift, IconHome, IconReceipt, IconUserRound } from "@/components/icons";

/**
 * The customer app: the same account data as the customer portal (balance, bills, M-Pesa
 * payment, support tickets, referral code), laid out for a phone with a tab bar, and installable
 * to the home screen. Signed-out visitors are sent to sign in and brought back here.
 */

type Tab = Exclude<PortalView, "all">;

const S = {
  en: {
    tabs: { home: "Home", bills: "Bills", support: "Help", refer: "Refer", account: "Account" },
    signOut: "Sign out",
    staffTitle: "This app is for customers",
    staffBody: "You are signed in as ISP staff. Open the dashboard instead.",
    openDashboard: "Open dashboard",
    installTitle: "Put this app on your home screen",
    installAndroid: "Install",
    installIos: "On iPhone: tap Share, then Add to Home Screen.",
    loading: "Loading…",
  },
  sw: {
    tabs: { home: "Mwanzo", bills: "Ankara", support: "Msaada", refer: "Rufaa", account: "Akaunti" },
    signOut: "Toka",
    staffTitle: "Programu hii ni ya wateja",
    staffBody: "Umeingia kama mfanyakazi wa mtoa huduma. Fungua dashibodi badala yake.",
    openDashboard: "Fungua dashibodi",
    installTitle: "Weka programu hii kwenye skrini ya mwanzo",
    installAndroid: "Sakinisha",
    installIos: "Kwenye iPhone: gusa Shiriki, kisha Ongeza kwenye Skrini ya Mwanzo.",
    loading: "Inapakia…",
  },
};

const ICONS: Record<Tab, (props: { size?: number }) => ReactNode> = {
  home: IconHome,
  bills: IconReceipt,
  support: IconChat,
  refer: IconGift,
  account: IconUserRound,
};

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
}

export function CustomerMobileApp({ tenantSlug }: { tenantSlug?: string }) {
  const { user, loading, logout } = useAuth();
  const { lang, setLang } = useLanguage();
  const t = S[lang];
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("home");
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(true);
  const [isIos, setIsIos] = useState(false);

  const isStaff = Boolean(user?.permissions.includes("customers.read"));
  const { data: me } = useQuery({
    queryKey: ["me-referral"],
    queryFn: () => apiFetch<{ isp: string }>("/api/v1/me/referral"),
    enabled: Boolean(user) && !isStaff,
  });

  useEffect(() => {
    if (!loading && !user) {
      const back = tenantSlug ? `/app/${tenantSlug}` : "/app";
      router.replace(`/login?next=${encodeURIComponent(back)}${tenantSlug ? `&tenant=${encodeURIComponent(tenantSlug)}` : ""}`);
    }
  }, [loading, user, router, tenantSlug]);

  useEffect(() => {
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Keep the chosen tab when the phone's back button is used.
  useEffect(() => {
    const fromHash = window.location.hash.slice(1) as Tab;
    if (fromHash in ICONS) setTab(fromHash);
    const onHash = () => {
      const next = window.location.hash.slice(1) as Tab;
      setTab(next in ICONS ? next : "home");
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">{t.loading}</div>;
  }

  if (isStaff) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-lg font-semibold text-white">{t.staffTitle}</h1>
        <p className="text-sm text-slate-400">{t.staffBody}</p>
        <Link href="/dashboard" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white">
          {t.openDashboard}
        </Link>
      </div>
    );
  }

  const tabs: Tab[] = ["home", "bills", "support", "refer", "account"];

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col bg-obsidian-950">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-obsidian-800 bg-obsidian-950/95 px-4 py-3 backdrop-blur">
        <p className="truncate font-semibold text-white">{me?.isp || " "}</p>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-obsidian-700 text-xs">
            {(["en", "sw"] as const).map((l) => (
              <button key={l} type="button" onClick={() => setLang(l)} className={`px-2.5 py-1 ${lang === l ? "bg-obsidian-800 text-white" : "text-slate-400"}`}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => logout().then(() => router.replace("/login?next=/app"))} className="text-xs text-slate-400 underline">
            {t.signOut}
          </button>
        </div>
      </header>

      <main key={lang} className="flex-1 space-y-4 px-4 pb-28 pt-4">
        {!installed && (installEvent || isIos) && tab === "home" && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-obsidian-800 bg-obsidian-900 p-3 text-sm">
            <div>
              <p className="font-medium text-white">{t.installTitle}</p>
              {isIos && !installEvent && <p className="text-xs text-slate-400">{t.installIos}</p>}
            </div>
            {installEvent && (
              <button
                type="button"
                className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white"
                onClick={() => installEvent.prompt().then(() => setInstallEvent(null))}
              >
                {t.installAndroid}
              </button>
            )}
          </div>
        )}
        <CustomerPortal view={tab} />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-obsidian-800 bg-obsidian-950/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {tabs.map((k) => (
            <a
              key={k}
              href={`#${k}`}
              aria-current={tab === k ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${tab === k ? "text-brand-400" : "text-slate-400"}`}
            >
              {(() => {
                const Glyph = ICONS[k];
                return <Glyph size={22} />;
              })()}
              {t.tabs[k]}
            </a>
          ))}
        </div>
      </nav>
    </div>
  );
}
