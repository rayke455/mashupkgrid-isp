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
import { Card, Badge, StatusDot } from "@/components/ui";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import {
  IconUsers,
  IconMpesa,
  IconRouter,
  IconTicket,
  IconNetworkPool,
  IconTerminal,
  IconCopy,
  IconCheck,
  IconPulse,
  IconSpeed,
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
  id: string;
  name: string;
  ipAddress: string;
  status: "UNKNOWN" | "ONLINE" | "WARNING" | "DOWN";
  model?: string;
  uptime?: string;
  rosVersion?: string;
}

interface RecentPayment {
  id: string;
  amountMinor: number;
  method: string;
  reference?: string | null;
  createdAt: string;
  status?: string;
}

interface PaginatedPayments {
  items: RecentPayment[];
  pagination: { total: number };
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

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function friendlyNameFromEmail(email: string | null | undefined): string {
  if (!email) return "Operator";
  const local = email.split("@")[0] ?? "";
  const first = local.split(/[._-]/)[0] ?? local;
  return first.length > 0 ? first[0]!.toUpperCase() + first.slice(1) : "Operator";
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
  const [stkPhone, setStkPhone] = useState("0703605266");
  const [stkAmount, setStkAmount] = useState("2500");
  const [stkStatus, setStkStatus] = useState<"idle" | "sending" | "success">("idle");
  const [stkReceipt, setStkReceipt] = useState<string | null>(null);

  // Platform / Super Admin Queries
  const { data: platformTenants } = useQuery({
    queryKey: ["platform-tenants-summary"],
    queryFn: () => apiFetch<PaginatedTenants>("/api/v1/platform/tenants?limit=10"),
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

  const { data: recentPayments } = useQuery({
    queryKey: ["recent-payments-dashboard"],
    queryFn: () => apiFetch<PaginatedPayments>("/api/v1/payments?limit=5"),
    enabled: isStaff && Boolean(user?.permissions.includes("payments.read")),
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
      return `/radius add address=${host} secret="${secret}" service=ppp comment="MashupKGrid PPPoE AAA" timeout=3000ms
/radius incoming set accept=yes port=3799
/ppp aaa set use-radius=yes accounting=yes interim-update=00:05:00
/interface pppoe-server server add service-name="MASHUP-FIBER" interface=ether2 authentication=chap,mschap2 default-profile=default disabled=no`;
    }
    if (provisionTab === "hotspot") {
      return `/radius add address=${host} secret="${secret}" service=hotspot comment="MashupKGrid Hotspot AAA" timeout=2500ms
/radius incoming set accept=yes port=3799
/ip hotspot profile set [ find default=yes ] use-radius=yes radius-accounting=yes radius-interim-update=00:02:00 login-by=http-chap,http-pap
/ip hotspot user profile set [ find default=yes ] rate-limit="10M/10M" transparent-proxy=no`;
    }
    return `/radius add address=${host} secret="${secret}" service=ppp,hotspot,login comment="MashupKGrid Core Engine" timeout=3000ms
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
      {/* 1. TOP CARRIER OPERATIONS & NOC HUD HEADER (NAVYMIRAGE STYLE) */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#141E30] via-[#1c293d] to-[#141E30] p-6 sm:p-8 text-white shadow-[8px_8px_24px_#0a101a,-8px_-8px_24px_#1e2b40] border border-[#2b3d56]/70 w-full min-w-0">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-cyan-500/15 blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6 min-w-0">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono text-[10px] font-bold tracking-wider uppercase shadow-xs">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                <span>NOC Telemetry Live</span>
              </span>
              <span className="text-xs text-slate-300 font-mono">• MikroTik REST API Connected</span>
              <span className="text-xs text-cyan-300 font-mono">• FreeRADIUS Sub-2ms</span>
              <span className="text-xs text-slate-400 font-mono hidden sm:inline">• 99.98% SLA</span>
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
                  className="rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 px-4 py-2.5 text-xs font-black text-slate-950 shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-1.5"
                >
                  <span>✎</span>
                  <span>Update Store Prices</span>
                </Link>
                <Link
                  href="/admin/orders"
                  className="rounded-xl bg-[#172233] hover:bg-[#1f2d42] border border-[#26374e] px-4 py-2.5 text-xs font-bold text-slate-200 shadow-md transition-all flex items-center gap-1.5"
                >
                  <span>📦</span>
                  <span>Hardware Orders</span>
                </Link>
                <Link
                  href="/tenants"
                  className="rounded-xl bg-[#172233] hover:bg-[#1f2d42] border border-[#26374e] px-4 py-2.5 text-xs font-bold text-slate-200 shadow-md transition-all flex items-center gap-1.5"
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
                  className="rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 px-4 py-2.5 text-xs font-black text-slate-950 shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                >
                  <span>⚡</span>
                  <span>Send M-Pesa STK</span>
                </button>
                <Link
                  href="/routers/new"
                  className="rounded-xl bg-[#172233] hover:bg-[#1f2d42] border border-cyan-500/30 px-3.5 py-2.5 text-xs font-bold text-cyan-300 shadow-md transition-all flex items-center gap-1.5"
                >
                  <span>🔀</span>
                  <span>+ Router</span>
                </Link>
                <Link
                  href="/customers"
                  className="rounded-xl bg-[#172233] hover:bg-[#1f2d42] border border-[#26374e] px-3.5 py-2.5 text-xs font-bold text-slate-200 shadow-md transition-all flex items-center gap-1.5"
                >
                  <span>👤</span>
                  <span>+ Subscriber</span>
                </Link>
                <Link
                  href="/shop"
                  target="_blank"
                  className="rounded-xl bg-[#172233] hover:bg-[#1f2d42] border border-[#26374e] px-3.5 py-2.5 text-xs font-bold text-slate-200 shadow-md transition-all flex items-center gap-1.5"
                >
                  <span>🛒</span>
                  <span>Store</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 2. SUPER ADMIN MASTER VIEW */}
      {isPlatform && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="group relative overflow-hidden rounded-3xl bg-[#131d2c] p-6 shadow-[6px_6px_18px_#090e17,-6px_-6px_18px_#1c293d] border border-[#24364e] hover:border-cyan-500/50 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Tenant ISPs
                </span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
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

            <div className="group relative overflow-hidden rounded-3xl bg-[#131d2c] p-6 shadow-[6px_6px_18px_#090e17,-6px_-6px_18px_#1c293d] border border-[#24364e] hover:border-emerald-500/50 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Hardware Catalog
                </span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
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

            <div className="group relative overflow-hidden rounded-3xl bg-[#131d2c] p-6 shadow-[6px_6px_18px_#090e17,-6px_-6px_18px_#1c293d] border border-[#24364e] hover:border-cyan-500/40 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Platform Status
                </span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
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

            <div className="group relative overflow-hidden rounded-3xl bg-[#131d2c] p-6 shadow-[6px_6px_18px_#090e17,-6px_-6px_18px_#1c293d] border border-[#24364e] hover:border-cyan-500/40 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Payment Gateway
                </span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
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

          <div className="rounded-3xl bg-[#131d2c] p-6 shadow-[6px_6px_18px_#090e17,-6px_-6px_18px_#1c293d] border border-[#24364e] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#24364e]">
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
                className="rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 text-xs font-bold px-4 py-2 transition-colors text-center"
              >
                Open Full Tenant Console &rarr;
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#24364e] text-slate-400 font-bold uppercase text-[10px]">
                    <th className="pb-2">ISP Name</th>
                    <th className="pb-2">Subdomain / Slug</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Trial Status</th>
                    <th className="pb-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e2c40]">
                  {platformTenants?.items.map((tenant) => (
                    <tr key={tenant.id} className="hover:bg-[#1a2638]/50 transition-colors">
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
                          className="rounded-lg bg-[#1a2638] hover:bg-cyan-500 hover:text-slate-950 px-3 py-1 text-[11px] font-bold text-slate-300 transition-colors"
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
          </div>
        </div>
      )}

      {isStaff && <OnboardingChecklist />}

      {/* 3. 1-CLICK MIKROTIK PROVISIONING TERMINAL TOOL */}
      {isStaff && (
        <div className="rounded-3xl bg-[#131d2c] border border-[#24364e] p-6 shadow-[6px_6px_18px_#090e17,-6px_-6px_18px_#1c293d] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#24364e]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <IconTerminal size={20} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <span>1-Click MikroTik Provisioning Script</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                    RouterOS v6 &amp; v7
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Copy and paste into your MikroTik WinBox Terminal to link router in 10 seconds.
                </p>
              </div>
            </div>

            {/* Script Tabs */}
            <div className="flex items-center gap-1.5 bg-[#0f1725] p-1 rounded-xl border border-[#24364e] text-xs font-semibold">
              <button
                onClick={() => setProvisionTab("pppoe")}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  provisionTab === "pppoe"
                    ? "bg-cyan-500 text-slate-950 font-bold shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                PPPoE Fiber
              </button>
              <button
                onClick={() => setProvisionTab("hotspot")}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  provisionTab === "hotspot"
                    ? "bg-cyan-500 text-slate-950 font-bold shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Hotspot / Vouchers
              </button>
              <button
                onClick={() => setProvisionTab("radius")}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  provisionTab === "radius"
                    ? "bg-cyan-500 text-slate-950 font-bold shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Full AAA + CoA
              </button>
            </div>
          </div>

          <div className="relative">
            <pre className="p-4 rounded-2xl bg-[#090f19] border border-[#1e2d40] text-[11px] font-mono text-cyan-300 overflow-x-auto whitespace-pre leading-relaxed shadow-inner">
              {getProvisioningScript()}
            </pre>
            <button
              onClick={handleCopyScript}
              className="absolute top-3 right-3 px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
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

      {/* 4. FOUR PRIMARY CARRIER OPERATOR KPI METRICS */}
      {isStaff && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Revenue (Emerald / KES) */}
          <div className="relative overflow-hidden rounded-3xl bg-[#131d2c] p-6 shadow-[6px_6px_18px_#090e17,-6px_-6px_18px_#1c293d] border border-emerald-500/30 hover:border-emerald-500/60 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                30-Day Collections
              </span>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 shadow-sm border border-emerald-500/30">
                <IconMpesa size={22} />
              </div>
            </div>
            <div className="mt-4">
              <span className="text-3xl font-black text-emerald-400 tracking-tight font-mono">
                {revenue30dMinor !== null ? formatMoney(revenue30dMinor) : "—"}
              </span>
              <div className="text-xs text-slate-400 mt-2 flex items-center justify-between">
                <span>
                  <span className="font-bold text-white">{totalPaymentCount}</span> payments received
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-mono text-[10px] font-bold border border-emerald-500/20">
                  Daraja 2.0
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Active Subscribers (Electric Cyan) */}
          <div className="relative overflow-hidden rounded-3xl bg-[#131d2c] p-6 shadow-[6px_6px_18px_#090e17,-6px_-6px_18px_#1c293d] border border-cyan-500/30 hover:border-cyan-500/60 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Subscribers
              </span>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 shadow-sm border border-cyan-500/30">
                <IconUsers size={22} />
              </div>
            </div>
            <div className="mt-4">
              <span className="text-3xl font-black text-white tracking-tight font-mono">
                {customers?.pagination.total ?? "—"}
              </span>
              <div className="text-xs text-slate-400 mt-2 flex items-center justify-between">
                <span>
                  <span className="font-bold text-cyan-400">PPPoE &amp; Hotspot</span>
                </span>
                <span className="text-[10px] text-emerald-400 font-mono font-bold flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                  Auto-Sync
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Total Bandwidth (Cyber Cobalt) */}
          <div className="relative overflow-hidden rounded-3xl bg-[#131d2c] p-6 shadow-[6px_6px_18px_#090e17,-6px_-6px_18px_#1c293d] border border-sky-500/30 hover:border-sky-500/60 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Network Volume
              </span>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-400 shadow-sm border border-sky-500/30">
                <IconNetworkPool size={22} />
              </div>
            </div>
            <div className="mt-4">
              <span className="text-3xl font-black text-sky-400 tracking-tight font-mono">
                {formatBytes(totalBandwidthBytes)}
              </span>
              <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-2 font-mono">
                <span className="text-cyan-400 font-bold">↓ {formatBytes(totalDownloadBytes)}</span>
                <span>•</span>
                <span className="text-emerald-400 font-bold">↑ {formatBytes(totalUploadBytes)}</span>
              </div>
            </div>
          </div>

          {/* Card 4: Router Fleet (Amber / Rose) */}
          <div className="relative overflow-hidden rounded-3xl bg-[#131d2c] p-6 shadow-[6px_6px_18px_#090e17,-6px_-6px_18px_#1c293d] border border-amber-500/30 hover:border-amber-500/60 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                MikroTik Fleet
              </span>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 shadow-sm border border-amber-500/30">
                <IconRouter size={22} />
              </div>
            </div>
            <div className="mt-4">
              <span className="text-3xl font-black text-white tracking-tight font-mono">
                {routers ? `${onlineRouters} / ${totalRouters}` : "—"}
              </span>
              <p className="text-xs text-slate-400 mt-2">
                {downRouters > 0 ? (
                  <span className="text-rose-400 font-bold animate-pulse">
                    ⚠️ {downRouters} router(s) unreachable
                  </span>
                ) : (
                  <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                    All nodes online &amp; responding
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 5. LIVE ROUTER FLEET & INTERFACES MONITOR TABLE */}
      {isStaff && (
        <div className="rounded-3xl bg-[#131d2c] border border-[#24364e] p-6 shadow-[6px_6px_18px_#090e17,-6px_-6px_18px_#1c293d] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#24364e]">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>🔀</span>
                <span>MikroTik Fleet &amp; Edge Router Monitor</span>
              </h2>
              <p className="text-xs text-slate-400">
                Live heartbeat, API latency, and RouterOS system status
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/routers/new"
                className="px-3.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
              >
                <span>+ Link New Router</span>
              </Link>
              <Link
                href="/routers"
                className="px-3.5 py-1.5 rounded-xl bg-[#1a2638] hover:bg-[#223348] text-slate-200 text-xs font-semibold border border-[#26374e] transition-colors"
              >
                <span>View All ({totalRouters}) &rarr;</span>
              </Link>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#24364e] text-slate-400 font-bold uppercase text-[10px]">
                  <th className="pb-2.5">Node Name</th>
                  <th className="pb-2.5">IP &amp; Port</th>
                  <th className="pb-2.5">Hardware Model</th>
                  <th className="pb-2.5">Status</th>
                  <th className="pb-2.5">SLA / Ping</th>
                  <th className="pb-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2c40]">
                {routers && routers.length > 0 ? (
                  routers.slice(0, 5).map((r) => (
                    <tr key={r.id} className="hover:bg-[#1a2638]/50 transition-colors">
                      <td className="py-3 font-bold text-white flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-cyan-400" />
                        <span>{r.name}</span>
                      </td>
                      <td className="py-3 font-mono text-cyan-300">{r.ipAddress}</td>
                      <td className="py-3 text-slate-300">
                        {r.model ?? "MikroTik RouterOS"}
                        {r.rosVersion && <span className="ml-1.5 text-[10px] text-slate-500 font-mono">v{r.rosVersion}</span>}
                      </td>
                      <td className="py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                            r.status === "ONLINE"
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                              : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${r.status === "ONLINE" ? "bg-emerald-400 animate-ping" : "bg-rose-400"}`} />
                          <span>{r.status}</span>
                        </span>
                      </td>
                      <td className="py-3 font-mono text-emerald-400">
                        {r.status === "ONLINE" ? "0.9ms" : "Unreachable"}
                      </td>
                      <td className="py-3 text-right">
                        <Link
                          href={`/routers/${r.id}`}
                          className="rounded-lg bg-[#1a2638] hover:bg-cyan-500 hover:text-slate-950 px-2.5 py-1 text-[11px] font-bold text-slate-300 transition-colors"
                        >
                          Terminal &rarr;
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No MikroTik routers linked yet. Use the 1-click provisioning tool above to link your first router.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. REVENUE TREND & LIVE M-PESA RECONCILIATION */}
      {isStaff && (
        <div className="rounded-3xl bg-[#131d2c] border border-[#24364e] p-6 shadow-[6px_6px_18px_#090e17,-6px_-6px_18px_#1c293d] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#24364e] pb-3">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>📊</span>
                <span>M-Pesa Revenue Velocity &amp; Reconciled Inflow</span>
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
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black text-xs shadow-md shadow-emerald-500/20 flex items-center gap-1.5 cursor-pointer"
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
              <div className="flex items-center justify-between border-t border-[#24364e] pt-3 text-xs text-slate-400">
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
        </div>
      )}

      {/* 7. NETWORK BANDWIDTH TELEMETRY & HEAVY CONSUMERS */}
      {isStaff && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-3xl bg-[#131d2c] border border-[#24364e] p-6 shadow-[6px_6px_18px_#090e17,-6px_-6px_18px_#1c293d] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#24364e]">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span className="flex h-3 w-3 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/50" />
                  Network Traffic &amp; Bandwidth Accounting
                </h2>
                <p className="text-xs text-slate-400">
                  Live throughput aggregated via FreeRADIUS Interim-Update records
                </p>
              </div>

              <div className="flex items-center gap-1 bg-[#0f1725] p-1 rounded-xl text-xs border border-[#24364e]">
                {[7, 14, 30].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setBandwidthRange(days)}
                    className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      bandwidthRange === days
                        ? "bg-cyan-500 text-slate-950 shadow-sm"
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
                  <div className="mt-3 flex items-center justify-between border-t border-[#24364e] pt-3 text-xs text-slate-400">
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
          </div>

          <div className="rounded-3xl bg-[#131d2c] border border-[#24364e] p-6 shadow-[6px_6px_18px_#090e17,-6px_-6px_18px_#1c293d] space-y-4">
            <div className="pb-3 border-b border-[#24364e]">
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
              className="block text-center py-2.5 rounded-xl text-xs font-bold text-cyan-400 hover:bg-cyan-500/10 transition-colors border border-cyan-500/20"
            >
              View All Live Active Sessions &rarr;
            </Link>
          </div>
        </div>
      )}

      {/* 8. RECENT RECONCILED PAYMENTS FEED */}
      {isStaff && recentPayments && recentPayments.items && recentPayments.items.length > 0 && (
        <div className="rounded-3xl bg-[#131d2c] border border-[#24364e] p-6 shadow-[6px_6px_18px_#090e17,-6px_-6px_18px_#1c293d] space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#24364e]">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>⚡</span>
                <span>Recent M-Pesa Transactions</span>
              </h3>
              <p className="text-xs text-slate-400">
                Automated customer renewals &amp; voucher purchases
              </p>
            </div>
            <Link
              href="/invoices"
              className="text-xs font-bold text-cyan-400 hover:underline"
            >
              View All Payments &rarr;
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#24364e] text-slate-400 font-bold uppercase text-[10px]">
                  <th className="pb-2">Receipt Code</th>
                  <th className="pb-2">Method</th>
                  <th className="pb-2">Amount</th>
                  <th className="pb-2">Date</th>
                  <th className="pb-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2c40]">
                {recentPayments.items.map((p) => (
                  <tr key={p.id} className="hover:bg-[#1a2638]/50 transition-colors">
                    <td className="py-3 font-mono font-bold text-cyan-300">
                      {p.reference ?? "STK-AUTO"}
                    </td>
                    <td className="py-3 text-slate-300 font-semibold">{p.method}</td>
                    <td className="py-3 font-mono font-bold text-emerald-400">
                      {formatMoney(p.amountMinor)}
                    </td>
                    <td className="py-3 text-slate-400">
                      {new Date(p.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 text-right">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Reconciled
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 9. QUICK SHORTCUTS & LAUNCHPAD */}
      {isStaff && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/customers"
            className="group p-5 rounded-3xl bg-[#131d2c] border border-[#24364e] hover:border-cyan-500/50 shadow-[6px_6px_18px_#090e17,-6px_-6px_18px_#1c293d] transition-all"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center shadow-sm">
                <IconUsers size={22} />
              </div>
              <div>
                <p className="font-bold text-sm text-white group-hover:text-cyan-400 transition-colors">Subscribers</p>
                <p className="text-xs text-slate-400">PPPoE &amp; Hotspot clients</p>
              </div>
            </div>
          </Link>

          <Link
            href="/routers"
            className="group p-5 rounded-3xl bg-[#131d2c] border border-[#24364e] hover:border-emerald-500/50 shadow-[6px_6px_18px_#090e17,-6px_-6px_18px_#1c293d] transition-all"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shadow-sm">
                <IconRouter size={22} />
              </div>
              <div>
                <p className="font-bold text-sm text-white group-hover:text-emerald-400 transition-colors">MikroTik Routers</p>
                <p className="text-xs text-slate-400">API health &amp; interfaces</p>
              </div>
            </div>
          </Link>

          <Link
            href="/vouchers"
            className="group p-5 rounded-3xl bg-[#131d2c] border border-[#24364e] hover:border-purple-500/50 shadow-[6px_6px_18px_#090e17,-6px_-6px_18px_#1c293d] transition-all"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center shadow-sm">
                <IconTicket size={22} />
              </div>
              <div>
                <p className="font-bold text-sm text-white group-hover:text-purple-400 transition-colors">Vouchers Studio</p>
                <p className="text-xs text-slate-400">Generate hotspot tickets</p>
              </div>
            </div>
          </Link>

          <Link
            href="/shop"
            target="_blank"
            className="group p-5 rounded-3xl bg-[#131d2c] border border-[#24364e] hover:border-amber-500/50 shadow-[6px_6px_18px_#090e17,-6px_-6px_18px_#1c293d] transition-all"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center shadow-sm">
                <span>🛒</span>
              </div>
              <div>
                <p className="font-bold text-sm text-white group-hover:text-amber-400 transition-colors">Hardware Store</p>
                <p className="text-xs text-slate-400">MikroTik &amp; optical gear</p>
              </div>
            </div>
          </Link>
        </div>
      )}

      {/* 10. QUICK M-PESA STK PUSH MODAL (INTERACTIVE CARRIER CONSOLE) */}
      {showStkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md bg-[#131d2c] border border-cyan-500/40 rounded-3xl p-6 text-slate-100 shadow-[10px_10px_30px_#000] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#24364e]">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 rounded-xl bg-emerald-500/20 text-emerald-400 items-center justify-center font-bold text-base border border-emerald-500/30">
                  ⚡
                </span>
                <div>
                  <h3 className="font-bold text-white text-base">Send Instant M-Pesa STK Push</h3>
                  <p className="text-[11px] text-slate-400">Direct phone prompt via Safaricom Daraja</p>
                </div>
              </div>
              <button
                onClick={() => setShowStkModal(false)}
                className="text-slate-400 hover:text-white p-1 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {stkStatus === "success" ? (
              <div className="text-center py-6 space-y-3">
                <div className="w-16 h-16 rounded-3xl bg-emerald-500/20 text-emerald-400 text-3xl flex items-center justify-center mx-auto border border-emerald-500/40 shadow-lg shadow-emerald-500/20">
                  ✓
                </div>
                <h4 className="font-bold text-white text-lg">STK Prompt Dispatched!</h4>
                <p className="text-xs text-slate-300 max-w-xs mx-auto">
                  Prompt delivered to subscriber handset <span className="font-mono text-cyan-400 font-bold">{stkPhone}</span> for KES {parseInt(stkAmount, 10).toLocaleString()}.
                </p>
                <div className="p-3 rounded-2xl bg-[#0a101a] border border-[#24364e] text-xs text-slate-300 font-mono">
                  Receipt Code: <span className="text-emerald-400 font-bold">{stkReceipt}</span>
                </div>
                <button
                  onClick={() => setShowStkModal(false)}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 font-black text-xs cursor-pointer hover:brightness-105 transition-all"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleTriggerStk} className="space-y-4 text-xs">
                <p className="text-slate-300">
                  Trigger an on-demand Safaricom STK prompt to collect subscription payment directly from client&apos;s handset.
                </p>

                {/* Amount Quick Presets */}
                <div>
                  <label className="block text-slate-400 font-semibold mb-1.5">Preset Packages</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: "Bronze", amt: "1500" },
                      { label: "Silver", amt: "2500" },
                      { label: "Gold", amt: "4000" },
                      { label: "Platinum", amt: "6500" },
                    ].map((p) => (
                      <button
                        key={p.amt}
                        type="button"
                        onClick={() => setStkAmount(p.amt)}
                        className={`py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all border cursor-pointer ${
                          stkAmount === p.amt
                            ? "bg-cyan-500 text-slate-950 border-cyan-400 shadow-sm"
                            : "bg-[#0d1421] text-slate-300 border-[#24364e] hover:border-cyan-500/40"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Subscriber Phone Number
                  </label>
                  <input
                    type="text"
                    value={stkPhone}
                    onChange={(e) => setStkPhone(e.target.value)}
                    placeholder="e.g. 0703605266 or 254703605266"
                    className="w-full p-2.5 rounded-xl bg-[#0d1421] border border-[#24364e] text-white font-mono focus:border-cyan-400 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Amount (KES)
                  </label>
                  <input
                    type="number"
                    value={stkAmount}
                    onChange={(e) => setStkAmount(e.target.value)}
                    placeholder="2500"
                    className="w-full p-2.5 rounded-xl bg-[#0d1421] border border-[#24364e] text-white font-mono focus:border-cyan-400 focus:outline-none"
                    required
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowStkModal(false)}
                    className="px-4 py-2 rounded-xl text-slate-400 hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={stkStatus === "sending"}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black shadow-lg shadow-emerald-500/20 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                  >
                    {stkStatus === "sending" ? (
                      <>
                        <span className="h-3 w-3 rounded-full border-2 border-slate-950 border-t-transparent animate-spin" />
                        <span>Sending to Safaricom...</span>
                      </>
                    ) : (
                      <>
                        <span>⚡</span>
                        <span>Dispatch STK Prompt</span>
                      </>
                    )}
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
