"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { dashboardStrings } from "@/lib/dashboard-strings";
import { apiFetch } from "@/lib/api-client";
import { TrendChart } from "@/components/charts/trend-chart";
import { StackedColumns } from "@/components/charts/stacked-columns";
import { BarList } from "@/components/charts/bar-list";
import { ChartTable } from "@/components/charts/chart-table";
import { formatMoney } from "@/lib/money";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { CustomerPortal } from "@/components/customer-portal";
import { NetworkFlow, PlatformPulse } from "@/components/dashboard/network-flow";
import { BandwidthHeatmap } from "@/components/dashboard/bandwidth-heatmap";
import { useAgentRedirect } from "@/lib/use-agent-redirect";
import {
  EmptyState,
  Metric,
  MetricGrid,
  Notice,
  PageHeader,
  Panel,
  Pill,
  Segmented,
  TableShell,
  darkButton,
  td,
  th,
} from "@/components/dashboard/surface";
import { tr } from "@/lib/tr";

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

interface DashboardSession {
  username: string;
  router: { id: string; name: string } | null;
  state: "ACTIVE" | "STALE" | "ENDED";
  downloadBytes: number;
  uploadBytes: number;
}

interface UpgradeSuggestionSummary {
  id: string;
  fromPackageName: string;
  toPackageName: string;
  usedMb: number;
  capMb: number;
  customer: { id: string; fullName: string };
}

