"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api-client";
import { TrendChart } from "@/components/charts/trend-chart";
import { StackedColumns } from "@/components/charts/stacked-columns";
import { BarList } from "@/components/charts/bar-list";
import { ChartTable } from "@/components/charts/chart-table";
import { formatMoney } from "@/lib/money";
import { Card, Badge, StatusDot, Unavailable, Button } from "@/components/ui";
import { CustomerPortal } from "@/components/customer-portal";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import {
  IconUsers,
  IconMpesa,
  IconInvoice,
  IconRouter,
  IconTicket,
  IconArrowRight,
  IconNetworkPool,
} from "@/components/icons";

interface OutstandingSummary {
  outstandingMinor: number;
  overdueCount: number;
  overdueMinor: number;
  invoiceCount: number;
}

interface RevenueDay {
  date: string;
  totalMinor: number;
  paymentCount: number;
}

interface BandwidthDay {
  date: string;
  uploadBytes: number;
  downloadBytes: number;
  sessionCount: number;
}

interface TopConsumer {
  username: string;
  uploadBytes: number;
  downloadBytes: number;
  totalBytes: number;
  sessionCount: number;
}

interface PaginatedCustomers {
  pagination: { total: number };
}

interface RouterRow {
  status: "UNKNOWN" | "ONLINE" | "WARNING" | "DOWN";
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function friendlyNameFromEmail(email: string | null | undefined): string {
  if (!email) return "there";
  const local = email.split("@")[0] ?? "";
  const first = local.split(/[._-]/)[0] ?? local;
  return first.length > 0 ? first[0]!.toUpperCase() + first.slice(1) : "there";
}

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

interface PaginatedTenants {
  items: Array<{
    id: string;
    name: string;
    slug: string;
    status: "ACTIVE" | "SUSPENDED" | "CANCELLED";
    createdAt: string;
    trialEndsAt: string | null;
    disabledFeatures: string[];
    platformUrl: string;
  }>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface MaintenanceStatus {
  active: boolean;
  message?: string | null;
}

interface GoogleAuthConfig {
  enabled: boolean;
  clientId: string | null;
}

export default function DashboardHomePage() {
  const { user } = useAuth();
  const isPlatform = user?.tenantId === null;
  const isStaff = !isPlatform && Boolean(user?.permissions.includes("reports.read"));
  const [bandwidthRange, setBandwidthRange] = useState<number>(14);

  // Platform / Super Admin Queries
  const { data: platformTenants } = useQuery({
    queryKey: ["platform-tenants-summary"],
    queryFn: () => apiFetch<PaginatedTenants>("/api/v1/platform/tenants?limit=10"),
    enabled: isPlatform,
  });

  const { data: platformGoogle } = useQuery({
    queryKey: ["platform-google-config"],
    queryFn: () => apiFetch<GoogleAuthConfig>("/api/v1/auth/google/config", { skipAuth: true }),
    enabled: isPlatform,
  });

  const { data: platformMaintenance } = useQuery({
    queryKey: ["platform-maintenance"],
    queryFn: () => apiFetch<MaintenanceStatus>("/api/v1/maintenance", { skipAuth: true }),
    enabled: isPlatform,
  });

  // Tenant Staff Queries
  const { data: outstanding } = useQuery({
    queryKey: ["report-outstanding"],
    queryFn: () => apiFetch<OutstandingSummary>("/api/v1/reports/outstanding"),
    enabled: isStaff,
  });

  const { data: revenue } = useQuery({
    queryKey: ["report-revenue"],
    queryFn: () => apiFetch<RevenueDay[]>("/api/v1/reports/revenue?days=30"),
    enabled: isStaff,
  });

  const { data: bandwidth } = useQuery({
    queryKey: ["report-bandwidth", bandwidthRange],
    queryFn: () => apiFetch<BandwidthDay[]>(`/api/v1/reports/bandwidth?days=${bandwidthRange}`),
    enabled: isStaff,
  });

  const { data: topConsumers } = useQuery({
    queryKey: ["report-top-consumers"],
    queryFn: () => apiFetch<TopConsumer[]>("/api/v1/reports/bandwidth/top-consumers?days=30&limit=5"),
    enabled: isStaff,
  });

  const { data: customers } = useQuery({
    queryKey: ["customers-count"],
    queryFn: () => apiFetch<PaginatedCustomers>("/api/v1/customers?limit=1"),
    enabled: isStaff && Boolean(user?.permissions.includes("customers.read")),
  });

  const { data: routers } = useQuery({
    queryKey: ["routers"],
    queryFn: () => apiFetch<RouterRow[]>("/api/v1/routers"),
    enabled: isStaff && Boolean(user?.permissions.includes("routers.read")),
  });

  const revenue30dMinor = revenue?.reduce((sum, day) => sum + day.totalMinor, 0) ?? null;
  const totalPaymentCount = revenue?.reduce((sum, day) => sum + day.paymentCount, 0) ?? 0;

  const totalDownloadBytes = bandwidth?.reduce((sum, day) => sum + day.downloadBytes, 0) ?? 0;
  const totalUploadBytes = bandwidth?.reduce((sum, day) => sum + day.uploadBytes, 0) ?? 0;
  const totalBandwidthBytes = totalDownloadBytes + totalUploadBytes;

  const onlineRouters = routers?.filter((r) => r.status === "ONLINE").length ?? 0;
  const warningRouters = routers?.filter((r) => r.status === "WARNING").length ?? 0;
  const downRouters = routers?.filter((r) => r.status === "DOWN").length ?? 0;
  const totalRouters = routers?.length ?? 0;

  const maxDailyBytes = Math.max(
    ...(bandwidth?.map((d) => d.downloadBytes + d.uploadBytes) ?? [1]),
    1
  );

  const activeTenantsCount = platformTenants?.items.filter((t) => t.status === "ACTIVE").length ?? 0;
  const trialTenantsCount = platformTenants?.items.filter((t) => t.trialEndsAt && new Date(t.trialEndsAt) > new Date()).length ?? 0;

  return (
    <div className="space-y-6 sm:space-y-8 w-full min-w-0 animate-fade-in-up">
      {/* Top Welcome & Telemetry Header */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 animate-gradient-flow p-4 sm:p-6 lg:p-8 text-white shadow-2xl border border-indigo-500/20 w-full min-w-0">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-cyan-500/15 blur-3xl pointer-events-none animate-float-gentle" />
        <div className="absolute -left-16 -bottom-16 h-64 w-64 rounded-full bg-purple-500/15 blur-3xl pointer-events-none animate-float-gentle" style={{ animationDelay: "2s" }} />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6 min-w-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400 animate-pulse-ring" />
              <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-emerald-400 truncate">
                {isPlatform ? "Super Admin Master Console" : "Live Operations Telemetry"}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight break-words text-white">
              {isPlatform
                ? "Platform Control & Multi-Tenant Center"
                : isStaff
                ? `Good ${timeOfDayGreeting()}, ${friendlyNameFromEmail(user?.email)}.`
                : "My Account"}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1.5 max-w-xl break-words leading-relaxed">
              {isPlatform
                ? "Manage tenant organizations, global Google OAuth, system maintenance, and infrastructure health."
                : isStaff
                ? "Real-time ISP subscriber traffic, FreeRADIUS bandwidth accounting & payment reconciliation."
                : "Your subscription, invoices, and connection details."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 shrink-0">
            {isPlatform ? (
              <>
                <Link
                  href="/tenants"
                  className="rounded-xl bg-purple-600 hover:bg-purple-500 border border-purple-400/40 px-3.5 py-2 text-xs font-bold text-white shadow-lg transition-all flex items-center gap-1.5 active:scale-95 text-center"
                >
                  <span>🏢</span>
                  <span>Provision Tenant</span>
                </Link>
                <Link
                  href="/platform-google-signin"
                  className="rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 px-3.5 py-2 text-xs font-bold text-slate-200 shadow-md transition-all flex items-center gap-1.5 active:scale-95 text-center"
                >
                  <span>🔐</span>
                  <span>Google Auth</span>
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/vouchers"
                  className="rounded-xl bg-purple-600/90 hover:bg-purple-600 border border-purple-400/40 px-3.5 py-2 text-xs font-bold text-white shadow-lg transition-all flex items-center gap-1.5 active:scale-95 text-center"
                >
                  <span>🎟️</span>
                  <span>Hotspot Vouchers</span>
                </Link>
                <Link
                  href="/customers"
                  className="rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 px-3.5 py-2 text-xs font-bold text-slate-200 shadow-md transition-all flex items-center gap-1.5 active:scale-95 text-center"
                >
                  <span>👤</span>
                  <span>+ Subscriber</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* SUPER ADMIN MASTER VIEW */}
      {isPlatform && (
        <div className="space-y-8">
          {/* 4 Super Admin Executive KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Total Tenants */}
            <div className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900/80 p-5 shadow-lg border border-purple-500/20 hover:border-purple-500/50 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Tenant ISPs
                </span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  <IconUsers size={20} />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                  {platformTenants?.pagination.total ?? "—"}
                </span>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                  <span className="font-semibold text-purple-600 dark:text-purple-400">{activeTenantsCount} active</span> · {trialTenantsCount} in trial
                </p>
              </div>
            </div>

            {/* Card 2: Google Sign-In Status */}
            <div className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900/80 p-5 shadow-lg border border-cyan-500/20 hover:border-cyan-500/50 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Google OAuth
                </span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                  <span>🔐</span>
                </div>
              </div>
              <div className="mt-3">
                <span className={`text-2xl font-black tracking-tight ${platformGoogle?.enabled ? "text-emerald-500" : "text-amber-500"}`}>
                  {platformGoogle?.enabled ? "Active & Verified" : "Needs Setup"}
                </span>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  <Link href="/platform-google-signin" className="font-semibold text-cyan-500 hover:underline">
                    Configure Client ID &rarr;
                  </Link>
                </p>
              </div>
            </div>

            {/* Card 3: System Operations Mode */}
            <div className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900/80 p-5 shadow-lg border border-emerald-500/20 hover:border-emerald-500/50 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Platform Status
                </span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <span className="h-3 w-3 rounded-full bg-emerald-500 animate-ping" />
                </div>
              </div>
              <div className="mt-3">
                <span className={`text-2xl font-black tracking-tight ${platformMaintenance?.active ? "text-rose-500" : "text-emerald-500"}`}>
                  {platformMaintenance?.active ? "Maintenance Mode" : "Normal Operations"}
                </span>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  <Link href="/maintenance" className="font-semibold text-emerald-500 hover:underline">
                    System Controls &rarr;
                  </Link>
                </p>
              </div>
            </div>

            {/* Card 4: Platform Gateways */}
            <div className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900/80 p-5 shadow-lg border border-amber-500/20 hover:border-amber-500/50 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Platform Gateways
                </span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <IconMpesa size={20} />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  M-Pesa &amp; Paystack
                </span>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono text-emerald-500 font-semibold">
                  Multi-Tenant Ready
                </p>
              </div>
            </div>
          </div>

          {/* Super Admin Tenant Management Directory */}
          <Card className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>🏢</span>
                  ISP Tenant Directory
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  All provisioned ISP tenants on this platform
                </p>
              </div>
              <Link
                href="/tenants"
                className="rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold px-3 py-1.5 transition-colors text-center"
              >
                Open Full Tenant Console &rarr;
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase text-[10px]">
                    <th className="pb-2">ISP Name</th>
                    <th className="pb-2">Subdomain / Slug</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Trial Status</th>
                    <th className="pb-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {platformTenants?.items.map((tenant) => (
                    <tr key={tenant.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors">
                      <td className="py-3 font-bold text-slate-900 dark:text-white">
                        {tenant.name}
                      </td>
                      <td className="py-3 font-mono text-purple-600 dark:text-purple-400">
                        {tenant.slug}
                      </td>
                      <td className="py-3">
                        <Badge variant={tenant.status === "ACTIVE" ? "success" : "neutral"}>
                          <StatusDot status={tenant.status === "ACTIVE" ? "ONLINE" : "UNKNOWN"} />
                          <span>{tenant.status}</span>
                        </Badge>
                      </td>
                      <td className="py-3 text-slate-500 dark:text-slate-400">
                        {tenant.trialEndsAt ? (
                          <span className="font-mono text-amber-500">
                            {new Date(tenant.trialEndsAt) > new Date() ? "Active Trial" : "Trial Expired"}
                          </span>
                        ) : (
                          <span className="text-emerald-500 font-semibold">Standard Active</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <Link
                          href="/tenants"
                          className="rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-purple-600 hover:text-white px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-300 transition-colors"
                        >
                          Manage &rarr;
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {(!platformTenants || platformTenants.items.length === 0) && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        No tenants provisioned yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Super Admin Quick Command Center */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link
              href="/tenants"
              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-purple-500/50 hover:shadow-lg transition-all"
            >
              <span className="text-2xl mb-2 block">🏢</span>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">Tenant Management</h3>
              <p className="text-xs text-slate-500 mt-1">Provision, suspend, or configure feature flags per ISP.</p>
            </Link>

            <Link
              href="/platform-google-signin"
              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-cyan-500/50 hover:shadow-lg transition-all"
            >
              <span className="text-2xl mb-2 block">🔐</span>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">Google OAuth Setup</h3>
              <p className="text-xs text-slate-500 mt-1">Configure platform-wide Google Sign In Client ID.</p>
            </Link>

            <Link
              href="/maintenance"
              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-500/50 hover:shadow-lg transition-all"
            >
              <span className="text-2xl mb-2 block">🛡️</span>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">Maintenance Mode</h3>
              <p className="text-xs text-slate-500 mt-1">Toggle platform-wide emergency maintenance banner.</p>
            </Link>

            <Link
              href="/developer"
              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-amber-500/50 hover:shadow-lg transition-all"
            >
              <span className="text-2xl mb-2 block">📜</span>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">Platform Audit Logs</h3>
              <p className="text-xs text-slate-500 mt-1">View real-time security events and operator audit logs.</p>
            </Link>
          </div>
        </div>
      )}

      {isStaff && <OnboardingChecklist />}

      {/* 4 Colorful Primary KPI Stat Cards with Glassmorphism & Shimmer Animations */}
      {isStaff && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in-up-delay-1">
          {/* Card 1: Subscribers (Purple / Indigo) */}
          <div className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900/80 p-5 shadow-lg border border-purple-500/20 hover:border-purple-500/60 transition-all card-shimmer hover-lift-card hover:shadow-purple-500/15">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Subscribers
              </span>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 group-hover:scale-115 group-hover:rotate-6 transition-all duration-300 shadow-sm">
                <IconUsers size={22} />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tight group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                {customers?.pagination.total ?? "—"}
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                <span className="font-semibold text-purple-600 dark:text-purple-400">Registered</span> accounts
              </p>
            </div>
          </div>

          {/* Card 2: 30-Day Revenue (Emerald / Green) */}
          <div className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900/80 p-5 shadow-lg border border-emerald-500/20 hover:border-emerald-500/60 transition-all card-shimmer hover-lift-card hover:shadow-emerald-500/15">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                30-Day Revenue
              </span>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 group-hover:scale-115 group-hover:rotate-6 transition-all duration-300 shadow-sm">
                <IconMpesa size={22} />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight group-hover:scale-105 inline-block transition-transform">
                {revenue30dMinor !== null ? formatMoney(revenue30dMinor) : "—"}
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{totalPaymentCount}</span> processed payments
              </p>
            </div>
          </div>

          {/* Card 3: Network Bandwidth (Cyan / Blue) */}
          <div className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900/80 p-5 shadow-lg border border-cyan-500/20 hover:border-cyan-500/60 transition-all card-shimmer hover-lift-card hover:shadow-cyan-500/15">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Total Bandwidth
              </span>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 group-hover:scale-115 group-hover:-rotate-6 transition-all duration-300 shadow-sm">
                <IconNetworkPool size={22} />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-black text-cyan-600 dark:text-cyan-400 tracking-tight group-hover:scale-105 inline-block transition-transform">
                {formatBytes(totalBandwidthBytes)}
              </span>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2 font-mono">
                <span className="text-cyan-500 font-semibold">↓ {formatBytes(totalDownloadBytes)}</span>
                <span>•</span>
                <span className="text-indigo-400 font-semibold">↑ {formatBytes(totalUploadBytes)}</span>
              </div>
            </div>
          </div>

          {/* Card 4: Hardware Health (Amber / Rose) */}
          <div className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900/80 p-5 shadow-lg border border-amber-500/20 hover:border-amber-500/60 transition-all card-shimmer hover-lift-card hover:shadow-amber-500/15">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                MikroTik Routers
              </span>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 group-hover:scale-115 group-hover:rotate-6 transition-all duration-300 shadow-sm">
                <IconRouter size={22} />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                {routers ? `${onlineRouters} / ${totalRouters}` : "—"}
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
                {downRouters > 0 ? (
                  <span className="text-rose-600 dark:text-rose-400 font-bold animate-pulse">
                    ⚠️ {downRouters} unreachable
                  </span>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse-ring" />
                    All nodes responding
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Revenue trend — previously the dashboard showed only a 30-day total, which cannot
          distinguish a steady month from one good day followed by silence. */}
      {isStaff && (
        <Card className="space-y-4 hover-lift-card animate-fade-in-up-delay-2">
          <div className="border-b border-slate-100 pb-2 dark:border-slate-800">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Revenue</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Completed payments per day, last 30 days
            </p>
          </div>

          {!revenue || revenue.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-400">
              No completed payments in the last 30 days.
            </div>
          ) : (
            <>
              <TrendChart
                points={revenue.map((day) => ({ date: day.date, value: day.totalMinor }))}
                format={formatMoney}
                caption="Revenue per day, last 30 days"
              />
              <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <span>
                  {totalPaymentCount} payment{totalPaymentCount === 1 ? "" : "s"} over{" "}
                  {revenue.length} day{revenue.length === 1 ? "" : "s"}
                </span>
                <span className="font-mono font-semibold text-slate-900 dark:text-white">
                  {revenue30dMinor !== null ? formatMoney(revenue30dMinor) : "—"} total
                </span>
              </div>
              <ChartTable
                columns={["Date", "Revenue", "Payments"]}
                rows={revenue.map((day) => [day.date, formatMoney(day.totalMinor), day.paymentCount])}
              />
            </>
          )}
        </Card>
      )}

      {/* Network Bandwidth Telemetry & Heavy Consumers Center */}
      {isStaff && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in-up-delay-3">
          {/* Daily Traffic Breakdown Chart */}
          <Card className="lg:col-span-2 space-y-4 hover-lift-card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="flex h-3 w-3 rounded-full bg-cyan-500 shadow-sm shadow-cyan-500/50" />
                  Network Traffic &amp; Bandwidth Volume
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Aggregated upload and download throughput recorded via RADIUS accounting
                </p>
              </div>

              {/* Day filter selector */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
                {[7, 14, 30].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setBandwidthRange(days)}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                      bandwidthRange === days
                        ? "bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-xs"
                        : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    {days}D
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2">
              {!bandwidth || bandwidth.length === 0 ? (
                <div className="py-16 text-center text-xs text-slate-400">
                  No bandwidth telemetry recorded yet. Live subscriber sessions will populate here.
                </div>
              ) : (
                <>
                  <StackedColumns
                    columns={bandwidth.map((day) => ({
                      date: day.date,
                      primary: day.downloadBytes,
                      secondary: day.uploadBytes,
                    }))}
                    primaryLabel="Download"
                    secondaryLabel="Upload"
                    format={formatBytes}
                  />
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <span>
                      {formatBytes(totalDownloadBytes)} down · {formatBytes(totalUploadBytes)} up
                    </span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-white">
                      Peak day {formatBytes(maxDailyBytes)}
                    </span>
                  </div>
                  <ChartTable
                    columns={["Date", "Download", "Upload"]}
                    rows={bandwidth.map((day) => [
                      day.date,
                      formatBytes(day.downloadBytes),
                      formatBytes(day.uploadBytes),
                    ])}
                  />
                </>
              )}
            </div>
          </Card>

          {/* Top Bandwidth Heavy Consumers Leaderboard */}
          <Card className="space-y-4">
            <div className="pb-2 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>🔥</span>
                Top Bandwidth Consumers
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Highest throughput accounts (last 30 days)
              </p>
            </div>

            {!topConsumers || topConsumers.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No heavy consumer records yet.
              </div>
            ) : (
              <BarList
                items={topConsumers.map((consumer) => ({
                  label: consumer.username,
                  value: consumer.totalBytes,
                  detail: `${consumer.sessionCount} sessions · ${formatBytes(consumer.downloadBytes)} down`,
                }))}
                format={formatBytes}
              />
            )}

            <Link
              href="/sessions"
              className="block text-center py-2 rounded-xl text-xs font-bold text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
            >
              View All Live Active Sessions &rarr;
            </Link>
          </Card>
        </div>
      )}

      {/* Quick Launch Shortcuts & Infrastructure Health */}
      {isStaff && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Quick Action Cards */}
          <Card className="lg:col-span-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4">
              Quick Management Shortcuts
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link
                href="/customers"
                className="group flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-purple-500/50 hover:shadow-md dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-900 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/80 dark:text-purple-400 shadow-xs">
                    <IconUsers size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">Subscribers</p>
                    <p className="text-xs text-slate-500">Provision &amp; view customer profiles</p>
                  </div>
                </div>
                <IconArrowRight size={16} className="text-slate-400 group-hover:text-purple-600 group-hover:translate-x-0.5 transition-all" />
              </Link>

              <Link
                href="/routers"
                className="group flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-emerald-500/50 hover:shadow-md dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-900 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/80 dark:text-emerald-400 shadow-xs">
                    <IconRouter size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">MikroTik Routers</p>
                    <p className="text-xs text-slate-500">RouterOS API, Hotspot &amp; PPPoE</p>
                  </div>
                </div>
                <IconArrowRight size={16} className="text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all" />
              </Link>

              <Link
                href="/vouchers"
                className="group flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-amber-500/50 hover:shadow-md dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-900 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/80 dark:text-amber-400 shadow-xs">
                    <IconTicket size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">Hotspot Vouchers</p>
                    <p className="text-xs text-slate-500">Generate batches, themes &amp; plans</p>
                  </div>
                </div>
                <IconArrowRight size={16} className="text-slate-400 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all" />
              </Link>

              <Link
                href="/payments-setup"
                className="group flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-cyan-500/50 hover:shadow-md dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-900 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600 dark:bg-cyan-950/80 dark:text-cyan-400 shadow-xs">
                    <IconMpesa size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">M-Pesa &amp; Paystack</p>
                    <p className="text-xs text-slate-500">STK push, Paybill &amp; card checkouts</p>
                  </div>
                </div>
                <IconArrowRight size={16} className="text-slate-400 group-hover:text-cyan-600 group-hover:translate-x-0.5 transition-all" />
              </Link>
            </div>
          </Card>

          {/* Infrastructure Health Status */}
          <Card>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
              Hardware Health
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <StatusDot status="ONLINE" pulse={true} />
                  <span className="text-sm font-semibold">Online Routers</span>
                </div>
                <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {onlineRouters}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <StatusDot status="WARNING" pulse={false} />
                  <span className="text-sm font-semibold">Warning State</span>
                </div>
                <span className="text-sm font-bold font-mono text-amber-600 dark:text-amber-400">
                  {warningRouters}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <StatusDot status="DOWN" pulse={false} />
                  <span className="text-sm font-semibold">Unreachable</span>
                </div>
                <span className="text-sm font-bold font-mono text-rose-600 dark:text-rose-400">
                  {downRouters}
                </span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {!isPlatform && !isStaff && <CustomerPortal />}

      {isStaff && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Unavailable feature="Customer Ticketing & Support Desk" />
          <Unavailable feature="Fiber Field Installation Workorders" />
        </div>
      )}
    </div>
  );
}
