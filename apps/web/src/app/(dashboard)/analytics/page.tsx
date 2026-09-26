"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { useBranches } from "@/lib/use-branches";
import { formatMoney } from "@/lib/money";
import { TrendChart } from "@/components/charts/trend-chart";
import { BarList } from "@/components/charts/bar-list";
import { ChartTable } from "@/components/charts/chart-table";
import { HourColumns } from "@/components/charts/hour-columns";
import { EmptyState, Metric, MetricGrid, PageHeader, Panel, Pill, Segmented, TableShell, td, th } from "@/components/dashboard/surface";
import { tr } from "@/lib/tr";
import { useLanguage } from "@/lib/language-context";

/**
 * The business at a glance: is revenue growing, what sells, when customers pay, and who is about
 * to leave. Every number comes from completed payments in the ISP's own timezone.
 */

interface Analytics {
  currency: string;
  months: { month: string; revenueMinor: number; payments: number; newCustomers: number }[];
  growth: { thisMonthMinor: number; lastMonthMinor: number; changePercent: number | null };
  subscribers: { active: number; suspended: number; arpuMinor: number | null };
  byPackage: { name: string; kind: "SUBSCRIPTION" | "HOTSPOT"; revenueMinor: number; sales: number }[];
  byHour: { hour: number; payments: number }[];
  byWeekday: { weekday: number; payments: number }[];
  atRisk: { customerId: string; fullName: string; phone: string; reason: string; since: string | null; owedMinor: number }[];
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString("en-KE", { month: "short", year: "numeric" });
}

