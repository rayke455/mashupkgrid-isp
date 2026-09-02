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
      className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 ${
        active
          ? "bg-brand-50 text-brand-700 shadow-xs dark:bg-brand-950/70 dark:text-brand-300 dark:border dark:border-brand-900/60 font-semibold"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-obsidian-850 dark:hover:text-slate-100"
      }`}
    >
      <span
        className={`shrink-0 transition-colors ${
          active
            ? "text-brand-600 dark:text-brand-400"
            : "text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300"
        }`}
      >
        {icon}
      </span>
      <span className="truncate">{label}</span>
      {active && (
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-600 dark:bg-brand-400" />
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
      show: has("tenants.read"),
    },
    {
      href: "/tenants",
      label: "Tenants",
      icon: <IconTenants size={18} />,
      show: has("tenants.read"),
    },
    {
      href: "/plans",
      label: "Subscription Plans",
      icon: <IconLayers size={18} />,
      show: has("plans.manage"),
    },
    {
      href: "/maintenance",
      label: "Maintenance mode",
      icon: <IconMaintenance size={18} />,
      show: has("maintenance.manage"),
    },
    {
      href: "/testimonials",
      label: "Landing Testimonials",
      icon: <IconMessage size={18} />,
      show: has("maintenance.manage") || has("tenants.create") || !isTenantScoped,
    },
    {
      href: "/landing-editor",
      label: "Landing Page CMS",
      icon: <IconSparkles size={18} />,
      show: has("maintenance.manage") || has("tenants.create") || !isTenantScoped,
    },
    {
      href: "/platform-mpesa",
      label: "Platform M-Pesa",
      icon: <IconMpesa size={18} />,
      show: has("tenants.create"),
    },
    {
      href: "/platform-google-signin",
      label: "Google Sign-In",
      icon: <IconLock size={18} />,
      show: has("tenants.create"),
    },
    {
      href: "/platform-whatsapp",
      label: "Platform WhatsApp",
      icon: <IconMessage size={18} />,
      show: has("tenants.create") || !isTenantScoped,
    },
  ];

  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <TenantThemeStyle brandColor={user.tenantBrandColor}>
      <div className="flex min-h-screen w-full bg-slate-50 dark:bg-obsidian-950 antialiased text-slate-900 dark:text-slate-100 overflow-x-hidden">
        {/* Backdrop for Mobile & Tablet (<1024px). Tapping off the drawer closes it. */}
        {mobileNavOpen && (
          <div
            className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-xs transition-opacity lg:hidden"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar Drawer:
            - Desktop (≥1024px): Static side column occupying 256px.
            - Mobile/Tablet (<1024px): Overlay drawer sliding in smoothly from the left. */}
        <aside
          id="dashboard-nav"
          className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] shrink-0 flex-col border-r border-slate-200/80 bg-white transition-transform duration-300 ease-in-out dark:border-obsidian-800 dark:bg-obsidian-900 shadow-2xl lg:static lg:z-auto lg:w-64 lg:max-w-none lg:shadow-none lg:translate-x-0 ${
            mobileNavOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {/* Brand Header */}
          <div className="flex items-center gap-3 px-5 py-4 sm:py-5 border-b border-slate-100 dark:border-obsidian-800/80">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 text-sm font-bold text-white shadow-sm">
              M
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-sm font-bold tracking-tight block truncate text-slate-900 dark:text-white">
                MASHUPKGRID
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 block truncate">
                {user.tenantId ? `Tenant: ${user.tenantId.slice(0, 18)}...` : "Platform Root"}
              </span>
            </div>
            {/* Explicit Close Button for Mobile Drawer */}
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close navigation menu"
              className="ml-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-obsidian-850 dark:hover:text-white lg:hidden"
            >
              <IconClose size={20} />
            </button>
          </div>

          {/* Nav Links */}
          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
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
                <p className="mb-1.5 mt-6 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Operations
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
                <p className="mb-1.5 mt-6 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
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
          <div className="border-t border-slate-200/80 p-3 dark:border-obsidian-800 bg-slate-50/50 dark:bg-obsidian-950/40">
            <div className="mb-3 flex items-center gap-2.5 px-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300 border border-brand-200 dark:border-brand-900/60">
                {initialsOf(user.email)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                  {user.email ?? "Signed in"}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <StatusDot status="ONLINE" pulse={false} />
                  <p className="truncate text-[10px] text-slate-500">
                    {!user.tenantId ? "Super Admin" : has("reports.read") ? "Staff" : "Customer"}
                  </p>
                </div>
              </div>
            </div>
            <Button
              variant="secondary"
              className="w-full gap-2 text-xs py-1.5"
              onClick={() => logout().then(() => router.replace("/login"))}
            >
              <IconLogOut size={14} />
              <span>Sign out</span>
            </Button>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex min-w-0 flex-1 flex-col w-full overflow-x-hidden">
          {/* Mobile & Tablet Top Bar (<1024px) */}
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200/80 bg-white/95 px-3 sm:px-4 backdrop-blur dark:border-obsidian-800 dark:bg-obsidian-900/95 lg:hidden">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open navigation menu"
                aria-expanded={mobileNavOpen}
                aria-controls="dashboard-nav"
                className="-ml-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-obsidian-850 dark:hover:text-white active:scale-95"
              >
                <IconMenu size={22} />
              </button>
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 to-brand-800 text-xs font-bold text-white shadow-xs">
                  M
                </div>
                <div className="min-w-0">
                  <span className="truncate text-xs sm:text-sm font-bold tracking-tight text-slate-900 dark:text-white block">
                    MASHUPKGRID
                  </span>
                  <span className="text-[9px] font-semibold text-slate-400 block truncate">
                    {user.tenantId ? `Tenant Console` : "Super Admin"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {user.tenantTrialEndsAt && (
                <div className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  <span>⏳</span>
                  <span className="hidden sm:inline">Trial</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => logout().then(() => router.replace("/login"))}
                title="Sign out"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300 border border-brand-200 dark:border-brand-900/60 hover:border-brand-400 transition-all active:scale-95"
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
