"use client";

import { useEffect, type ReactNode } from "react";
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

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

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
      href: "/mpesa",
      label: "M-Pesa Paybill",
      icon: <IconMpesa size={18} />,
      show: isTenantScoped && (has("settings.manage") || has("payments.reconcile")),
    },
    {
      href: "/paystack",
      label: "Paystack",
      icon: <IconInvoice size={18} />,
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
      href: "/settings",
      label: "Settings",
      icon: <IconMaintenance size={18} />,
      show: isTenantScoped && has("settings.manage"),
    },
  ];

  const platformItems: NavItem[] = [
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
    <div className="flex min-h-screen bg-slate-50 dark:bg-obsidian-950 antialiased text-slate-900 dark:text-slate-100">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200/80 bg-white dark:border-obsidian-800 dark:bg-obsidian-900">
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-100 dark:border-obsidian-800/80">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 text-sm font-bold text-white shadow-sm">
            M
          </div>
          <div className="min-w-0">
            <span className="text-sm font-bold tracking-tight block truncate text-slate-900 dark:text-white">
              MASHUPKGRID
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {user.tenantId ? `Tenant: ${user.tenantId}` : "Platform Root"}
            </span>
          </div>
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
      <main className="flex-1 overflow-y-auto p-8 max-w-7xl">
        <DashboardBanners />
        {children}
      </main>
      {liveChat?.show && <TawkToWidget widgetId={liveChat.widgetId} />}
    </div>
    </TenantThemeStyle>
  );
}