export default function AnalyticsPage() {
  const [months, setMonths] = useState<6 | 12>(6);
  const [branch, setBranch] = useState("");
  const { branches } = useBranches();
  const sw = useLanguage().lang === "sw";
  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics", months, branch],
    queryFn: () => apiFetch<Analytics>(`/api/v1/reports/analytics?months=${months}${branch ? `&branchId=${branch}` : ""}`),
  });

  const money = (minor: number) => formatMoney(minor, data?.currency ?? "KES");
  // Chart axis labels have little room; the table under each chart keeps the exact amounts.
  const compactMoney = (minor: number) => {
    const v = minor / 100;
    const cur = data?.currency === "KES" || !data ? "Ksh" : data.currency;
    if (v >= 1_000_000) return `${cur} ${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${cur} ${(v / 1_000).toFixed(v >= 10_000 ? 0 : 1)}k`;
    return `${cur} ${Math.round(v)}`;
  };
  const g = data?.growth;
  const busiest = data?.byHour.reduce((best, h) => (h.payments > best.payments ? h : best), { hour: 0, payments: 0 });
  const totalRevenue = data?.months.reduce((s, m) => s + m.revenueMinor, 0) ?? 0;
  const newCustomers = data?.months.reduce((s, m) => s + m.newCustomers, 0) ?? 0;

  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHeader
        title={tr("Analytics")}
        description={tr("Growth, what sells, when customers pay, and who is at risk of leaving.")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
          {branches.length > 0 && (
            <select value={branch} onChange={(e) => setBranch(e.target.value)} aria-label={tr("Branch")} className="rounded-lg border border-obsidian-700 bg-obsidian-950 px-2.5 py-1 text-xs text-slate-200">
              <option value="">{tr("All branches")}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          <Segmented
            label={tr("Period")}
            value={months}
            onChange={setMonths}
            options={[
              { value: 6, label: sw ? "Miezi 6" : "6 months" },
              { value: 12, label: sw ? "Miezi 12" : "12 months" },
            ]}
          />
          </div>
        }
      />

      {error && <p className="text-sm text-rose-300">Could not load analytics: {error instanceof Error ? error.message : String(error)}</p>}
      {isLoading && <p className="text-sm text-slate-400">{tr("Loading…")}</p>}

      {data && (
        <>
          <MetricGrid columns={4}>
            <Metric
              label={tr("This month")}
              value={money(g!.thisMonthMinor)}
              hint={
                g!.changePercent === null
                  ? sw ? "Hakuna mapato mwezi uliopita ya kulinganisha" : "No revenue last month to compare with"
                  : `${g!.changePercent >= 0 ? "+" : ""}${g!.changePercent}% ${sw ? "ukilinganisha na mwezi uliopita" : "on last month"} (${money(g!.lastMonthMinor)})`
              }
              tone={g!.changePercent === null ? undefined : g!.changePercent >= 0 ? "good" : "bad"}
            />
            <Metric label={sw ? `Mapato, miezi ${months}` : `Revenue, ${months} months`} value={money(totalRevenue)} hint={sw ? `Wateja wapya ${newCustomers}` : `${newCustomers} new customer${newCustomers === 1 ? "" : "s"}`} />
            <Metric
              label={tr("Average per subscriber")}
              value={data.subscribers.arpuMinor === null ? "—" : money(data.subscribers.arpuMinor)}
              hint={sw ? `Siku 30 zilizopita · ${data.subscribers.active} hai` : `Last 30 days · ${data.subscribers.active} active`}
            />
            <Metric
              label={tr("Suspended")}
              value={data.subscribers.suspended}
              hint={tr("Subscriptions off for non-payment")}
              tone={data.subscribers.suspended > 0 ? "warn" : "good"}
              href="/customers"
            />
          </MetricGrid>

          <Panel title={tr("Revenue by month")} description={tr("Completed payments, in your timezone")}>
            {totalRevenue === 0 ? (
              <EmptyState title={tr("No payments in this period")}>{tr("Revenue will be charted here as payments come in.")}</EmptyState>
            ) : (
              <>
                <TrendChart points={data.months.map((m) => ({ date: monthLabel(m.month), value: m.revenueMinor }))} format={compactMoney} caption={tr("Revenue per month")} />
                <ChartTable
                  columns={["Month", "Revenue", "Payments", "New customers"]}
                  rows={data.months.map((m) => [monthLabel(m.month), money(m.revenueMinor), m.payments, m.newCustomers])}
                />
              </>
            )}
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title={tr("What sells")} description={
                sw
                  ? branch ? `Mapato ya usajili kwa kifurushi, miezi ${months} iliyopita. Mauzo ya hotspot hayana tawi.` : `Mapato kwa kifurushi, miezi ${months} iliyopita`
                  : branch ? `Subscription revenue by package, last ${months} months. Hotspot sales have no branch.` : `Revenue by package, last ${months} months`
              }>
              {data.byPackage.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">{tr("No package sales in this period.")}</p>
              ) : (
                <BarList
                  items={data.byPackage.map((p) => ({
                    label: p.name,
                    value: p.revenueMinor,
                    detail: sw
                      ? `${p.kind === "HOTSPOT" ? "Hotspot" : "Usajili"} · mauzo ${p.sales}`
                      : `${p.kind === "HOTSPOT" ? "Hotspot" : "Subscription"} · ${p.sales} sale${p.sales === 1 ? "" : "s"}`,
                  }))}
                  format={money}
                />
              )}
            </Panel>

            <Panel
              title={tr("When customers pay")}
              description={
                busiest && busiest.payments > 0
                  ? `${sw ? "Saa yenye malipo mengi" : "Busiest hour"}: ${String(busiest.hour).padStart(2, "0")}:00, ${sw ? "siku 90 zilizopita" : "last 90 days"}`
                  : sw ? "Malipo kwa saa, siku 90 zilizopita" : "Payments by hour, last 90 days"
              }
            >
              <HourColumns hours={data.byHour} />
              <div className="mt-5">
                <BarList
                  items={data.byWeekday.map((w) => ({ label: tr(WEEKDAYS[w.weekday]!), value: w.payments }))}
                  format={(n) => (sw ? `malipo ${n}` : `${n} payment${n === 1 ? "" : "s"}`)}
                />
              </div>
              <ChartTable columns={["Hour", "Payments"]} rows={data.byHour.map((h) => [`${String(h.hour).padStart(2, "0")}:00`, h.payments])} />
            </Panel>
          </div>

          <Panel title={tr("Customers at risk")} description={tr("Suspended, overdue, or a paying customer who has gone quiet. Call them before they leave.")} padded={false}>
            {data.atRisk.length === 0 ? (
              <EmptyState title={tr("Nobody at risk right now")}>{tr("Every active customer is paid up and paying regularly.")}</EmptyState>
            ) : (
              <TableShell minWidth={640}>
                <thead>
                  <tr>
                    <th className={th}>{tr("Customer")}</th>
                    <th className={th}>{tr("Why")}</th>
                    <th className={th}>{tr("Since")}</th>
                    <th className={`${th} text-right`}>{tr("Owed")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.atRisk.map((c) => (
                    <tr key={c.customerId}>
                      <td className={td}>
                        <Link href={`/customers/${c.customerId}`} className="font-medium text-white hover:underline">
                          {c.fullName}
                        </Link>
                        <span className="block text-xs text-slate-500">{c.phone}</span>
                      </td>
                      <td className={td}>
                        <Pill tone={c.reason.startsWith("Suspended") ? "bad" : c.reason.startsWith("Invoice") ? "warn" : "neutral"}>{tr(c.reason)}</Pill>
                      </td>
                      <td className={`${td} text-slate-400`}>{c.since ? new Date(c.since).toLocaleDateString() : "—"}</td>
                      <td className={`${td} text-right tabular-nums text-white`}>{c.owedMinor > 0 ? money(c.owedMinor) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
