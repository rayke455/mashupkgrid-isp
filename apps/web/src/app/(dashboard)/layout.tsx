"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api-client";
import { TenantThemeStyle } from "@/components/tenant-theme-style";
import { TawkToWidget } from "@/components/tawk-to-widget";
import { DashboardBanners } from "@/components/dashboard-banners";
import { TrialExpiredBlocker } from "@/components/trial-expired-blocker";
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
  IconMenu,
  IconClose,
  IconPulse,
  IconShield,
  IconBell,
} from "@/components/icons";
import { NotificationBell } from "@/components/notifications";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  show: boolean;
  /** Active only on this exact path, for section roots like /payments. */
  exact?: boolean;
}

interface NavSection {
  title?: string;
  items: NavItem[];
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
      aria-current={active ? "page" : undefined}
      className={`group flex items-center gap-3 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
        active ? "bg-obsidian-800 text-white" : "text-slate-400 hover:bg-obsidian-900 hover:text-slate-100"
      }`}
    >
      <span className={`shrink-0 ${active ? "text-brand-400" : "text-slate-500 group-hover:text-slate-300"}`}>{icon}</span>
      <span className="truncate">{label}</span>
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
        <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-transparent dark:border-obsidian-700 dark:border-t-transparent" aria-hidden="true" />
          Loading…
        </div>
      </div>
    );
  }
  if (!user) return null;

  const has = (permission: string) => user.permissions.includes(permission);
  const isTenantScoped = user.tenantId !== null;

  // Grouped by the job at hand, in the order an ISP works through a day: customers, hotspot,
  // network, money, then account housekeeping. Platform admins see their own groups instead.
  const sections: NavSection[] = [
    {
      items: [
        { href: "/dashboard", label: "Dashboard", icon: <IconDashboard size={18} />, show: true },
        { href: "/notifications", label: "Notifications", icon: <IconBell size={18} />, show: isTenantScoped },
      ],
    },
    {
      title: "Customers",
      items: [
        { href: "/customers", label: "Customers", icon: <IconUsers size={18} />, show: isTenantScoped && has("customers.read") },
        { href: "/packages", label: "Internet plans", icon: <IconPackage size={18} />, show: isTenantScoped && has("packages.read") },
        { href: "/invoices", label: "Invoices", icon: <IconInvoice size={18} />, show: isTenantScoped && has("billing.read") },
        { href: "/tickets", label: "Support tickets", icon: <IconLifeBuoy size={18} />, show: isTenantScoped && has("tickets.read") },
      ],
    },
    {
      title: "Hotspot",
      items: [
        { href: "/vouchers", label: "Hotspot", icon: <IconTicket size={18} />, show: isTenantScoped && has("radius.manage") },
        { href: "/purchase-attempts", label: "Purchase attempts", icon: <IconPulse size={18} />, show: isTenantScoped && has("payments.read") },
      ],
    },
    {
      title: "Network",
      items: [
        { href: "/routers", label: "Routers", icon: <IconRouter size={18} />, show: isTenantScoped && has("routers.read") },
        { href: "/vlans", label: "VLANs", icon: <IconLayers size={18} />, show: isTenantScoped && has("vlans.read") },
        { href: "/ip-pools", label: "IP pools", icon: <IconNetworkPool size={18} />, show: isTenantScoped && has("routers.read") },
        { href: "/reports", label: "Bandwidth usage", icon: <IconSpeed size={18} />, show: isTenantScoped && has("reports.read") },
      ],
    },
    {
      // The MashupHost gateway, collections, balance and settlements: money held on a tenant's
      // behalf is the platform's largest liability, so it stays one clear group.
      title: "Money",
      items: [
        { href: "/payments", label: "Payments", icon: <IconDashboard size={18} />, show: isTenantScoped && has("payments.read"), exact: true },
        { href: "/payments/transactions", label: "Transactions", icon: <IconMpesa size={18} />, show: isTenantScoped && has("payments.read") },
        { href: "/payments/balance", label: "Balance", icon: <IconInvoice size={18} />, show: isTenantScoped && has("payments.read") },
        { href: "/payments/settlements", label: "Settlements", icon: <IconLayers size={18} />, show: isTenantScoped && has("payments.read") },
        {
          // One entry, not four: M-Pesa, Paystack and Pesapal answer one question for an operator.
          href: "/payments-setup",
          label: "Getting paid",
          icon: <IconMpesa size={18} />,
          show: isTenantScoped && (has("settings.manage") || has("payments.reconcile")),
        },
      ],
    },
    {
      title: "Account",
      items: [
        { href: "/settings", label: "Settings", icon: <IconMaintenance size={18} />, show: isTenantScoped && has("settings.manage") },
        { href: "/sms", label: "SMS gateway", icon: <IconMessage size={18} />, show: isTenantScoped && has("settings.manage") },
        { href: "/app", label: "Customer mobile app", icon: <IconLayers size={18} />, show: isTenantScoped },
        { href: "/shop", label: "Hardware store", icon: <IconPackage size={18} />, show: isTenantScoped },
        { href: "/audit-log", label: "Audit log", icon: <IconShield size={18} />, show: isTenantScoped && has("audit_logs.read") },
        { href: "/sessions", label: "My sessions", icon: <IconSession size={18} />, show: true },
      ],
    },
    {
      title: "Platform",
      items: [
        { href: "/tenants", label: "Tenants", icon: <IconTenants size={18} />, show: !isTenantScoped && has("tenants.read") },
        { href: "/admin/notifications", label: "Notifications", icon: <IconBell size={18} />, show: !isTenantScoped && has("tenants.update") },
        { href: "/plans", label: "Subscription plans", icon: <IconLayers size={18} />, show: !isTenantScoped && has("plans.manage") },
        { href: "/maintenance", label: "Maintenance mode", icon: <IconMaintenance size={18} />, show: !isTenantScoped && has("maintenance.manage") },
      ],
    },
    {
      title: "Payments",
      items: [
        { href: "/admin/payments", label: "Overview", icon: <IconDashboard size={18} />, show: !isTenantScoped && has("platform_payments.read"), exact: true },
        { href: "/admin/payments/transactions", label: "Transactions", icon: <IconMpesa size={18} />, show: !isTenantScoped && has("platform_payments.read") },
        { href: "/admin/payments/settlements", label: "Settlements", icon: <IconLayers size={18} />, show: !isTenantScoped && has("platform_payments.read") },
        { href: "/admin/payments/reconciliation", label: "Reconciliation", icon: <IconShield size={18} />, show: !isTenantScoped && has("platform_payments.read") },
        { href: "/admin/payments/gateway", label: "Payment gateway", icon: <IconLock size={18} />, show: !isTenantScoped && has("platform_payments.read") },
        { href: "/admin/payments/fees", label: "Fees", icon: <IconInvoice size={18} />, show: !isTenantScoped && has("platform_payments.read") },
        { href: "/admin/payments/webhooks", label: "Webhooks", icon: <IconPulse size={18} />, show: !isTenantScoped && has("platform_payments.read") },
      ],
    },
    {
      title: "Store",
      items: [
        { href: "/admin/products", label: "Hardware & pricing", icon: <IconPackage size={18} />, show: !isTenantScoped && has("tenants.read") },
        { href: "/admin/orders", label: "Hardware orders", icon: <IconInvoice size={18} />, show: !isTenantScoped && has("tenants.read") },
      ],
    },
    {
      title: "Website",
      items: [
        { href: "/landing-editor", label: "Landing page", icon: <IconSparkles size={18} />, show: !isTenantScoped && has("maintenance.manage") },
        { href: "/testimonials", label: "Testimonials", icon: <IconMessage size={18} />, show: !isTenantScoped && has("maintenance.manage") },
      ],
    },
    {
      title: "Integrations",
      items: [
        { href: "/platform-mpesa", label: "Platform M-Pesa", icon: <IconMpesa size={18} />, show: !isTenantScoped && has("tenants.create") },
        { href: "/platform-google-signin", label: "Google sign-in", icon: <IconLock size={18} />, show: !isTenantScoped && has("tenants.create") },
        { href: "/platform-whatsapp", label: "Platform WhatsApp", icon: <IconMessage size={18} />, show: !isTenantScoped && has("tenants.create") },
      ],
    },
  ];

  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <TenantThemeStyle brandColor={user.tenantBrandColor}>
      <div className="flex min-h-screen w-full overflow-x-hidden bg-obsidian-950 text-slate-100 antialiased selection:bg-brand-500/30">
        {/* Backdrop for Mobile & Tablet (<1024px). Tapping off the drawer closes it. */}
        {mobileNavOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/70 transition-opacity lg:hidden"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar Drawer:
            - Desktop (≥1024px): Static side column occupying 256px.
            - Mobile/Tablet (<1024px): Overlay drawer sliding in smoothly from the left. */}
        <aside
          id="dashboard-nav"
          className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] shrink-0 flex-col border-r border-obsidian-800 bg-obsidian-950 text-slate-200 transition-transform duration-300 ease-in-out lg:static lg:z-auto lg:w-60 lg:max-w-none lg:translate-x-0 ${
            mobileNavOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {/* Brand Header */}
          <div className="flex h-14 items-center gap-3 border-b border-obsidian-800 px-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-sm font-semibold text-white">M</div>
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-white">MashupHost</span>
              <span className="block truncate text-xs text-slate-500">{user.tenantId ? user.tenantSlug ?? "Operator" : "Platform admin"}</span>
            </div>
            {/* Explicit Close Button for Mobile Drawer */}
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close navigation menu"
              className="ml-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-obsidian-800 hover:text-white lg:hidden"
            >
              <IconClose size={20} />
            </button>
          </div>

          {/* Nav Links */}
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4 scrollbar-none">
            {sections.map((section, i) => {
              const visible = section.items.filter((item) => item.show);
              if (visible.length === 0) return null;
              return (
                <div key={section.title ?? i}>
                  {section.title && <p className="px-3 pb-1 pt-5 text-xs font-medium text-slate-500">{section.title}</p>}
                  {visible.map((item) => (
                    <NavLink
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      active={item.exact ? pathname === item.href : isActive(item.href)}
                    />
                  ))}
                </div>
              );
            })}
          </nav>

          {/* User Account Footer Card */}
          <div className="border-t border-obsidian-800 p-3">
            <div className="flex items-center gap-2.5 px-1">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-obsidian-800 text-xs font-medium text-slate-200">
                {initialsOf(user.email)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-slate-100">{user.email ?? "Signed in"}</p>
                <p className="truncate text-xs text-slate-500">
                  {!user.tenantId ? "Super admin" : has("reports.read") ? "Staff" : "Customer"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => logout().then(() => router.replace("/login"))}
                title="Sign out"
                aria-label="Sign out"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-obsidian-800 hover:text-white"
              >
                <IconLogOut size={16} />
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex min-w-0 flex-1 flex-col w-full overflow-x-hidden">
          {/* Top Bar for Desktop & Mobile */}
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-obsidian-800 bg-obsidian-950/95 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open navigation menu"
                aria-expanded={mobileNavOpen}
                aria-controls="dashboard-nav"
                className="-ml-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-obsidian-800 hover:text-white lg:hidden"
              >
                <IconMenu size={20} />
              </button>
              <span className="truncate text-sm font-medium text-slate-300 lg:hidden">MashupHost</span>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {isTenantScoped && <NotificationBell />}
              {user.tenantTrialEndsAt && (
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                    user.isTrialExpired
                      ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                      : "border-amber-500/25 bg-amber-500/10 text-amber-300"
                  }`}
                >
                  {user.isTrialExpired ? "Trial Expired" : "Trial"}
                </span>
              )}
              {isTenantScoped && (
                <Link
                  href="/shop"
                  target="_blank"
                  className="hidden items-center rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-slate-400 transition-colors hover:bg-obsidian-800 hover:text-white sm:inline-flex"
                >
                  Hardware store
                </Link>
              )}
            </div>
          </header>

          <main className="mx-auto w-full min-w-0 max-w-7xl flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">
            <DashboardBanners />
            {user.isTrialExpired &&
            !pathname.startsWith("/settings/billing") &&
            !pathname.startsWith("/settings/account") ? (
              <TrialExpiredBlocker />
            ) : (
              children
            )}
          </main>
        </div>
        {liveChat?.show && <TawkToWidget widgetId={liveChat.widgetId} />}
      </div>
    </TenantThemeStyle>
  );
}