interface PaginatedTenants {
  items: Array<{
    id: string;
    name: string;
    slug: string;
    status: "ACTIVE" | "SUSPENDED" | "CANCELLED" | "PENDING_APPROVAL";
    createdAt: string;
    trialEndsAt: string | null;
    disabledFeatures: string[];
    platformUrl: string;
  }>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface MaintenanceStatus {
  enabled: boolean;
  message?: string | null;
}

interface AutomationHealth {
  worker: { online: boolean; lastHeartbeatAt: string | null };
  jobs: Array<{ name: string; label: string; status: "ok" | "failed" | "late" | "never" }>;
}

interface VlanOverview {
  total: number;
  enabled: number;
  disabled: number;
  provisioningFailed: number;
}

interface DashboardVlan {
  id: string;
  vlanTag: number;
  name: string;
  type: string;
  customTypeLabel?: string | null;
  routerId?: string | null;
  router?: { id: string; name: string } | null;
  subnetCidr?: string | null;
  gateway?: string | null;
  isEnabled: boolean;
  provisioningStatus: "NOT_PROVISIONED" | "PENDING" | "ACTIVE" | "FAILED";
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

function timeOfDayGreeting(): "morning" | "afternoon" | "evening" {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

const ROUTER_STATUS: Record<RouterRow["status"], { tone: "good" | "warn" | "bad" | "neutral"; label: string }> = {
  ONLINE: { tone: "good", label: "Online" },
  WARNING: { tone: "warn", label: "Degraded" },
  DOWN: { tone: "bad", label: "Offline" },
  UNKNOWN: { tone: "neutral", label: "Not checked yet" },
};

const VLAN_STATUS: Record<DashboardVlan["provisioningStatus"], { tone: "good" | "warn" | "bad" | "neutral"; label: string }> = {
  ACTIVE: { tone: "good", label: "Active" },
  PENDING: { tone: "warn", label: "Pending" },
  FAILED: { tone: "bad", label: "Failed" },
  NOT_PROVISIONED: { tone: "neutral", label: "Not provisioned" },
};

const PAYMENT_STATUS: Record<string, { tone: "good" | "warn" | "bad" | "neutral"; label: string }> = {
  COMPLETED: { tone: "good", label: "Completed" },
  PENDING: { tone: "warn", label: "Pending" },
  FAILED: { tone: "bad", label: "Failed" },
  REVERSED: { tone: "bad", label: "Reversed" },
};

const METHOD_LABEL: Record<string, string> = {
  MPESA: "M-Pesa",
  PAYSTACK: "Paystack",
  MANUAL: "Manual",
  WALLET: "Wallet",
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
};

function OperationalAlerts({
  isPlatform,
  pendingApprovals,
  maintenance,
  downRouters,
  overdueInvoices,
  overdueTickets,
  automationTrouble,
}: {
  isPlatform: boolean;
  pendingApprovals: number;
  maintenance: boolean;
  downRouters: number;
  overdueInvoices: number;
  overdueTickets: number;
  automationTrouble: number;
}) {
  const alerts = isPlatform
    ? [
        ...(pendingApprovals > 0 ? [{ label: `${pendingApprovals} tenant approval${pendingApprovals === 1 ? "" : "s"} waiting`, href: "/tenants", tone: "warn" as const }] : []),
        ...(maintenance ? [{ label: "Platform maintenance is enabled", href: "/maintenance", tone: "warn" as const }] : []),
        ...(automationTrouble > 0 ? [{ label: `${automationTrouble} automation job${automationTrouble === 1 ? "" : "s"} need attention`, href: "/automation", tone: "bad" as const }] : []),
      ]
    : [
        ...(downRouters > 0 ? [{ label: `${downRouters} router${downRouters === 1 ? " is" : "s are"} offline`, href: "/routers/health", tone: "bad" as const }] : []),
        ...(overdueInvoices > 0 ? [{ label: `${overdueInvoices} overdue invoice${overdueInvoices === 1 ? "" : "s"}`, href: "/invoices?status=OVERDUE", tone: "warn" as const }] : []),
        ...(overdueTickets > 0 ? [{ label: `${overdueTickets} support ticket${overdueTickets === 1 ? " is" : "s are"} past response target`, href: "/tickets", tone: "bad" as const }] : []),
        ...(automationTrouble > 0 ? [{ label: `${automationTrouble} background job${automationTrouble === 1 ? "" : "s"} need attention`, href: "/automation", tone: "warn" as const }] : []),
      ];

  return (
    <Panel title="Operational alerts" description={alerts.length ? "Issues worth acting on now." : "No active issues detected from the latest checks."}>
      {alerts.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {alerts.map((alert) => (
            <Link key={alert.label} href={alert.href} className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-sm transition hover:bg-white/5 ${alert.tone === "bad" ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-100" : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-100"}`}>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${alert.tone === "bad" ? "bg-rose-400" : "bg-amber-400"}`} />
              <span className="flex-1">{alert.label}</span>
              <span className="text-xs opacity-70">Open →</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-100">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="text-emerald-700 dark:text-emerald-100">Everything is within the latest health and billing checks.</span>
        </div>
      )}
    </Panel>
  );
}

function UpgradePulse({ suggestions }: { suggestions: UpgradeSuggestionSummary[] }) {
  if (!suggestions.length) return null;
  return (
    <Panel title="Usage-based recommendations" description="Customers approaching their data cap, based on the last 30 days of RADIUS accounting." actions={<Link href="/customers/upgrades" className={darkButton("ghost", "sm")}>Review all</Link>}>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {suggestions.slice(0, 6).map((suggestion) => {
          const percent = Math.min(999, Math.round((suggestion.usedMb / Math.max(suggestion.capMb, 1)) * 100));
          return (
            <Link key={suggestion.id} href={`/customers/${suggestion.customer.id}`} className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-3 transition hover:bg-cyan-500/10">
              <div className="flex items-center justify-between gap-2 text-sm"><span className="truncate font-semibold text-white">{suggestion.customer.fullName}</span><span className="font-mono text-cyan-300">{percent}%</span></div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-obsidian-800"><div className={`h-full rounded-full ${percent >= 100 ? "bg-rose-400" : "bg-cyan-400"}`} style={{ width: `${Math.min(percent, 100)}%` }} /></div>
              <p className="mt-2 text-xs text-slate-400">{suggestion.fromPackageName} → <span className="text-cyan-200">{suggestion.toPackageName}</span></p>
            </Link>
          );
        })}
      </div>
    </Panel>
  );
}

export default function DashboardHomePage() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const t = dashboardStrings(lang);
  const isPlatform = user?.tenantId === null;
  const isStaff = !isPlatform && Boolean(user?.permissions.includes("reports.read"));
  const checkingAgent = useAgentRedirect(Boolean(user) && !isPlatform && !isStaff);
  const [bandwidthRange, setBandwidthRange] = useState<number>(14);
  const [autoProvisionMsg, setAutoProvisionMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const queryClient = useQueryClient();

  // Platform / Super Admin
  const { data: platformTenants } = useQuery({
    queryKey: ["platform-tenants-summary"],
    queryFn: () => apiFetch<PaginatedTenants>("/api/v1/platform/tenants?limit=10"),
    enabled: isPlatform,
  });

  const { data: pendingTenants } = useQuery({
    queryKey: ["platform-tenants-pending"],
    queryFn: () => apiFetch<PaginatedTenants>("/api/v1/platform/tenants?status=PENDING_APPROVAL&limit=1"),
    enabled: isPlatform,
    refetchInterval: 60_000,
  });

  const { data: platformMaintenance } = useQuery({
    queryKey: ["platform-maintenance"],
    // The public status endpoint; the old "/api/v1/maintenance" path never existed, so this tile
    // showed "—" forever.
    queryFn: () => apiFetch<MaintenanceStatus>("/api/v1/platform/maintenance/status", { skipAuth: true }),
    enabled: isPlatform,
  });

  // Tenant staff
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

  const canReadRouters = isStaff && Boolean(user?.permissions.includes("routers.read"));
  const canReadTickets = isStaff && Boolean(user?.permissions.includes("tickets.read"));
  const { data: openTickets } = useQuery({
    queryKey: ["tickets", "open-dashboard"],
    queryFn: () => apiFetch<{ id: string; responseOverdue?: boolean }[]>("/api/v1/tickets?status=OPEN"),
    enabled: canReadTickets,
    refetchInterval: 60_000,
  });
  const overdueTickets = openTickets?.filter((t) => t.responseOverdue).length ?? 0;
  const { data: routers } = useQuery({
    queryKey: ["routers"],
    queryFn: () => apiFetch<RouterRow[]>("/api/v1/routers"),
    enabled: canReadRouters,
    refetchInterval: 15_000,
  });

  const { data: upgradeSuggestions } = useQuery({
    queryKey: ["dashboard-upgrade-suggestions"],
    queryFn: () => apiFetch<UpgradeSuggestionSummary[]>("/api/v1/upgrades?status=PENDING"),
    enabled: isStaff && Boolean(user?.permissions.includes("customers.read")),
    refetchInterval: 60_000,
  });

  const { data: liveSessions } = useQuery({
    queryKey: ["dashboard-live-sessions"],
    queryFn: () => apiFetch<{ items: DashboardSession[] }>("/api/v1/radius/sessions?scope=active&limit=100"),
    enabled: canReadRouters,
    refetchInterval: 20_000,
  });

  const { data: recentPayments } = useQuery({
    queryKey: ["recent-payments-dashboard"],
    queryFn: () => apiFetch<PaginatedPayments>("/api/v1/payments?limit=5"),
    enabled: isStaff && Boolean(user?.permissions.includes("payments.read")),
  });

  const canReadVlans = isStaff && Boolean(user?.permissions.includes("vlans.read"));

  const { data: vlanOverview } = useQuery({
    queryKey: ["vlans-overview-dashboard"],
    queryFn: () => apiFetch<VlanOverview>("/api/v1/vlans/overview"),
    enabled: canReadVlans,
    refetchInterval: 15_000,
  });

  const { data: dashboardVlans } = useQuery({
    queryKey: ["vlans-list-dashboard"],
    queryFn: () => apiFetch<DashboardVlan[]>("/api/v1/vlans"),
    enabled: canReadVlans,
    refetchInterval: 15_000,
  });

  // Whether the background work (billing, reminders, router checks) is actually happening.
  const canSeeAutomation = isPlatform ? Boolean(user?.permissions.includes("maintenance.manage")) : isStaff && Boolean(user?.permissions.includes("settings.manage"));
  const { data: automation } = useQuery({
    queryKey: ["automation-jobs"],
    queryFn: () => apiFetch<AutomationHealth>("/api/v1/automation/jobs"),
    enabled: canSeeAutomation,
    refetchInterval: 30_000,
  });
  const automationTrouble = automation?.jobs.filter((j) => j.status === "failed" || j.status === "late") ?? [];
  const automationMetric = !automation
    ? { value: "—" as ReactNode, hint: undefined as string | undefined, tone: undefined as "good" | "warn" | "bad" | undefined }
    : !automation.worker.online
    ? { value: t.stopped, hint: t.workerNotRunning, tone: "bad" as const }
    : automationTrouble.length > 0
    ? { value: t.needsAttention, hint: t.jobsFailing(automationTrouble.length), tone: "warn" as const }
    : { value: t.running, hint: t.jobsHealthy(automation.jobs.length), tone: "good" as const };

  const autoProvision = useMutation({
    mutationFn: () => apiFetch<{ provisioned: number }>("/api/v1/vlans/auto-provision", { method: "POST" }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["vlans-overview-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["vlans-list-dashboard"] });
      setAutoProvisionMsg({ ok: true, text: `Set up ${res.provisioned} standard VLAN${res.provisioned === 1 ? "" : "s"}.` });
      setTimeout(() => setAutoProvisionMsg(null), 5000);
    },
    onError: (err) => {
      setAutoProvisionMsg({ ok: false, text: `Couldn't set up VLANs: ${err instanceof Error ? err.message : String(err)}` });
      setTimeout(() => setAutoProvisionMsg(null), 6000);
    },
  });

  const revenue30dMinor = revenue?.reduce((sum, day) => sum + day.totalMinor, 0) ?? null;
  const totalPaymentCount = revenue?.reduce((sum, day) => sum + day.paymentCount, 0) ?? 0;

  const totalDownloadBytes = bandwidth?.reduce((sum, day) => sum + day.downloadBytes, 0) ?? 0;
  const totalUploadBytes = bandwidth?.reduce((sum, day) => sum + day.uploadBytes, 0) ?? 0;
  const totalBandwidthBytes = totalDownloadBytes + totalUploadBytes;
  const maxDailyBytes = Math.max(...(bandwidth?.map((d) => d.downloadBytes + d.uploadBytes) ?? [0]), 0);

  const onlineRouters = routers?.filter((r) => r.status === "ONLINE").length ?? 0;
  const downRouters = routers?.filter((r) => r.status === "DOWN").length ?? 0;
  const totalRouters = routers?.length ?? 0;

  const activeTenantsCount = platformTenants?.items.filter((t) => t.status === "ACTIVE").length ?? 0;
  const trialTenantsCount = platformTenants?.items.filter((t) => t.trialEndsAt && new Date(t.trialEndsAt) > new Date()).length ?? 0;

  const routerHint = !routers
    ? undefined
    : totalRouters === 0
    ? t.noRoutersYet
    : downRouters > 0
    ? t.offline(downRouters)
    : onlineRouters === totalRouters
    ? t.allOnline
    : t.notReporting(totalRouters - onlineRouters);

  // A subscriber (tenant-scoped, no staff permissions) gets their own portal, not an empty
  // operator dashboard: their service, bills, a pay button and support.
  if (!isPlatform && !isStaff) return checkingAgent ? null : <CustomerPortal />;

  return (
    <div className="w-full min-w-0 space-y-6">
      {/* Header */}
      <PageHeader
        title={isPlatform ? t.platformOverview : t.greeting(timeOfDayGreeting(), friendlyNameFromEmail(user?.email))}
        description={isPlatform ? t.platformDescription : t.homeDescription}
        actions={
          isPlatform ? (
            <>
              <Link href="/tenants" className={darkButton("primary")}>
                {tr("Manage tenants")}
              </Link>
              {user?.permissions.includes("tenants.update") && (
                <Link href="/admin/notifications?alert=1" className={darkButton("secondary")}>
                  {tr("Send alert")}
                </Link>
              )}
              <Link href="/admin/products" className={darkButton("secondary")}>
                {tr("Store prices")}
              </Link>
              <Link href="/admin/orders" className={darkButton("secondary")}>
                {tr("Hardware orders")}
              </Link>
            </>
          ) : (
            <>
              {user?.permissions.includes("customers.read") && (
                <Link href="/customers" className={darkButton("primary")}>
                  {tr("Add customer")}
                </Link>
              )}
              {canReadRouters && (
                <Link href="/routers/new" className={darkButton("secondary")}>
                  {tr("Link router")}
                </Link>
              )}
            </>
          )
        }
      />

      {isStaff && (
        <section className="relative overflow-hidden rounded-2xl border border-brand-500/25 bg-gradient-to-br from-brand-600/20 via-obsidian-900 to-obsidian-900 p-5 sm:p-6">
          <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-brand-500/10 blur-3xl" aria-hidden="true" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">{tr("Tenant control centre")}</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">{tr("Keep your network and collections moving")}</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
                {tr("See what needs attention, then jump straight into the work that keeps customers online.")}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:justify-end">
              <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">{t.routersOnline}</p>
                <p className="mt-1 text-lg font-semibold text-white">{routers ? `${onlineRouters}/${totalRouters}` : "—"}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">{t.customers}</p>
                <p className="mt-1 text-lg font-semibold text-white">{customers?.pagination.total ?? "—"}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">{t.collected30}</p>
                <p className="mt-1 text-lg font-semibold text-white">{revenue30dMinor !== null ? formatMoney(revenue30dMinor) : "—"}</p>
              </div>
            </div>
          </div>
          <div className="relative mt-6 flex flex-wrap gap-2 border-t border-white/10 pt-4">
            {user?.permissions.includes("customers.read") && <Link href="/customers" className={darkButton("primary", "sm")}>{tr("Add customer")}</Link>}
            {user?.permissions.includes("payments.read") && <Link href="/payments" className={darkButton("secondary", "sm")}>{tr("Review payments")}</Link>}
            {canReadRouters && <Link href="/routers" className={darkButton("secondary", "sm")}>{tr("Check routers")}</Link>}
            {canReadTickets && <Link href="/tickets" className={darkButton("secondary", "sm")}>{tr("Open support")}</Link>}
          </div>
        </section>
      )}

      {/* Super admin */}
      {isPlatform && (
        <>
          <OperationalAlerts isPlatform pendingApprovals={pendingTenants?.pagination.total ?? 0} maintenance={Boolean(platformMaintenance?.enabled)} downRouters={0} overdueInvoices={0} overdueTickets={0} automationTrouble={automationTrouble.length} />
          <MetricGrid columns={5}>
            <Metric
              label={tr("ISPs on the platform")}
              value={platformTenants?.pagination.total ?? "—"}
              hint={platformTenants ? `${activeTenantsCount} active · ${trialTenantsCount} in trial` : undefined}
              href="/tenants"
            />
            <Metric
              label={tr("Platform status")}
              value={platformMaintenance ? (platformMaintenance.enabled ? "Maintenance" : "Normal") : "—"}
              hint={platformMaintenance ? (platformMaintenance.enabled ? "Customers see the maintenance notice" : "No maintenance scheduled") : undefined}
              tone={platformMaintenance?.enabled ? "warn" : undefined}
              href="/maintenance"
            />
            <Metric
              label={tr("Awaiting approval")}
              value={pendingTenants ? pendingTenants.pagination.total : "—"}
              hint={pendingTenants ? (pendingTenants.pagination.total > 0 ? "New ISPs waiting for you to approve them" : "No applications waiting") : undefined}
              tone={pendingTenants && pendingTenants.pagination.total > 0 ? "warn" : undefined}
              href="/tenants"
            />
            <Metric label={tr("Payments")} value="Gateway" hint={tr("Collections, settlements and reconciliation")} href="/admin/payments" />
            <Metric label={tr("Automation")} value={automationMetric.value} hint={automationMetric.hint} tone={automationMetric.tone} href="/automation" />
          </MetricGrid>

          <PlatformPulse tenants={platformTenants?.items ?? []} />

          <Panel
            title={tr("ISPs")}
            description={tr("The ten most recent tenants")}
            padded={false}
            actions={
              <Link href="/tenants" className={darkButton("secondary", "sm")}>
                {tr("View all")}
              </Link>
            }
          >
            <TableShell minWidth={620}>
              <thead>
                <tr>
                  <th className={th}>ISP</th>
                  <th className={th}>Slug</th>
                  <th className={th}>{tr("Status")}</th>
                  <th className={th}>{tr("Plan")}</th>
                </tr>
              </thead>
              <tbody>
                {platformTenants?.items.map((tenant) => {
                  const inTrial = tenant.trialEndsAt ? new Date(tenant.trialEndsAt) > new Date() : false;
                  return (
                    <tr key={tenant.id}>
                      <td className={`${td} font-medium text-white`}>{tenant.name}</td>
                      <td className={`${td} text-slate-400`}>{tenant.slug}</td>
                      <td className={td}>
                        <Pill tone={tenant.status === "ACTIVE" ? "good" : tenant.status === "SUSPENDED" ? "warn" : tenant.status === "PENDING_APPROVAL" ? "warn" : "neutral"}>
                          {tenant.status === "ACTIVE" ? "Active" : tenant.status === "SUSPENDED" ? "Suspended" : tenant.status === "PENDING_APPROVAL" ? "Pending" : "Cancelled"}
                        </Pill>
                      </td>
                      <td className={`${td} text-slate-400`}>{tenant.trialEndsAt ? (inTrial ? "Trial" : "Trial ended") : "Paid"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </TableShell>
            {platformTenants && platformTenants.items.length === 0 && <EmptyState title={tr("No ISPs yet")} />}
          </Panel>
        </>
      )}

      {isStaff && <OnboardingChecklist />}

      {isStaff && (
        <OperationalAlerts
          isPlatform={false}
          pendingApprovals={0}
          maintenance={false}
          downRouters={downRouters}
          overdueInvoices={outstanding?.overdueCount ?? 0}
          overdueTickets={overdueTickets}
          automationTrouble={automationTrouble.length}
        />
      )}

      {isStaff && <UpgradePulse suggestions={upgradeSuggestions ?? []} />}

      {/* Tenant staff */}
      {isStaff && (
        <>
          <MetricGrid columns={[canReadVlans, canSeeAutomation, canReadTickets].filter(Boolean).length >= 2 ? 6 : [canReadVlans, canSeeAutomation, canReadTickets].some(Boolean) ? 5 : 4}>
            <Metric
              label={t.collected30}
              value={revenue30dMinor !== null ? formatMoney(revenue30dMinor) : "—"}
              hint={revenue ? t.payments(totalPaymentCount) : undefined}
              href="/payments"
            />
            <Metric
              label={t.outstandingInvoices}
              value={outstanding ? formatMoney(outstanding.outstandingMinor) : "—"}
              hint={outstanding ? (outstanding.overdueCount > 0 ? t.overdue(outstanding.overdueCount) : t.open(outstanding.invoiceCount)) : undefined}
              tone={outstanding && outstanding.overdueCount > 0 ? "warn" : undefined}
              href="/invoices"
            />
            <Metric label={t.customers} value={customers?.pagination.total ?? "—"} hint={t.customersHint} href="/customers" />
            <Metric
              label={t.routersOnline}
              value={routers ? `${onlineRouters} / ${totalRouters}` : "—"}
              hint={routerHint}
              tone={downRouters > 0 ? "bad" : totalRouters > 0 && onlineRouters === totalRouters ? "good" : undefined}
              href="/routers"
            />
            {canReadVlans && (
              <Metric
                label={t.vlans}
                value={vlanOverview ? vlanOverview.total : "—"}
                hint={vlanOverview ? (vlanOverview.provisioningFailed > 0 ? t.failedToProvision(vlanOverview.provisioningFailed) : t.enabled(vlanOverview.enabled)) : undefined}
                tone={vlanOverview && vlanOverview.provisioningFailed > 0 ? "bad" : undefined}
                href="/vlans"
              />
            )}
            {canReadTickets && (
              <Metric
                label={t.supportTickets}
                value={openTickets ? openTickets.length : "—"}
                hint={openTickets ? (overdueTickets > 0 ? t.ticketsOverdue(overdueTickets) : t.ticketsOnTime) : undefined}
                tone={overdueTickets > 0 ? "bad" : undefined}
                href="/tickets"
              />
            )}
            {canSeeAutomation && (
              <Metric label={t.automation} value={automationMetric.value} hint={automationMetric.hint} tone={automationMetric.tone} href="/automation" />
            )}
          </MetricGrid>

          {/* Routers */}
          {canReadRouters && (
            <Panel
              title={t.routers}
              description={t.routersDescription}
              padded={false}
              actions={
                <>
                  <Link href="/routers/new" className={darkButton("secondary", "sm")}>
                    {tr("Link router")}
                  </Link>
                  <Link href="/routers" className={darkButton("ghost", "sm")}>
                    {tr("View all")}
                  </Link>
                </>
              }
            >
              {routers && routers.length > 0 ? (
                <TableShell minWidth={560}>
                  <thead>
                    <tr>
                      <th className={th}>{tr("Name")}</th>
                      <th className={th}>{tr("Address")}</th>
                      <th className={th}>{tr("Model")}</th>
                      <th className={th}>{tr("Status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routers.slice(0, 5).map((r) => (
                      <tr key={r.id}>
                        <td className={`${td} font-medium text-white`}>
                          <Link href="/routers" className="hover:underline">
                            {r.name}
                          </Link>
                        </td>
                        <td className={`${td} font-mono text-[13px] text-slate-400`}>{r.ipAddress}</td>
                        <td className={`${td} text-slate-400`}>
                          {r.model ?? "—"}
                          {r.rosVersion && <span className="ml-1.5 text-xs text-slate-500">RouterOS {r.rosVersion}</span>}
                        </td>
                        <td className={td}>
                          <Pill tone={ROUTER_STATUS[r.status].tone}>{ROUTER_STATUS[r.status].label}</Pill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </TableShell>
              ) : (
                <EmptyState
                  title={tr("No routers linked yet")}
                  action={
                    <Link href="/routers/new" className={darkButton("primary", "sm")}>
                      {tr("Link your first MikroTik")}
                    </Link>
                  }
                >
                  {tr("Linking a router generates a setup script for it, with its own RADIUS secret.")}
                </EmptyState>
              )}
            </Panel>
          )}

          {canReadRouters && <NetworkFlow routers={routers ?? []} sessions={liveSessions?.items ?? []} />}

          {/* VLANs */}
          {canReadVlans && (
            <Panel
              title={tr("VLANs")}
              description={tr("Tagged network segments and their provisioning status")}
              padded={false}
              actions={
                <>
                  <button type="button" onClick={() => autoProvision.mutate()} disabled={autoProvision.isPending} className={darkButton("secondary", "sm")}>
                    {autoProvision.isPending ? "Setting up…" : "Set up standard VLANs"}
                  </button>
                  <Link href="/vlans" className={darkButton("ghost", "sm")}>
                    {tr("Manage")}
                  </Link>
                </>
              }
            >
              {autoProvisionMsg && (
                <div className="px-5 pt-4">
                  <Notice tone={autoProvisionMsg.ok ? "good" : "bad"}>{autoProvisionMsg.text}</Notice>
                </div>
              )}
              {dashboardVlans && dashboardVlans.length > 0 ? (
                <TableShell minWidth={680}>
                  <thead>
                    <tr>
                      <th className={th}>VLAN</th>
                      <th className={th}>{tr("Name")}</th>
                      <th className={th}>{tr("Type")}</th>
                      <th className={th}>{tr("Router")}</th>
                      <th className={th}>{tr("Subnet")}</th>
                      <th className={th}>{tr("Provisioning")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardVlans.slice(0, 5).map((v) => (
                      <tr key={v.id}>
                        <td className={`${td} font-medium text-white`}>{v.vlanTag}</td>
                        <td className={`${td} text-slate-200`}>{v.name}</td>
                        <td className={`${td} text-slate-400`}>{v.customTypeLabel || v.type.replace(/_/g, " ").toLowerCase()}</td>
                        <td className={`${td} text-slate-400`}>{v.router?.name ?? "Unassigned"}</td>
                        <td className={`${td} font-mono text-[13px] text-slate-400`}>
                          {v.subnetCidr ?? "—"}
                          {v.gateway && <span className="block text-xs text-slate-500">gateway {v.gateway}</span>}
                        </td>
                        <td className={td}>
                          <Pill tone={VLAN_STATUS[v.provisioningStatus].tone}>{VLAN_STATUS[v.provisioningStatus].label}</Pill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </TableShell>
              ) : (
                <EmptyState title={tr("No VLANs yet")}>
                  VLANs keep PPPoE, hotspot and management traffic on separate networks. &ldquo;Set up standard VLANs&rdquo; creates 100 (PPPoE),
                  200 (hotspot) and 99 (management).
                </EmptyState>
              )}
            </Panel>
          )}

          {/* Revenue */}
          <Panel
            title={t.revenue}
            description={t.revenueDescription}
            actions={
              <Link href="/payments" className={darkButton("ghost", "sm")}>
                {t.paymentsWord}
              </Link>
            }
          >
            {!revenue || revenue.length === 0 ? (
              <EmptyState title={t.noPayments30}>{t.paymentsWillChart}</EmptyState>
            ) : (
              <>
                <TrendChart
                  points={revenue.map((day) => ({ date: day.date, value: day.totalMinor }))}
                  format={formatMoney}
                  caption={tr("Revenue per day, last 30 days")}
                />
                <div className="mt-3 flex items-center justify-between border-t border-obsidian-800 pt-3 text-sm text-slate-400">
                  <span>
                    {t.paymentsOverDays(totalPaymentCount, revenue.length)}
                  </span>
                  <span className="font-medium text-white">{revenue30dMinor !== null ? formatMoney(revenue30dMinor) : "—"}</span>
                </div>
                <ChartTable columns={[t.date, t.revenue, t.paymentsWord]} rows={revenue.map((day) => [day.date, formatMoney(day.totalMinor), day.paymentCount])} />
              </>
            )}
          </Panel>

          {/* Bandwidth */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <Panel
                title={t.bandwidth}
                description={t.bandwidthDescription(formatBytes(totalBandwidthBytes))}
                actions={
                  <Segmented
                    label={t.range}
                    value={bandwidthRange}
                    onChange={setBandwidthRange}
                    options={[
                      { value: 7, label: t.days(7) },
                      { value: 14, label: t.days(14) },
                      { value: 30, label: t.days(30) },
                    ]}
                  />
                }
              >
                {!bandwidth || bandwidth.length === 0 ? (
                  <EmptyState title={t.noUsage}>{t.usageAppears}</EmptyState>
                ) : (
                  <>
                    <StackedColumns
                      columns={bandwidth.map((day) => ({ date: day.date, primary: day.downloadBytes, secondary: day.uploadBytes }))}
                      primaryLabel={t.download}
                      secondaryLabel={t.upload}
                      format={formatBytes}
                    />
                    <BandwidthHeatmap days={bandwidth} />
                    <div className="mt-3 flex items-center justify-between border-t border-obsidian-800 pt-3 text-sm text-slate-400">
                      <span>
                        {formatBytes(totalDownloadBytes)} down · {formatBytes(totalUploadBytes)} up
                      </span>
                      <span>{t.busiestDay} {formatBytes(maxDailyBytes)}</span>
                    </div>
                  </>
                )}
              </Panel>
            </div>

            <Panel
              title={t.topUsers}
              description={t.topUsersDescription}
              actions={
                <Link href="/sessions" className={darkButton("ghost", "sm")}>
                  {t.sessions}
                </Link>
              }
            >
              {!topConsumers || topConsumers.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">{t.noUsage}.</p>
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
            </Panel>
          </div>

          {/* Recent payments */}
          {recentPayments && recentPayments.items.length > 0 && (
            <Panel
              title={t.recentPayments}
              padded={false}
              actions={
                <Link href="/invoices" className={darkButton("ghost", "sm")}>
                  {t.viewAll}
                </Link>
              }
            >
              <TableShell minWidth={560}>
                <thead>
                  <tr>
                    <th className={th}>{t.reference}</th>
                    <th className={th}>{t.method}</th>
                    <th className={`${th} text-right`}>{t.amount}</th>
                    <th className={th}>{t.date}</th>
                    <th className={th}>{t.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayments.items.map((p) => {
                    const status = p.status ? PAYMENT_STATUS[p.status] : undefined;
                    return (
                      <tr key={p.id}>
                        <td className={`${td} font-mono text-[13px] text-slate-200`}>{p.reference ?? "—"}</td>
                        <td className={`${td} text-slate-400`}>{METHOD_LABEL[p.method] ?? p.method}</td>
                        <td className={`${td} text-right font-medium tabular-nums text-white`}>{formatMoney(p.amountMinor)}</td>
                        <td className={`${td} text-slate-400`}>{new Date(p.createdAt).toLocaleString()}</td>
                        <td className={td}>{status ? <Pill tone={status.tone}>{status.label}</Pill> : <span className="text-slate-500">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableShell>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
