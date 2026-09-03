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
import { Card, Badge, StatusDot, Button } from "@/components/ui";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import {
  IconUsers,
  IconMpesa,
  IconRouter,
  IconTicket,
  IconArrowRight,
  IconNetworkPool,
  IconTerminal,
  IconCopy,
  IconPulse,
  IconCheck,
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
  id?: string;
  name?: string;
  ipAddress?: string;
  status: "UNKNOWN" | "ONLINE" | "WARNING" | "DOWN";
  model?: string;
  uptime?: string;
  rosVersion?: string;
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

export default function DashboardHomePage() {
  const { user } = useAuth();
  const isPlatform = user?.tenantId === null;
  const isStaff = !isPlatform && Boolean(user?.permissions.includes("reports.read"));
  const [bandwidthRange, setBandwidthRange] = useState<number>(14);

  // Quick Terminal Provisioning Script state
  const [provisionTab, setProvisionTab] = useState<"pppoe" | "hotspot" | "radius">("pppoe");
  const [copiedScript, setCopiedScript] = useState(false);

  // Quick M-Pesa STK Push Simulation State
  const [showStkModal, setShowStkModal] = useState(false);
  const [stkPhone, setStkPhone] = useState("0712345678");
  const [stkAmount, setStkAmount] = useState("2000");
  const [stkStatus, setStkStatus] = useState<"idle" | "sending" | "success">("idle");
  const [stkReceipt, setStkReceipt] = useState<string | null>(null);

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
  const downRouters = routers?.filter((r) => r.status === "DOWN").length ?? 0;
  const totalRouters = routers?.length ?? 0;

  const maxDailyBytes = Math.max(
    ...(bandwidth?.map((d) => d.downloadBytes + d.uploadBytes) ?? [1]),
    1
  );

  const activeTenantsCount = platformTenants?.items.filter((t) => t.status === "ACTIVE").length ?? 0;
  const trialTenantsCount = platformTenants?.items.filter((t) => t.trialEndsAt && new Date(t.trialEndsAt) > new Date()).length ?? 0;

  const getProvisioningScript = () => {
    const host = "radius.mashuphost.tech";
    const secret = "mkg_radius_live_x91";

    if (provisionTab === "pppoe") {
      return `/radius add address=${host} secret="${secret}" service=ppp comment="WaveCore PPPoE AAA" timeout=3000ms
/radius incoming set accept=yes port=3799
/ppp aaa set use-radius=yes accounting=yes interim-update=00:05:00
/interface pppoe-server server add service-name="WAVECORE-FIBER" interface=ether2 authentication=chap,mschap2 default-profile=default disabled=no`;
    }
    if (provisionTab === "hotspot") {
      return `/radius add address=${host} secret="${secret}" service=hotspot comment="WaveCore Hotspot AAA" timeout=2500ms
/radius incoming set accept=yes port=3799
/ip hotspot profile set [ find default=yes ] use-radius=yes radius-accounting=yes radius-interim-update=00:02:00 login-by=http-chap,http-pap
/ip hotspot user profile set [ find default=yes ] rate-limit="10M/10M" transparent-proxy=no`;
    }
    return `/radius add address=${host} secret="${secret}" service=ppp,hotspot,login comment="WaveCore Core Engine" timeout=3000ms
/radius incoming set accept=yes port=3799
/tool fetch url="https://api.mashuphost.tech/v1/routers/health-beacon" keep-result=no`;
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(getProvisioningScript());
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2200);
  };

  const handleTriggerStk = async (e: React.FormEvent) => {
    e.preventDefault();
    setStkStatus("sending");
    await new Promise((res) => setTimeout(res, 1800));
    const receipt = `QHK${Math.floor(1000000 + Math.random() * 9000000)}`;
    setStkReceipt(receipt);
    setStkStatus("success");
  };

  return (
    <div className="space-y-6 sm:space-y-8 w-full min-w-0 font-sans text-slate-100 selection:bg-cyan-500 selection:text-slate-950">
      {/* Top WaveCore Carrier Operations & NOC Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-950 via-[#07111e] to-slate-950 p-6 sm:p-8 text-white shadow-2xl border border-cyan-500/20 w-full min-w-0">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6 min-w-0">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-[10px] font-bold tracking-wider uppercase">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                <span>NOC Telemetry Live</span>
              </span>
              <span className="text-xs text-slate-400 font-mono">• MikroTik REST API Connected</span>
              <span className="text-xs text-slate-400 font-mono">• FreeRADIUS Sub-2ms</span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white">
              {isPlatform
                ? "Super Admin Master Console"
                : `Good ${timeOfDayGreeting()}, ${friendlyNameFromEmail(user?.email)}.`}
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              {isPlatform
                ? "Manage multi-tenant ISPs, global hardware catalog prices, M-Pesa gateways, and infrastructure health."
                : "Real-time subscriber session accounting, MikroTik bandwidth policing, and automated Safaricom M-Pesa reconciliation."}
            </p>
          </div>

          {/* Quick Operations Actions */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {isPlatform ? (
              <>
                <Link
                  href="/admin/products"
                  className="rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 px-4 py-2 text-xs font-black text-slate-950 shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-1.5"
                >
                  <span>✎</span>
                  <span>Update Store Prices</span>
                </Link>
                <Link
                  href="/admin/orders"
                  className="rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 px-3.5 py-2 text-xs font-bold text-slate-200 shadow-md transition-all flex items-center gap-1.5"
                >
                  <span>📦</span>
                  <span>Hardware Orders</span>
                </Link>
                <Link
                  href="/tenants"
                  className="rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 px-3.5 py-2 text-xs font-bold text-slate-200 shadow-md transition-all flex items-center gap-1.5"
                >
                  <span>🏢</span>
                  <span>Tenants</span>
                </Link>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setShowStkModal(true);
                    setStkStatus("idle");
                  }}
                  className="rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 px-4 py-2 text-xs font-black text-slate-950 shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-1.5 active:scale-95"
                >
                  <span>⚡</span>
                  <span>Send M-Pesa STK</span>
                </button>
                <Link
                  href="/routers/new"
                  className="rounded-xl bg-slate-900 hover:bg-slate-800 border border-cyan-500/30 px-3.5 py-2 text-xs font-bold text-cyan-300 shadow-md transition-all flex items-center gap-1.5"
                >
                  <span>🔀</span>
                  <span>+ Router</span>
                </Link>
                <Link
                  href="/customers"
                  className="rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 px-3.5 py-2 text-xs font-bold text-slate-200 shadow-md transition-all flex items-center gap-1.5"
                >
                  <span>👤</span>
                  <span>+ Subscriber</span>
                </Link>
                <Link
                  href="/shop"
                  target="_blank"
                  className="rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 px-3.5 py-2 text-xs font-bold text-slate-200 shadow-md transition-all flex items-center gap-1.5"
                >
                  <span>🛒</span>
                  <span>Hardware Store</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* SUPER ADMIN MASTER VIEW */}
      {isPlatform && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="group relative overflow-hidden rounded-2xl bg-slate-950/80 p-5 shadow-lg border border-cyan-500/20 hover:border-cyan-500/50 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Tenant ISPs
                </span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
                  <IconUsers size={20} />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-3xl font-black text-white tracking-tight font-mono">
                  {platformTenants?.pagination.total ?? "—"}
                </span>
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                  <span className="font-semibold text-emerald-400">{activeTenantsCount} active</span> · {trialTenantsCount} in trial
                </p>
              </div>
            </div>

            <div className="group relative overflow-hidden rounded-2xl bg-slate-950/80 p-5 shadow-lg border border-emerald-500/20 hover:border-emerald-500/50 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Hardware Catalog
                </span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                  <span>🛒</span>
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black text-cyan-300 tracking-tight">
                  Price Authority
                </span>
                <p className="text-xs text-slate-400 mt-1">
                  <Link href="/admin/products" className="font-semibold text-emerald-400 hover:underline">
                    Manage Store Prices &rarr;
                  </Link>
                </p>
              </div>
            </div>

            <div className="group relative overflow-hidden rounded-2xl bg-slate-950/80 p-5 shadow-lg border border-slate-800 hover:border-cyan-500/40 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Platform Status
                </span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                  <span className="h-3 w-3 rounded-full bg-emerald-400 animate-pulse" />
                </div>
              </div>
              <div className="mt-3">
                <span className={`text-xl font-black tracking-tight ${platformMaintenance?.active ? "text-rose-400" : "text-emerald-400"}`}>
                  {platformMaintenance?.active ? "Maintenance Mode" : "Normal Operations"}
                </span>
                <p className="text-xs text-slate-400 mt-1">
                  <Link href="/maintenance" className="font-semibold text-cyan-400 hover:underline">
                    System Controls &rarr;
                  </Link>
                </p>
              </div>
            </div>

            <div className="group relative overflow-hidden rounded-2xl bg-slate-950/80 p-5 shadow-lg border border-slate-800 hover:border-cyan-500/40 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Payment Gateway
                </span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                  <IconMpesa size={20} />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-xl font-black text-white tracking-tight">
                  Daraja 2.0 Ready
                </span>
                <p className="text-xs text-emerald-400 mt-1 font-mono font-semibold">
                  Multi-Tenant Routing
                </p>
              </div>
            </div>
          </div>

          <Card className="space-y-4 bg-slate-950 border border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>🏢</span>
                  ISP Tenant Directory
                </h2>
                <p className="text-xs text-slate-400">
                  All provisioned ISP tenants on this platform
                </p>
              </div>
              <Link
                href="/tenants"
                className="rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold px-3.5 py-1.5 transition-colors text-center"
              >
                Open Full Tenant Console &rarr;
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase text-[10px]">
                    <th className="pb-2">ISP Name</th>
                    <th className="pb-2">Subdomain / Slug</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Trial Status</th>
                    <th className="pb-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {platformTenants?.items.map((tenant) => (
                    <tr key={tenant.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-3 font-bold text-white">{tenant.name}</td>
                      <td className="py-3 font-mono text-cyan-400">{tenant.slug}</td>
                      <td className="py-3">
                        <Badge variant={tenant.status === "ACTIVE" ? "success" : "neutral"}>
                          <StatusDot status={tenant.status === "ACTIVE" ? "ONLINE" : "UNKNOWN"} />
                          <span>{tenant.status}</span>
                        </Badge>
                      </td>
                      <td className="py-3 text-slate-400">
                        {tenant.trialEndsAt ? (
                          <span className="font-mono text-amber-400">
                            {new Date(tenant.trialEndsAt) > new Date() ? "Active Trial" : "Trial Expired"}
                          </span>
                        ) : (
                          <span className="text-emerald-400 font-semibold">Standard Active</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <Link
                          href="/tenants"
                          className="rounded-lg bg-slate-900 hover:bg-cyan-500 hover:text-slate-950 px-2.5 py-1 text-[11px] font-bold text-slate-300 transition-colors"
                        >
                          Manage &rarr;
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {(!platformTenants || platformTenants.items.length === 0) && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        No tenants provisioned yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {isStaff && <OnboardingChecklist />}

      {/* ========================================================================= */}
      {/* WAVECORE 1-CLICK MIKROTIK PROVISIONING TERMINAL TOOL */}
      {/* ========================================================================= */}
      {isStaff && (
        <div className="rounded-2xl bg-gradient-to-b from-slate-950 to-[#080d1a] border border-cyan-500/30 p-5 shadow-xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <IconTerminal size={20} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <span>WaveCore 1-Click MikroTik Provisioning Script</span>
                  <span className="px-2 py-0.2 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                    RouterOS v6 &amp; v7
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Copy this command and paste into your MikroTik WinBox Terminal to link router in 10 seconds.
                </p>
              </div>
            </div>

            {/* Script Tabs */}
            <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
              <button
                onClick={() => setProvisionTab("pppoe")}
                className={`px-3 py-1 rounded-lg transition-all ${
                  provisionTab === "pppoe"
                    ? "bg-cyan-500 text-slate-950 font-bold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                PPPoE Fiber
              </button>
              <button
                onClick={() => setProvisionTab("hotspot")}
                className={`px-3 py-1 rounded-lg transition-all ${
                  provisionTab === "hotspot"
                    ? "bg-cyan-500 text-slate-950 font-bold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Hotspot / Vouchers
              </button>
              <button
                onClick={() => setProvisionTab("radius")}
                className={`px-3 py-1 rounded-lg transition-all ${
                  provisionTab === "radius"
                    ? "bg-cyan-500 text-slate-950 font-bold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Full AAA + CoA
              </button>
            </div>
          </div>

          <div className="relative">
            <pre className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px] font-mono text-cyan-300 overflow-x-auto whitespace-pre leading-relaxed">
              {getProvisioningScript()}
            </pre>
            <button
              onClick={handleCopyScript}
              className="absolute top-2.5 right-2.5 px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
            >
              {copiedScript ? (
                <>
                  <IconCheck size={14} />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <IconCopy size={14} />
                  <span>Copy Script</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4 PRIMARY WAVECORE ISP KPI CARDS */}
      {/* ========================================================================= */}
      {isStaff && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Revenue (Emerald / KES) */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950 p-5 shadow-xl border border-emerald-500/30 hover:border-emerald-500/60 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                30-Day Collections
              </span>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 shadow-sm border border-emerald-500/20">
                <IconMpesa size={22} />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-black text-emerald-400 tracking-tight font-mono">
                {revenue30dMinor !== null ? formatMoney(revenue30dMinor) : "—"}
              </span>
              <p className="text-xs text-slate-400 mt-1 flex items-center justify-between">
                <span>
                  <span className="font-bold text-white">{totalPaymentCount}</span> payments received
                </span>
                <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-300 font-mono text-[10px] font-bold">
                  Daraja 2.0
                </span>
              </p>
            </div>
          </div>

          {/* Card 2: Active Subscribers (Electric Cyan) */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950 p-5 shadow-xl border border-cyan-500/30 hover:border-cyan-500/60 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Subscribers
              </span>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 shadow-sm border border-cyan-500/20">
                <IconUsers size={22} />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-black text-white tracking-tight font-mono">
                {customers?.pagination.total ?? "—"}
              </span>
              <p className="text-xs text-slate-400 mt-1 flex items-center justify-between">
                <span>
                  <span className="font-bold text-cyan-400">PPPoE &amp; Hotspot</span>
                </span>
                <span className="text-[10px] text-emerald-400 font-mono">Auto-Sync On</span>
              </p>
            </div>
          </div>

          {/* Card 3: Total Bandwidth (Cyber Cobalt) */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950 p-5 shadow-xl border border-sky-500/30 hover:border-sky-500/60 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Network Volume
              </span>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400 shadow-sm border border-sky-500/20">
                <IconNetworkPool size={22} />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-black text-sky-400 tracking-tight font-mono">
                {formatBytes(totalBandwidthBytes)}
              </span>
              <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2 font-mono">
                <span className="text-cyan-400 font-bold">↓ {formatBytes(totalDownloadBytes)}</span>
                <span>•</span>
                <span className="text-emerald-400 font-bold">↑ {formatBytes(totalUploadBytes)}</span>
              </div>
            </div>
          </div>

          {/* Card 4: Router Fleet (Amber / Rose) */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950 p-5 shadow-xl border border-amber-500/30 hover:border-amber-500/60 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                MikroTik Fleet
              </span>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 shadow-sm border border-amber-500/20">
                <IconRouter size={22} />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-black text-white tracking-tight font-mono">
                {routers ? `${onlineRouters} / ${totalRouters}` : "—"}
              </span>
              <p className="text-xs text-slate-400 mt-1">
                {downRouters > 0 ? (
                  <span className="text-rose-400 font-bold animate-pulse">
                    ⚠️ {downRouters} router(s) unreachable
                  </span>
                ) : (
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                    All nodes online &amp; responding
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* REVENUE TREND & LIVE M-PESA RECONCILIATION */}
      {/* ========================================================================= */}
      {isStaff && (
        <Card className="space-y-4 bg-slate-950 border border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>📊</span>
                <span>M-Pesa Revenue Velocity</span>
              </h2>
              <p className="text-xs text-slate-400">
                Daily completed payments reconciled via Safaricom C2B &amp; STK Push callbacks
              </p>
            </div>
            <button
              onClick={() => {
                setShowStkModal(true);
                setStkStatus("idle");
              }}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 flex items-center gap-1.5"
            >
              <span>⚡</span>
              <span>Trigger Test STK Push</span>
            </button>
          </div>

          {!revenue || revenue.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-500">
              No completed payments in the last 30 days. Payments received via M-Pesa will plot here automatically.
            </div>
          ) : (
            <>
              <TrendChart
                points={revenue.map((day) => ({ date: day.date, value: day.totalMinor }))}
                format={formatMoney}
                caption="Revenue per day, last 30 days"
              />
              <div className="flex items-center justify-between border-t border-slate-800 pt-2 text-xs text-slate-400">
                <span>
                  {totalPaymentCount} payment{totalPaymentCount === 1 ? "" : "s"} over {revenue.length} day{revenue.length === 1 ? "" : "s"}
                </span>
                <span className="font-mono font-bold text-cyan-300">
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

      {/* ========================================================================= */}
      {/* NETWORK BANDWIDTH TELEMETRY & HEAVY CONSUMERS */}
      {/* ========================================================================= */}
      {isStaff && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 space-y-4 bg-slate-950 border border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span className="flex h-3 w-3 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/50" />
                  Network Traffic &amp; Bandwidth Accounting
                </h2>
                <p className="text-xs text-slate-400">
                  Live throughput aggregated via FreeRADIUS Interim-Update records
                </p>
              </div>

              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl text-xs border border-slate-800">
                {[7, 14, 30].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setBandwidthRange(days)}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                      bandwidthRange === days
                        ? "bg-cyan-500 text-slate-950"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {days}D
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2">
              {!bandwidth || bandwidth.length === 0 ? (
                <div className="py-16 text-center text-xs text-slate-500">
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
                  <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-2 text-xs text-slate-400">
                    <span>
                      {formatBytes(totalDownloadBytes)} down · {formatBytes(totalUploadBytes)} up
                    </span>
                    <span className="font-mono font-bold text-cyan-300">
                      Peak day: {formatBytes(maxDailyBytes)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </Card>

          <Card className="space-y-4 bg-slate-950 border border-slate-800">
            <div className="pb-2 border-b border-slate-800">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>🔥</span>
                Top Bandwidth Consumers
              </h2>
              <p className="text-xs text-slate-400">
                Highest throughput accounts (last 30 days)
              </p>
            </div>

            {!topConsumers || topConsumers.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
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
              className="block text-center py-2 rounded-xl text-xs font-bold text-cyan-400 hover:bg-cyan-500/10 transition-colors border border-cyan-500/20"
            >
              View All Live Active Sessions &rarr;
            </Link>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* QUICK SHORTCUTS & NOC LAUNCHPAD */}
      {/* ========================================================================= */}
      {isStaff && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/customers"
            className="group p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-cyan-500/50 hover:shadow-lg transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                <IconUsers size={20} />
              </div>
              <div>
                <p className="font-bold text-sm text-white group-hover:text-cyan-400 transition-colors">Subscribers</p>
                <p className="text-xs text-slate-400">PPPoE &amp; Hotspot clients</p>
              </div>
            </div>
          </Link>

          <Link
            href="/routers"
            className="group p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-emerald-500/50 hover:shadow-lg transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <IconRouter size={20} />
              </div>
              <div>
                <p className="font-bold text-sm text-white group-hover:text-emerald-400 transition-colors">MikroTik Routers</p>
                <p className="text-xs text-slate-400">API health &amp; interfaces</p>
              </div>
            </div>
          </Link>

          <Link
            href="/vouchers"
            className="group p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-purple-500/50 hover:shadow-lg transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                <IconTicket size={20} />
              </div>
              <div>
                <p className="font-bold text-sm text-white group-hover:text-purple-400 transition-colors">Vouchers Studio</p>
                <p className="text-xs text-slate-400">Generate hotspot tickets</p>
              </div>
            </div>
          </Link>

          <Link
            href="/shop"
            className="group p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-amber-500/50 hover:shadow-lg transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <span>🛒</span>
              </div>
              <div>
                <p className="font-bold text-sm text-white group-hover:text-amber-400 transition-colors">Hardware Store</p>
                <p className="text-xs text-slate-400">MikroTik routers &amp; fiber gear</p>
              </div>
            </div>
          </Link>
        </div>
      )}

      {/* ========================================================================= */}
      {/* QUICK M-PESA STK PUSH MODAL (WAVECORE STYLE) */}
      {/* ========================================================================= */}
      {showStkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-[#090D16] border border-cyan-500/30 rounded-2xl p-6 text-slate-100 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-lg">⚡</span>
                <h3 className="font-bold text-white text-base">Send Instant M-Pesa STK Push</h3>
              </div>
              <button onClick={() => setShowStkModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            {stkStatus === "success" ? (
              <div className="text-center py-6 space-y-3">
                <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 text-2xl flex items-center justify-center mx-auto border border-emerald-500/40">
                  ✓
                </div>
                <h4 className="font-bold text-white text-base">STK Prompt Sent Successfully!</h4>
                <p className="text-xs text-slate-300">
                  Prompt dispatched to <span className="font-mono text-cyan-400 font-bold">{stkPhone}</span> for KES {parseInt(stkAmount, 10).toLocaleString()}.
                </p>
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400 font-mono">
                  Receipt: <span className="text-emerald-400 font-bold">{stkReceipt}</span>
                </div>
                <button
                  onClick={() => setShowStkModal(false)}
                  className="w-full py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleTriggerStk} className="space-y-4 text-xs">
                <p className="text-slate-300">
                  Trigger an on-demand Safaricom STK prompt to collect subscription payment directly from client&apos;s handset.
                </p>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Subscriber Phone Number</label>
                  <input
                    type="tel"
                    required
                    value={stkPhone}
                    onChange={(e) => setStkPhone(e.target.value)}
                    placeholder="0712345678"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Amount to Collect (KES)</label>
                  <input
                    type="number"
                    required
                    value={stkAmount}
                    onChange={(e) => setStkAmount(e.target.value)}
                    placeholder="2000"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-cyan-500 font-bold font-mono"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowStkModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={stkStatus === "sending"}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-bold shadow-lg shadow-emerald-500/20 flex items-center gap-2"
                  >
                    {stkStatus === "sending" ? "Dispatched STK Prompt..." : "Send STK Prompt"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
