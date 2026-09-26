"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api-client";
import { TrendChart } from "@/components/charts/trend-chart";
import { StackedColumns } from "@/components/charts/stacked-columns";
import { BarList } from "@/components/charts/bar-list";
import { ChartTable } from "@/components/charts/chart-table";
import { formatMoney } from "@/lib/money";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
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
    status: "ACTIVE" | "SUSPENDED" | "CANCELLED" | "PENDING_APPROVAL";
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

function timeOfDayGreeting(): string {
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

export default function DashboardHomePage() {
  const { user } = useAuth();
  const isPlatform = user?.tenantId === null;
  const isStaff = !isPlatform && Boolean(user?.permissions.includes("reports.read"));
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
    queryFn: () => apiFetch<MaintenanceStatus>("/api/v1/maintenance", { skipAuth: true }),
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
  const { data: routers } = useQuery({
    queryKey: ["routers"],
    queryFn: () => apiFetch<RouterRow[]>("/api/v1/routers"),
    enabled: canReadRouters,
    refetchInterval: 15_000,
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
    ? { value: "Stopped", hint: "Worker is not running", tone: "bad" as const }
    : automationTrouble.length > 0
    ? { value: "Needs attention", hint: `${automationTrouble.length} job${automationTrouble.length === 1 ? "" : "s"} failing or late`, tone: "warn" as const }
    : { value: "Running", hint: `${automation.jobs.length} scheduled jobs healthy`, tone: "good" as const };

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
    ? "No routers linked yet"
    : downRouters > 0
    ? `${downRouters} offline`
    : onlineRouters === totalRouters
    ? "All online"
    : `${totalRouters - onlineRouters} not reporting`;

  return (
    <div className="w-full min-w-0 space-y-6">
      {/* Header */}
      <PageHeader
        title={isPlatform ? "Platform overview" : `Good ${timeOfDayGreeting()}, ${friendlyNameFromEmail(user?.email)}`}
        description={
          isPlatform
            ? "ISPs on the platform, platform status and where to manage them."
            : "Your customers, routers and payments at a glance."
        }
        actions={
          isPlatform ? (
            <>
              <Link href="/tenants" className={darkButton("primary")}>
                Manage tenants
              </Link>
              <Link href="/admin/products" className={darkButton("secondary")}>
                Store prices
              </Link>
              <Link href="/admin/orders" className={darkButton("secondary")}>
                Hardware orders
              </Link>
            </>
          ) : (
            <>
              {user?.permissions.includes("customers.read") && (
                <Link href="/customers" className={darkButton("primary")}>
                  Add customer
                </Link>
              )}
              {canReadRouters && (
                <Link href="/routers/new" className={darkButton("secondary")}>
                  Link router
                </Link>
              )}
            </>
          )
        }
      />

      {/* Super admin */}
      {isPlatform && (
        <>
          <MetricGrid columns={5}>
            <Metric
              label="ISPs on the platform"
              value={platformTenants?.pagination.total ?? "—"}
              hint={platformTenants ? `${activeTenantsCount} active · ${trialTenantsCount} in trial` : undefined}
              href="/tenants"
            />
            <Metric
              label="Platform status"
              value={platformMaintenance ? (platformMaintenance.active ? "Maintenance" : "Normal") : "—"}
              hint={platformMaintenance ? (platformMaintenance.active ? "Customers see the maintenance notice" : "No maintenance scheduled") : undefined}
              tone={platformMaintenance?.active ? "warn" : undefined}
              href="/maintenance"
            />
            <Metric
              label="Awaiting approval"
              value={pendingTenants ? pendingTenants.pagination.total : "—"}
              hint={pendingTenants ? (pendingTenants.pagination.total > 0 ? "New ISPs waiting for you to approve them" : "No applications waiting") : undefined}
              tone={pendingTenants && pendingTenants.pagination.total > 0 ? "warn" : undefined}
              href="/tenants"
            />
            <Metric label="Payments" value="Gateway" hint="Collections, settlements and reconciliation" href="/admin/payments" />
            <Metric label="Automation" value={automationMetric.value} hint={automationMetric.hint} tone={automationMetric.tone} href="/automation" />
          </MetricGrid>

          <Panel
            title="ISPs"
            description="The ten most recent tenants"
            padded={false}
            actions={
              <Link href="/tenants" className={darkButton("secondary", "sm")}>
                View all
              </Link>
            }
          >
            <TableShell minWidth={620}>
              <thead>
                <tr>
                  <th className={th}>ISP</th>
                  <th className={th}>Slug</th>
                  <th className={th}>Status</th>
                  <th className={th}>Plan</th>
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
            {platformTenants && platformTenants.items.length === 0 && <EmptyState title="No ISPs yet" />}
          </Panel>
        </>
      )}

      {isStaff && <OnboardingChecklist />}

      {/* Tenant staff */}
      {isStaff && (
        <>
          <MetricGrid columns={canReadVlans && canSeeAutomation ? 6 : canReadVlans || canSeeAutomation ? 5 : 4}>
            <Metric
              label="Collected, last 30 days"
              value={revenue30dMinor !== null ? formatMoney(revenue30dMinor) : "—"}
              hint={revenue ? `${totalPaymentCount} payment${totalPaymentCount === 1 ? "" : "s"}` : undefined}
              href="/payments"
            />
            <Metric
              label="Outstanding invoices"
              value={outstanding ? formatMoney(outstanding.outstandingMinor) : "—"}
              hint={outstanding ? (outstanding.overdueCount > 0 ? `${outstanding.overdueCount} overdue` : `${outstanding.invoiceCount} open`) : undefined}
              tone={outstanding && outstanding.overdueCount > 0 ? "warn" : undefined}
              href="/invoices"
            />
            <Metric label="Customers" value={customers?.pagination.total ?? "—"} hint="PPPoE and hotspot" href="/customers" />
            <Metric
              label="Routers online"
              value={routers ? `${onlineRouters} / ${totalRouters}` : "—"}
              hint={routerHint}
              tone={downRouters > 0 ? "bad" : totalRouters > 0 && onlineRouters === totalRouters ? "good" : undefined}
              href="/routers"
            />
            {canReadVlans && (
              <Metric
                label="VLANs"
                value={vlanOverview ? vlanOverview.total : "—"}
                hint={
                  vlanOverview
                    ? vlanOverview.provisioningFailed > 0
                      ? `${vlanOverview.provisioningFailed} failed to provision`
                      : `${vlanOverview.enabled} enabled`
                    : undefined
                }
                tone={vlanOverview && vlanOverview.provisioningFailed > 0 ? "bad" : undefined}
                href="/vlans"
              />
            )}
            {canSeeAutomation && (
              <Metric label="Automation" value={automationMetric.value} hint={automationMetric.hint} tone={automationMetric.tone} href="/automation" />
            )}
          </MetricGrid>

          {/* Routers */}
          {canReadRouters && (
            <Panel
              title="Routers"
              description="Status as last reported by each router"
              padded={false}
              actions={
                <>
                  <Link href="/routers/new" className={darkButton("secondary", "sm")}>
                    Link router
                  </Link>
                  <Link href="/routers" className={darkButton("ghost", "sm")}>
                    View all
                  </Link>
                </>
              }
            >
              {routers && routers.length > 0 ? (
                <TableShell minWidth={560}>
                  <thead>
                    <tr>
                      <th className={th}>Name</th>
                      <th className={th}>Address</th>
                      <th className={th}>Model</th>
                      <th className={th}>Status</th>
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
                  title="No routers linked yet"
                  action={
                    <Link href="/routers/new" className={darkButton("primary", "sm")}>
                      Link your first MikroTik
                    </Link>
                  }
                >
                  Linking a router generates a setup script for it, with its own RADIUS secret.
                </EmptyState>
              )}
            </Panel>
          )}

          {/* VLANs */}
          {canReadVlans && (
            <Panel
              title="VLANs"
              description="Tagged network segments and their provisioning status"
              padded={false}
              actions={
                <>
                  <button type="button" onClick={() => autoProvision.mutate()} disabled={autoProvision.isPending} className={darkButton("secondary", "sm")}>
                    {autoProvision.isPending ? "Setting up…" : "Set up standard VLANs"}
                  </button>
                  <Link href="/vlans" className={darkButton("ghost", "sm")}>
                    Manage
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
                      <th className={th}>Name</th>
                      <th className={th}>Type</th>
                      <th className={th}>Router</th>
                      <th className={th}>Subnet</th>
                      <th className={th}>Provisioning</th>
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
                <EmptyState title="No VLANs yet">
                  VLANs keep PPPoE, hotspot and management traffic on separate networks. &ldquo;Set up standard VLANs&rdquo; creates 100 (PPPoE),
                  200 (hotspot) and 99 (management).
                </EmptyState>
              )}
            </Panel>
          )}

          {/* Revenue */}
          <Panel
            title="Revenue"
            description="Completed payments per day, last 30 days"
            actions={
              <Link href="/payments" className={darkButton("ghost", "sm")}>
                Payments
              </Link>
            }
          >
            {!revenue || revenue.length === 0 ? (
              <EmptyState title="No payments in the last 30 days">Payments will be charted here as they come in.</EmptyState>
            ) : (
              <>
                <TrendChart
                  points={revenue.map((day) => ({ date: day.date, value: day.totalMinor }))}
                  format={formatMoney}
                  caption="Revenue per day, last 30 days"
                />
                <div className="mt-3 flex items-center justify-between border-t border-obsidian-800 pt-3 text-sm text-slate-400">
                  <span>
                    {totalPaymentCount} payment{totalPaymentCount === 1 ? "" : "s"} over {revenue.length} day{revenue.length === 1 ? "" : "s"}
                  </span>
                  <span className="font-medium text-white">{revenue30dMinor !== null ? formatMoney(revenue30dMinor) : "—"}</span>
                </div>
                <ChartTable columns={["Date", "Revenue", "Payments"]} rows={revenue.map((day) => [day.date, formatMoney(day.totalMinor), day.paymentCount])} />
              </>
            )}
          </Panel>

          {/* Bandwidth */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <Panel
                title="Bandwidth"
                description={`Download and upload from RADIUS accounting · ${formatBytes(totalBandwidthBytes)} in total`}
                actions={
                  <Segmented
                    label="Range"
                    value={bandwidthRange}
                    onChange={setBandwidthRange}
                    options={[
                      { value: 7, label: "7 days" },
                      { value: 14, label: "14 days" },
                      { value: 30, label: "30 days" },
                    ]}
                  />
                }
              >
                {!bandwidth || bandwidth.length === 0 ? (
                  <EmptyState title="No usage recorded yet">Usage appears once customers are online through a linked router.</EmptyState>
                ) : (
                  <>
                    <StackedColumns
                      columns={bandwidth.map((day) => ({ date: day.date, primary: day.downloadBytes, secondary: day.uploadBytes }))}
                      primaryLabel="Download"
                      secondaryLabel="Upload"
                      format={formatBytes}
                    />
                    <div className="mt-3 flex items-center justify-between border-t border-obsidian-800 pt-3 text-sm text-slate-400">
                      <span>
                        {formatBytes(totalDownloadBytes)} down · {formatBytes(totalUploadBytes)} up
                      </span>
                      <span>Busiest day {formatBytes(maxDailyBytes)}</span>
                    </div>
                  </>
                )}
              </Panel>
            </div>

            <Panel
              title="Top users"
              description="Most data used, last 30 days"
              actions={
                <Link href="/sessions" className={darkButton("ghost", "sm")}>
                  Sessions
                </Link>
              }
            >
              {!topConsumers || topConsumers.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">No usage recorded yet.</p>
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
              title="Recent payments"
              padded={false}
              actions={
                <Link href="/invoices" className={darkButton("ghost", "sm")}>
                  View all
                </Link>
              }
            >
              <TableShell minWidth={560}>
                <thead>
                  <tr>
                    <th className={th}>Reference</th>
                    <th className={th}>Method</th>
                    <th className={`${th} text-right`}>Amount</th>
                    <th className={th}>Date</th>
                    <th className={th}>Status</th>
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
