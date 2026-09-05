"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api-client";
import { Button, StatusDot } from "@/components/ui";
import { TenantThemeStyle } from "@/components/tenant-theme-style";
import { TawkToWidget } from "@/components/tawk-to-widget";
import { DashboardBanners } from "@/components/dashboard-banners";
import {
  IconDashboard,
  IconSession,
  IconUsers,
  IconPackage,
  IconInvoice,
  IconMpesa,
  IconRouter,
  IconNetworkPool,
  IconTicket,
  IconTenants,
  IconMaintenance,
  IconLogOut,
  IconLock,
  IconLayers,
  IconSpeed,
  IconMessage,
  IconLifeBuoy,
  IconSparkles,
  IconPalette,
  IconMenu,
  IconClose,
  IconPulse,
  IconShield,
} from "@/components/icons";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  show: boolean;
}

function NavLink({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-150 ${
        active
          ? "bg-gradient-to-r from-cyan-500/20 via-cyan-500/10 to-transparent text-cyan-300 border-l-2 border-cyan-400 pl-2.5 font-bold shadow-[inset_0_1px_2px_rgba(255,255,255,0.08),0_2px_8px_rgba(0,242,254,0.12)]"
          : "text-slate-300 hover:bg-[#1a2537] hover:text-white border-l-2 border-transparent"
      }`}
    >
      <span
        className={`shrink-0 transition-colors ${
          active
            ? "text-cyan-400"
            : "text-slate-400 group-hover:text-cyan-300"
        }`}
      >
        {icon}
      </span>
      <span className="truncate">{label}</span>
      {active && (
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#00F2FE]" />
      )}
    </Link>
  );
}

function initialsOf(email: string | null | undefined): string {
  if (!email) return "?";
  const name = email.split("@")[0] ?? "?";
  return name.slice(0, 2).toUpperCase();
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // Close the drawer whenever navigation happens. Without this, tapping a nav link on a phone
  // leaves the drawer covering the page you just asked for.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Escape closes it, and the page behind it must not scroll while it is open — a drawer you can
  // scroll the background through feels broken on touch.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileNavOpen]);

  const { data: liveChat } = useQuery({
    queryKey: ["live-chat-widget"],
    queryFn: () => apiFetch<{ show: boolean; widgetId: string | null }>("/api/v1/settings/live-chat/widget"),
    enabled: Boolean(user?.tenantId),
    staleTime: 5 * 60 * 1000,
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-obsidian-950">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-subtle dark:border-obsidian-800 dark:bg-obsidian-900">
          <StatusDot status="ONLINE" pulse={true} />
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Initializing console session...
          </span>
        </div>
      </div>
    );
  }
  if (!user) return null;

  const has = (permission: string) => user.permissions.includes(permission);
  const isTenantScoped = user.tenantId !== null;

  const generalItems: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: <IconDashboard size={18} />, show: true },
    { href: "/sessions", label: "My sessions", icon: <IconSession size={18} />, show: true },
  ];

  const operationsItems: NavItem[] = [
    {
      href: "/customers",
      label: "Customers",
      icon: <IconUsers size={18} />,
      show: isTenantScoped && has("customers.read"),
    },
    {
      href: "/packages",
      label: "Packages",
      icon: <IconPackage size={18} />,
      show: isTenantScoped && has("packages.read"),
    },
    {
      href: "/invoices",
      label: "Invoices",
      icon: <IconInvoice size={18} />,
      show: isTenantScoped && has("billing.read"),
    },
    {
      href: "/settlement",
      label: "Settlement",
      icon: <IconInvoice size={18} />,
      show: isTenantScoped && has("payments.read"),
    },
    {
      href: "/purchase-attempts",
      label: "Purchase attempts",
      icon: <IconPulse size={18} />,
      show: isTenantScoped && has("payments.read"),
    },
    {
      // One entry, not four. These were separate pages for M-Pesa, Paystack and Pesapal, which
      // presented four unrelated features where an operator has one question and needs one answer.
      href: "/payments-setup",
      label: "Getting paid",
      icon: <IconMpesa size={18} />,
      show: isTenantScoped && (has("settings.manage") || has("payments.reconcile")),
    },
    {
      href: "/sms",
      label: "SMS Gateway",
      icon: <IconMessage size={18} />,
      show: isTenantScoped && has("settings.manage"),
    },
    {
      href: "/routers",
      label: "Routers",
      icon: <IconRouter size={18} />,
      show: isTenantScoped && has("routers.read"),
    },
    {
      href: "/vlans",
      label: "VLANs",
      icon: <IconLayers size={18} />,
      show: isTenantScoped && has("vlans.read"),
    },
    {
      href: "/ip-pools",
      label: "IP Pools",
      icon: <IconNetworkPool size={18} />,
      show: isTenantScoped && has("routers.read"),
    },
    {
      href: "/vouchers",
      label: "Hotspot & Captive Portal",
      icon: <IconTicket size={18} />,
      show: isTenantScoped && has("radius.manage"),
    },
    {
      href: "/themes",
      label: "Hotspot Themes",
      icon: <IconPalette size={18} />,
      show: isTenantScoped && has("radius.manage"),
    },
    {
      href: "/captive-customizer",
      label: "Captive Portal Studio",
      icon: <IconSparkles size={18} />,
      show: isTenantScoped && has("radius.manage"),
    },
    {
      href: "/app",
      label: "Customer Mobile App",
      icon: <IconLayers size={18} />,
      show: true,
    },
    {
      href: "/tickets",
      label: "Support Tickets",
      icon: <IconLifeBuoy size={18} />,
      show: isTenantScoped && has("tickets.read"),
    },
    {
      href: "/reports",
      label: "Bandwidth Usage",
      icon: <IconSpeed size={18} />,
      show: isTenantScoped && has("reports.read"),
    },
    {
      href: "/audit-log",
      label: "Audit log",
      icon: <IconShield size={18} />,
      show: isTenantScoped && has("audit_logs.read"),
    },
    {
      href: "/payments-setup",
      label: "Payment Gateways",
      icon: <IconMpesa size={18} />,
      show: isTenantScoped && (has("settings.manage") || has("billing.manage")),
    },
    {
      href: "/shop",
      label: "Hardware Store",
      icon: <IconPackage size={18} />,
      show: isTenantScoped,
    },
    {
      href: "/settings",
      label: "Settings",
      icon: <IconMaintenance size={18} />,
      show: isTenantScoped && has("settings.manage"),
    },
  ];

  const platformItems: NavItem[] = [
    {
      // Money held on tenants' behalf is the platform's largest liability, so it sits at the top
      // of the platform section rather than inside a settings page.
      href: "/money",
      label: "Money management",
      icon: <IconInvoice size={18} />,
      show: !isTenantScoped && has("tenants.read"),
    },
    {
      href: "/tenants",
      label: "Tenants",
      icon: <IconTenants size={18} />,
      show: !isTenantScoped && has("tenants.read"),
    },
    {
      href: "/plans",
      label: "Subscription Plans",
      icon: <IconLayers size={18} />,
      show: !isTenantScoped && has("plans.manage"),
    },
    {
      href: "/maintenance",
      label: "Maintenance mode",
      icon: <IconMaintenance size={18} />,
      show: !isTenantScoped && has("maintenance.manage"),
    },
    {
      href: "/testimonials",
      label: "Landing Testimonials",
      icon: <IconMessage size={18} />,
      show: !isTenantScoped && has("maintenance.manage"),
    },
    {
      href: "/landing-editor",
      label: "Landing Page CMS",
      icon: <IconSparkles size={18} />,
      show: !isTenantScoped && has("maintenance.manage"),
    },
    {
      href: "/admin/products",
      label: "Hardware & Pricing",
      icon: <IconPackage size={18} />,
      show: !isTenantScoped && has("tenants.read"),
    },
    {
      href: "/admin/orders",
      label: "Hardware Orders",
      icon: <IconInvoice size={18} />,
      show: !isTenantScoped && has("tenants.read"),
    },
    {
      href: "/platform-mpesa",
      label: "Platform M-Pesa",
      icon: <IconMpesa size={18} />,
      show: !isTenantScoped && has("tenants.create"),
    },
    {
      href: "/platform-google-signin",
      label: "Google Sign-In",
      icon: <IconLock size={18} />,
      show: !isTenantScoped && has("tenants.create"),
    },
    {
      href: "/platform-whatsapp",
      label: "Platform WhatsApp",
      icon: <IconMessage size={18} />,
      show: !isTenantScoped && has("tenants.create"),
    },
  ];

  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <TenantThemeStyle brandColor={user.tenantBrandColor}>
      <div className="flex min-h-screen w-full bg-[#0d131f] antialiased text-slate-100 selection:bg-cyan-500 selection:text-slate-950 overflow-x-hidden">
        {/* Backdrop for Mobile & Tablet (<1024px). Tapping off the drawer closes it. */}
        {mobileNavOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm transition-opacity lg:hidden"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar Drawer:
            - Desktop (≥1024px): Static side column occupying 256px.
            - Mobile/Tablet (<1024px): Overlay drawer sliding in smoothly from the left. */}
        <aside
          id="dashboard-nav"
          className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] shrink-0 flex-col border-r border-[#1a2638] bg-[#101726] text-slate-200 transition-transform duration-300 ease-in-out shadow-2xl lg:static lg:z-auto lg:w-64 lg:max-w-none lg:shadow-none lg:translate-x-0 ${
            mobileNavOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {/* Brand Header */}
          <div className="flex items-center gap-3 px-5 py-4 sm:py-5 border-b border-[#1a2638]">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-emerald-500 text-sm font-black text-slate-950 shadow-md shadow-cyan-500/20">
              M
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-sm font-black tracking-tight block truncate text-white">
                MASHUP<span className="text-cyan-400">KGRID</span>
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block truncate flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                {user.tenantId ? "Operator NOC Console" : "Platform Root"}
              </span>
            </div>
            {/* Explicit Close Button for Mobile Drawer */}
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close navigation menu"
              className="ml-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-[#1a2537] hover:text-white lg:hidden"
            >
              <IconClose size={20} />
            </button>
          </div>

          {/* Nav Links */}
          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4 scrollbar-none">
            {generalItems.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActive(item.href)}
              />
            ))}

            {operationsItems.some((item) => item.show) && (
              <>
                <p className="mb-1.5 mt-6 px-3 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                  Operations &amp; Network
                </p>
                {operationsItems
                  .filter((item) => item.show)
                  .map((item) => (
                    <NavLink
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      active={isActive(item.href)}
                    />
                  ))}
              </>
            )}

            {platformItems.some((item) => item.show) && (
              <>
                <p className="mb-1.5 mt-6 px-3 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                  Platform Admin
                </p>
                {platformItems
                  .filter((item) => item.show)
                  .map((item) => (
                    <NavLink
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      active={isActive(item.href)}
                    />
                  ))}
              </>
            )}
          </nav>

          {/* User Account Footer Card */}
          <div className="border-t border-[#1a2638] p-3 bg-[#0d1421]">
            <div className="mb-3 flex items-center gap-2.5 px-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-xs font-bold text-cyan-300 border border-cyan-500/30">
                {initialsOf(user.email)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white">
                  {user.email ?? "Signed in"}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <StatusDot status="ONLINE" pulse={false} />
                  <p className="truncate text-[10px] text-slate-400">
                    {!user.tenantId ? "Super Admin" : has("reports.read") ? "Staff" : "Customer"}
                  </p>
                </div>
              </div>
            </div>
            <Button
              variant="secondary"
              className="w-full gap-2 text-xs py-1.5 bg-[#182335] hover:bg-[#202d44] text-slate-200 border border-[#24334a]"
              onClick={() => logout().then(() => router.replace("/login"))}
            >
              <IconLogOut size={14} />
              <span>Sign out</span>
            </Button>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex min-w-0 flex-1 flex-col w-full overflow-x-hidden">
          {/* Top Bar for Desktop & Mobile */}
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[#1a2638] bg-[#101726]/90 px-4 sm:px-6 backdrop-blur-md">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open navigation menu"
                aria-expanded={mobileNavOpen}
                aria-controls="dashboard-nav"
                className="-ml-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-[#1a2537] hover:text-white active:scale-95 lg:hidden"
              >
                <IconMenu size={20} />
              </button>

              <div className="hidden sm:flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-[10px] font-bold">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span>NOC Telemetry Live</span>
                </span>
                <span className="text-slate-600 dark:text-slate-600 hidden md:inline">•</span>
                <span className="text-[11px] text-slate-400 font-mono hidden md:inline">
                  MikroTik REST API Connected · FreeRADIUS Sub-2ms
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <Link
                href="/shop"
                target="_blank"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#172233] hover:bg-[#1f2c42] border border-[#24334a] text-slate-200 text-xs font-semibold transition-all"
              >
                <span>🛒</span>
                <span>Hardware Store</span>
              </Link>

              {user.tenantTrialEndsAt && (
                <div className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-400 border border-amber-500/20">
                  <span>⏳</span>
                  <span className="hidden sm:inline">Trial</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => logout().then(() => router.replace("/login"))}
                title="Sign out"
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/10 text-xs font-bold text-cyan-300 border border-cyan-500/30 hover:border-cyan-400 transition-all active:scale-95"
              >
                {initialsOf(user.email)}
              </button>
            </div>
          </header>

          <main className="min-w-0 flex-1 p-3.5 sm:p-5 md:p-6 lg:p-8 w-full max-w-7xl mx-auto overflow-x-hidden">
            <DashboardBanners />
            {children}
          </main>
        </div>
        {liveChat?.show && <TawkToWidget widgetId={liveChat.widgetId} />}
      </div>
    </TenantThemeStyle>
  );
}
