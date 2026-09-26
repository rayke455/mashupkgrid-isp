"use client";

import { IconDownload, IconPrinter } from "@/components/icons";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Card, Input, Badge, Button } from "@/components/ui";
import { StampedReceiptModal } from "@/components/reports/stamped-receipt-modal";
import { downloadCsv, generateRevenueCsv, generateClientsCsv } from "@/lib/export-csv";
import { tr } from "@/lib/tr";

// ---------------------------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------------------------

interface RevenueRecordItem {
  id: string;
  receiptNumber: string;
  paidAt: string;
  stampedDate: string;
  customerId: string | null;
  customerName: string;
  customerNumber: string;
  customerPhone: string;
  serviceOrPurpose: string;
  method: string;
  reference: string;
  amountMinor: number;
  currency: string;
  status: string;
}

interface ComprehensiveRevenueReport {
  tenant: {
    id: string;
    name: string;
    currency: string;
    timezone: string;
    logoUrl: string | null;
    brandColor: string | null;
  };
  period: string;
  periodLabel: string;
  dateRange: {
    from: string;
    to: string;
  };
  stampedAt: string;
  stampHash: string;
  certifiedBy: string;
  summary: {
    totalRevenueMinor: number;
    paymentCount: number;
    uniqueClientsCount: number;
    averageSpendMinor: number;
    byMethod: Record<string, { count: number; totalMinor: number }>;
    byDay: Array<{ date: string; totalMinor: number; paymentCount: number }>;
  };
  records: RevenueRecordItem[];
}

interface ClientTrackItem {
  id: string;
  customerNumber: string;
  fullName: string;
  phone: string;
  email: string | null;
  status: string;
  address: string | null;
  joinedAt: string;
  joinedDateFormatted: string;
  totalSpendMinor: number;
  paymentCount: number;
  lastPaymentDate: string | null;
  lastPaymentDateFormatted: string | null;
  latestReceiptNumber: string | null;
  latestPaymentId: string | null;
  activePackages: string;
  walletBalanceMinor: number;
}

interface ComprehensiveClientsReport {
  tenant: {
    id: string;
    name: string;
    currency: string;
    timezone: string;
  };
  stampedAt: string;
  stampHash: string;
  summary: {
    totalClients: number;
    activeClients: number;
    totalSpendAllClientsMinor: number;
    averageSpendPerClientMinor: number;
  };
  clients: ClientTrackItem[];
}

interface BandwidthByDay {
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

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<"revenue" | "clients" | "bandwidth">("revenue");

  // Revenue Filters
  const [revenuePeriod, setRevenuePeriod] = useState<"day" | "week" | "month" | "custom">("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [searchTxn, setSearchTxn] = useState("");

  // Clients Tracker Filters
  const [joinedPeriod, setJoinedPeriod] = useState<"all" | "today" | "this_week" | "this_month">("all");
  const [searchClient, setSearchClient] = useState("");

  // Bandwidth Filters
  const [bandwidthDays, setBandwidthDays] = useState<7 | 14 | 30>(30);
  const [searchSubscriber, setSearchSubscriber] = useState("");

  // Stamped Receipt Modal State
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);

  // 1. Revenue Query
  const revenueQueryParam = (() => {
    if (revenuePeriod === "custom" && customStart && customEnd) {
      return `period=custom&startDate=${customStart}&endDate=${customEnd}`;
    }
    return `period=${revenuePeriod}`;
  })();

  const { data: revData, isLoading: revLoading } = useQuery({
    queryKey: ["report-revenue-comprehensive", revenueQueryParam],
    queryFn: () => apiFetch<ComprehensiveRevenueReport>(`/api/v1/reports/revenue/comprehensive?${revenueQueryParam}`),
    enabled: activeTab === "revenue",
  });

  // 2. Clients Query
  const { data: clientsData, isLoading: clientsLoading } = useQuery({
    queryKey: ["report-clients-tracking", joinedPeriod, searchClient],
    queryFn: () =>
      apiFetch<ComprehensiveClientsReport>(
        `/api/v1/reports/clients?joinedPeriod=${joinedPeriod}${searchClient ? `&search=${encodeURIComponent(searchClient)}` : ""}`
      ),
    enabled: activeTab === "clients",
  });

  // 3. Bandwidth Queries
  const { data: bwDays, isLoading: bwDaysLoading } = useQuery({
    queryKey: ["report-bandwidth", bandwidthDays],
    queryFn: () => apiFetch<BandwidthByDay[]>(`/api/v1/reports/bandwidth?days=${bandwidthDays}`),
    enabled: activeTab === "bandwidth",
  });

  const { data: topConsumers, isLoading: topLoading } = useQuery({
    queryKey: ["report-bandwidth-top", bandwidthDays],
    queryFn: () => apiFetch<TopConsumer[]>(`/api/v1/reports/bandwidth/top-consumers?days=${bandwidthDays}`),
    enabled: activeTab === "bandwidth",
  });

  // Bandwidth metrics calculation
  const totalUpload = bwDays?.reduce((sum, d) => sum + d.uploadBytes, 0) ?? 0;
  const totalDownload = bwDays?.reduce((sum, d) => sum + d.downloadBytes, 0) ?? 0;
  const totalBytes = totalUpload + totalDownload;
  const totalSessions = bwDays?.reduce((sum, d) => sum + d.sessionCount, 0) ?? 0;
  const maxDayTotal = Math.max(1, ...(bwDays?.map((d) => d.uploadBytes + d.downloadBytes) ?? [0]));

  const filteredConsumers =
    topConsumers?.filter((c) => c.username.toLowerCase().includes(searchSubscriber.toLowerCase())) ?? [];

  // Filtered transactions in Revenue tab
  const filteredRecords =
    revData?.records.filter(
      (r) =>
        r.customerName.toLowerCase().includes(searchTxn.toLowerCase()) ||
        r.receiptNumber.toLowerCase().includes(searchTxn.toLowerCase()) ||
        r.reference.toLowerCase().includes(searchTxn.toLowerCase()) ||
        r.customerPhone.includes(searchTxn)
    ) ?? [];

  // Export Handlers
  const handleExportRevenueCsv = () => {
    if (!revData) return;
    const csv = generateRevenueCsv({
      tenantName: revData.tenant.name,
      periodLabel: revData.periodLabel,
      stampedAt: revData.stampedAt,
      stampHash: revData.stampHash,
      totalRevenueKes: (revData.summary.totalRevenueMinor / 100).toLocaleString("en-KE", {
        minimumFractionDigits: 2,
      }),
      paymentCount: revData.summary.paymentCount,
      uniqueClientsCount: revData.summary.uniqueClientsCount,
      averageSpendKes: (revData.summary.averageSpendMinor / 100).toLocaleString("en-KE", {
        minimumFractionDigits: 2,
      }),
      records: revData.records.map((r) => ({
        receiptNumber: r.receiptNumber,
        stampedDate: r.stampedDate,
        customerName: r.customerName,
        customerNumber: r.customerNumber,
        customerPhone: r.customerPhone,
        serviceOrPurpose: r.serviceOrPurpose,
        method: r.method,
        reference: r.reference,
        amountKes: (r.amountMinor / 100).toFixed(2),
        status: r.status,
      })),
    });
    downloadCsv(`Revenue_Report_${revData.period}_${Date.now()}.csv`, csv);
  };

  const handleExportClientsCsv = () => {
    if (!clientsData) return;
    const csv = generateClientsCsv({
      tenantName: clientsData.tenant.name,
      stampedAt: clientsData.stampedAt,
      stampHash: clientsData.stampHash,
      totalClients: clientsData.summary.totalClients,
      activeClients: clientsData.summary.activeClients,
      totalSpendKes: (clientsData.summary.totalSpendAllClientsMinor / 100).toLocaleString("en-KE", {
        minimumFractionDigits: 2,
      }),
      averageSpendKes: (clientsData.summary.averageSpendPerClientMinor / 100).toLocaleString("en-KE", {
        minimumFractionDigits: 2,
      }),
      clients: clientsData.clients.map((c) => ({
        customerNumber: c.customerNumber,
        fullName: c.fullName,
        phone: c.phone,
        email: c.email,
        status: c.status,
        joinedDateFormatted: c.joinedDateFormatted,
        totalSpendKes: (c.totalSpendMinor / 100).toFixed(2),
        paymentCount: c.paymentCount,
        activePackages: c.activePackages,
        latestReceiptNumber: c.latestReceiptNumber,
        lastPaymentDateFormatted: c.lastPaymentDateFormatted,
      })),
    });
    downloadCsv(`Clients_Tracker_Report_${Date.now()}.csv`, csv);
  };

  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <div className="space-y-6 text-left font-sans print:p-0">
      {/* Page Header (Hidden on Print) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            {tr("Reports")}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {tr("Revenue, customer spending and bandwidth, with receipts and exports.")}
          </p>
        </div>
        {/* Tab Navigation */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-obsidian-900 p-1.5 rounded-xl border border-slate-200 dark:border-obsidian-800 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab("revenue")}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === "revenue"
                ? "bg-brand-600 text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            {tr("Revenue & Financials")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("clients")}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === "clients"
                ? "bg-brand-600 text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            {tr("Clients & Spends")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("bandwidth")}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === "bandwidth"
                ? "bg-brand-600 text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            {tr("Bandwidth Usage")}
          </button>
        </div>
      </div>
      {/* ========================================================================= */}
      {/* TAB 1: REVENUE & FINANCIALS */}
      {/* ========================================================================= */}
      {activeTab === "revenue" && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-obsidian-800 shadow-sm print:hidden">
            {/* Period Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mr-1">{tr("Period:")}</span>
              <button
                type="button"
                onClick={() => setRevenuePeriod("day")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  revenuePeriod === "day"
                    ? "bg-brand-600 text-white shadow-sm"
                    : "bg-slate-100 dark:bg-obsidian-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                }`}
              >
                {tr("Today (Day)")}
              </button>
              <button
                type="button"
                onClick={() => setRevenuePeriod("week")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  revenuePeriod === "week"
                    ? "bg-brand-600 text-white shadow-sm"
                    : "bg-slate-100 dark:bg-obsidian-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                }`}
              >
                {tr("This Week")}
              </button>
              <button
                type="button"
                onClick={() => setRevenuePeriod("month")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  revenuePeriod === "month"
                    ? "bg-brand-600 text-white shadow-sm"
                    : "bg-slate-100 dark:bg-obsidian-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                }`}
              >
                {tr("This Month")}
              </button>
              <button
                type="button"
                onClick={() => setRevenuePeriod("custom")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  revenuePeriod === "custom"
                    ? "bg-brand-600 text-white shadow-sm"
                    : "bg-slate-100 dark:bg-obsidian-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                }`}
              >
                {tr("Custom Range")}
              </button>
              {revenuePeriod === "custom" && (
                <div className="flex items-center gap-1.5 ml-2">
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-obsidian-800 bg-white dark:bg-obsidian-950 text-slate-900 dark:text-white"
                  />
                  <span className="text-slate-400 text-xs">{tr("to")}</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-obsidian-800 bg-white dark:bg-obsidian-950 text-slate-900 dark:text-white"
                  />
                </div>
              )}
            </div>
            {/* Action Buttons: Export CSV & Print PDF */}
            <div className="flex items-center gap-2.5">
              <Button
                size="sm"
                onClick={handleExportRevenueCsv}
                disabled={revLoading || !revData}
                className="gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg"
              >
                <IconDownload size={16} />
                {tr("Export CSV")}
              </Button>
              <Button
                size="sm"
                onClick={handlePrintPdf}
                disabled={revLoading || !revData}
                className="gap-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm shadow-brand-600/20"
              >
                <IconPrinter size={16} />
                {tr("Print / PDF Report")}
              </Button>
            </div>
          </div>
          {/* Stamped Banner (Visible in UI & Printed PDF) */}
          {revData && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-brand-500/30 bg-brand-50/20 dark:bg-brand-950/20 text-xs">
              <div className="flex items-center gap-2.5">
                <span className="flex h-3 w-3 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {revData.tenant.name} — {revData.periodLabel}
                  </p>
                  <p className="text-slate-500 dark:text-slate-400">
                    Revenue report · Prepared by {revData.certifiedBy}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                    Stamped: {revData.stampedAt}
                  </p>
                  <p className="font-mono text-[10px] text-slate-400">
                    Reference: {revData.stampHash}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 4 Revenue Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-5 space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{tr("Total Revenue")}</span>
              <div className="text-2xl font-semibold tabular-nums text-white">
                {revLoading
                  ? "..."
                  : `KES ${(revData?.summary.totalRevenueMinor ?? 0 / 100).toLocaleString("en-KE", {
                      minimumFractionDigits: 2,
                    })}`}
              </div>
              <span className="text-[11px] text-slate-400">{tr("Gross completed payments")}</span>
            </Card>
            <Card className="p-5 space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{tr("Transactions")}</span>
              <div className="text-2xl font-bold tabular-nums text-white">
                {revLoading ? "..." : revData?.summary.paymentCount ?? 0}
              </div>
              <span className="text-[11px] text-slate-400">{tr("Receipts generated")}</span>
            </Card>
            <Card className="p-5 space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{tr("Paying Clients")}</span>
              <div className="text-2xl font-semibold tabular-nums text-white">
                {revLoading ? "..." : revData?.summary.uniqueClientsCount ?? 0}
              </div>
              <span className="text-[11px] text-slate-400">{tr("Unique subscribers & guests")}</span>
            </Card>
            <Card className="p-5 space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{tr("Avg Spend / Client")}</span>
              <div className="text-2xl font-semibold tabular-nums text-white">
                {revLoading
                  ? "..."
                  : `KES ${(revData?.summary.averageSpendMinor ?? 0 / 100).toLocaleString("en-KE", {
                      minimumFractionDigits: 2,
                    })}`}
              </div>
              <span className="text-[11px] text-slate-400">{tr("Average spend in period")}</span>
            </Card>
          </div>
          {/* Payment Methods Breakdown */}
          {revData && Object.keys(revData.summary.byMethod).length > 0 && (
            <Card className="p-5 border-slate-200 dark:border-obsidian-800 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {tr("Revenue Breakdown by Payment Channel")}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(revData.summary.byMethod).map(([method, info]) => (
                  <div
                    key={method}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-obsidian-950 border border-slate-200/60 dark:border-obsidian-800 space-y-1"
                  >
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {method.replace("_", " ")}
                    </p>
                    <p className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                      KES {(info.totalMinor / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] text-slate-400">{info.count} payment{info.count === 1 ? "" : "s"}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Itemized Transactions Table */}
          <Card className="p-6 border-slate-200 dark:border-obsidian-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-obsidian-800">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  {tr("Transactions & Stamped Receipts")}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {tr("Detailed payment records with receipt numbers, client details, and M-Pesa references.")}
                </p>
              </div>
              <div className="w-full sm:w-72 print:hidden">
                <Input
                  placeholder={tr("Search receipt, client or M-Pesa ref...")}
                  value={searchTxn}
                  onChange={(e) => setSearchTxn(e.target.value)}
                  className="text-xs py-1.5"
                />
              </div>
            </div>
            {revLoading && <p className="text-xs text-slate-400 py-6 text-center">{tr("Loading transactions ledger...")}</p>}

            {filteredRecords.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-obsidian-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-obsidian-950/80 text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider font-semibold border-b border-slate-200 dark:border-obsidian-800">
                    <tr>
                      <th className="px-4 py-3">{tr("Receipt #")}</th>
                      <th className="px-4 py-3">{tr("Client")}</th>
                      <th className="px-4 py-3">{tr("Date & Time")}</th>
                      <th className="px-4 py-3">{tr("Service / Description")}</th>
                      <th className="px-4 py-3">{tr("Method & Ref")}</th>
                      <th className="px-4 py-3 text-right">{tr("Amount (KES)")}</th>
                      <th className="px-4 py-3 text-center print:hidden">{tr("Action")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-obsidian-800">
                    {filteredRecords.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-obsidian-950/40 transition-colors">
                        <td className="px-4 py-3 font-mono font-semibold text-brand-600 dark:text-brand-400">
                          {r.receiptNumber}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900 dark:text-white">{r.customerName}</p>
                          <p className="text-[11px] text-slate-400">
                            {r.customerNumber !== "GUEST" ? `#${r.customerNumber} · ` : ""}
                            {r.customerPhone}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.stampedDate}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300 max-w-xs truncate">
                          {r.serviceOrPurpose}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {r.method.replace("_", " ")}
                          </span>
                          <p className="font-mono text-[10px] text-slate-400">{r.reference}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                          KES {(r.amountMinor / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-center print:hidden">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setSelectedPaymentId(r.id)}
                            className="text-[11px] py-1 px-2.5 rounded-lg border-slate-200 dark:border-obsidian-700 hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-950/30"
                          >
                            {tr("Receipt")}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {filteredRecords.length === 0 && !revLoading && (
              <div className="py-12 text-center text-xs text-slate-500">
                {tr("No revenue records found for this period or search criteria.")}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: CLIENTS & SPENDING TRACKER */}
      {/* ========================================================================= */}
      {activeTab === "clients" && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-obsidian-800 shadow-sm print:hidden">
            {/* Joined Filter */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mr-1">{tr("Joined:")}</span>
              <button
                type="button"
                onClick={() => setJoinedPeriod("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  joinedPeriod === "all"
                    ? "bg-brand-600 text-white shadow-sm"
                    : "bg-slate-100 dark:bg-obsidian-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                }`}
              >
                {tr("All Time")}
              </button>
              <button
                type="button"
                onClick={() => setJoinedPeriod("today")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  joinedPeriod === "today"
                    ? "bg-brand-600 text-white shadow-sm"
                    : "bg-slate-100 dark:bg-obsidian-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                }`}
              >
                {tr("Joined Today")}
              </button>
              <button
                type="button"
                onClick={() => setJoinedPeriod("this_week")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  joinedPeriod === "this_week"
                    ? "bg-brand-600 text-white shadow-sm"
                    : "bg-slate-100 dark:bg-obsidian-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                }`}
              >
                {tr("Joined This Week")}
              </button>
              <button
                type="button"
                onClick={() => setJoinedPeriod("this_month")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  joinedPeriod === "this_month"
                    ? "bg-brand-600 text-white shadow-sm"
                    : "bg-slate-100 dark:bg-obsidian-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                }`}
              >
                {tr("Joined This Month")}
              </button>
            </div>
            {/* Actions: Export Clients CSV */}
            <div className="flex items-center gap-2.5">
              <Button
                size="sm"
                onClick={handleExportClientsCsv}
                disabled={clientsLoading || !clientsData}
                className="gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg"
              >
                <IconDownload size={16} />
                {tr("Export Clients CSV")}
              </Button>
              <Button
                size="sm"
                onClick={handlePrintPdf}
                disabled={clientsLoading || !clientsData}
                className="gap-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm shadow-brand-600/20"
              >
                <IconPrinter size={16} />
                {tr("Print / Save PDF")}
              </Button>
            </div>
          </div>
          {/* 4 Clients KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-5 space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{tr("Total Clients")}</span>
              <div className="text-2xl font-bold tabular-nums text-white">
                {clientsLoading ? "..." : clientsData?.summary.totalClients ?? 0}
              </div>
              <span className="text-[11px] text-slate-400">{tr("Subscribers in view")}</span>
            </Card>
            <Card className="p-5 space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{tr("Active Subscribers")}</span>
              <div className="text-2xl font-semibold tabular-nums text-white">
                {clientsLoading ? "..." : clientsData?.summary.activeClients ?? 0}
              </div>
              <span className="text-[11px] text-slate-400">{tr("Active internet access")}</span>
            </Card>
            <Card className="p-5 space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{tr("Total Client Spend")}</span>
              <div className="text-2xl font-semibold tabular-nums text-white">
                {clientsLoading
                  ? "..."
                  : `KES ${(clientsData?.summary.totalSpendAllClientsMinor ?? 0 / 100).toLocaleString("en-KE", {
                      minimumFractionDigits: 2,
                    })}`}
              </div>
              <span className="text-[11px] text-slate-400">{tr("Cumulative customer LTV")}</span>
            </Card>
            <Card className="p-5 space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{tr("Average Spend / User")}</span>
              <div className="text-2xl font-semibold tabular-nums text-white">
                {clientsLoading
                  ? "..."
                  : `KES ${(clientsData?.summary.averageSpendPerClientMinor ?? 0 / 100).toLocaleString("en-KE", {
                      minimumFractionDigits: 2,
                    })}`}
              </div>
              <span className="text-[11px] text-slate-400">{tr("Average lifetime spend")}</span>
            </Card>
          </div>
          {/* Clients List & Spends Table */}
          <Card className="p-6 border-slate-200 dark:border-obsidian-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-obsidian-800">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  {tr("Client Directory & Spend History")}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {tr("Track when subscribers joined, their lifetime spending, and view receipts.")}
                </p>
              </div>
              <div className="w-full sm:w-72 print:hidden">
                <Input
                  placeholder={tr("Search client name, phone or #...")}
                  value={searchClient}
                  onChange={(e) => setSearchClient(e.target.value)}
                  className="text-xs py-1.5"
                />
              </div>
            </div>
            {clientsLoading && <p className="text-xs text-slate-400 py-6 text-center">{tr("Loading client tracker...")}</p>}

            {clientsData && clientsData.clients.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-obsidian-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-obsidian-950/80 text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider font-semibold border-b border-slate-200 dark:border-obsidian-800">
                    <tr>
                      <th className="px-4 py-3">{tr("Client Name")}</th>
                      <th className="px-4 py-3">{tr("Joined When")}</th>
                      <th className="px-4 py-3">{tr("Active Services")}</th>
                      <th className="px-4 py-3 text-right">{tr("Total Spends (KES)")}</th>
                      <th className="px-4 py-3 text-center">{tr("Payments")}</th>
                      <th className="px-4 py-3">{tr("Latest Receipt")}</th>
                      <th className="px-4 py-3 text-center print:hidden">{tr("Action")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-obsidian-800">
                    {clientsData.clients.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-obsidian-950/40 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-700 dark:bg-obsidian-800 dark:text-slate-300">
                              {c.fullName.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                                {c.fullName}
                                <Badge variant={c.status === "ACTIVE" ? "success" : "neutral"} className="text-[9px] py-0 px-1.5">
                                  {c.status}
                                </Badge>
                              </p>
                              <p className="text-[11px] text-slate-400">
                                #{c.customerNumber} · {c.phone}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {c.joinedDateFormatted}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400 max-w-xs truncate">
                          {c.activePackages}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">
                          KES {(c.totalSpendMinor / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-slate-600 dark:text-slate-300">
                          {c.paymentCount}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400">
                          {c.latestReceiptNumber ? (
                            <span className="text-brand-600 dark:text-brand-400 font-medium">
                              {c.latestReceiptNumber}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">{tr("None yet")}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center print:hidden">
                          {c.latestPaymentId ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setSelectedPaymentId(c.latestPaymentId)}
                              className="text-[11px] py-1 px-2.5 rounded-lg border-slate-200 dark:border-obsidian-700 hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-950/30"
                            >
                              {tr("Receipt")}
                            </Button>
                          ) : (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {clientsData && clientsData.clients.length === 0 && !clientsLoading && (
              <div className="py-12 text-center text-xs text-slate-500">
                {tr("No clients found matching the selected timeframe or search criteria.")}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: BANDWIDTH USAGE (RADIUS) */}
      {/* ========================================================================= */}
      {activeTab === "bandwidth" && (
        <div className="space-y-6">
          {/* Header Controls */}
          <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-obsidian-800 shadow-sm print:hidden">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{tr("RADIUS Data Accounting")}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{tr("Bandwidth telemetry recorded across your routers.")}</p>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-obsidian-800 p-1 rounded-xl text-xs font-medium">
              <button
                type="button"
                onClick={() => setBandwidthDays(7)}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  bandwidthDays === 7 ? "bg-brand-600 text-white shadow-sm" : "text-slate-500 hover:text-white"
                }`}
              >
                {tr("Last 7 Days")}
              </button>
              <button
                type="button"
                onClick={() => setBandwidthDays(14)}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  bandwidthDays === 14 ? "bg-brand-600 text-white shadow-sm" : "text-slate-500 hover:text-white"
                }`}
              >
                {tr("Last 14 Days")}
              </button>
              <button
                type="button"
                onClick={() => setBandwidthDays(30)}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  bandwidthDays === 30 ? "bg-brand-600 text-white shadow-sm" : "text-slate-500 hover:text-white"
                }`}
              >
                {tr("Last 30 Days")}
              </button>
            </div>
          </div>
          {/* 4 KPI SUMMARY CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <Card className="p-4 space-y-1 bg-slate-900/60 border-slate-800">
              <span className="block text-sm text-slate-400">{tr("Total data")}</span>
              <div className="text-xl font-semibold tabular-nums text-white sm:text-2xl">{formatBytes(totalBytes)}</div>
              <span className="text-xs text-slate-500">{tr("Download and upload")}</span>
            </Card>
            <Card className="p-4 space-y-1 bg-slate-900/60 border-slate-800">
              <span className="block text-sm text-slate-400">{tr("Downloaded")}</span>
              <div className="text-xl font-semibold tabular-nums text-white sm:text-2xl">{formatBytes(totalDownload)}</div>
              <span className="text-xs text-slate-500">
                {totalBytes > 0 ? `${Math.round((totalDownload / totalBytes) * 100)}% of total` : "0%"}
              </span>
            </Card>
            <Card className="p-4 space-y-1 bg-slate-900/60 border-slate-800">
              <span className="block text-sm text-slate-400">{tr("Uploaded")}</span>
              <div className="text-xl font-semibold tabular-nums text-white sm:text-2xl">{formatBytes(totalUpload)}</div>
              <span className="text-xs text-slate-500">
                {totalBytes > 0 ? `${Math.round((totalUpload / totalBytes) * 100)}% of total` : "0%"}
              </span>
            </Card>
            <Card className="p-4 space-y-1 bg-slate-900/60 border-slate-800">
              <span className="block text-sm text-slate-400">{tr("Sessions")}</span>
              <div className="text-xl font-semibold tabular-nums text-white sm:text-2xl">{totalSessions.toLocaleString()}</div>
              <span className="text-xs text-slate-500">{tr("Recorded by RADIUS")}</span>
            </Card>
          </div>
          {/* DAILY TRAFFIC HISTOGRAM */}
          <Card className="p-6 space-y-4 border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
              <div>
                <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">{tr("Data used per day")}</h2>
                <p className="text-xs text-slate-400">{tr("Download and upload across all your routers.")}</p>
              </div>
              <span className="text-xs text-slate-400">
                Average: {formatBytes(totalBytes / (bwDays?.length || 1))} / day
              </span>
            </div>
            {bwDaysLoading && <p className="text-xs text-slate-400 py-4">{tr("Loading daily telemetry...")}</p>}

            {bwDays && bwDays.length > 0 && (
              <div className="space-y-2.5 pt-2">
                {bwDays.map((day) => {
                  const total = day.uploadBytes + day.downloadBytes;
                  const widthPct = Math.max(3, (total / maxDayTotal) * 100);
                  const dlPct = total > 0 ? (day.downloadBytes / total) * 100 : 80;

                  return (
                    <div key={day.date} className="flex items-center gap-3 text-xs tabular-nums">
                      <span className="w-24 shrink-0 text-slate-400 text-[11px]">{day.date}</span>
                      <div className="h-4 flex-1 overflow-hidden rounded-md bg-slate-900 border border-slate-800 flex">
                        <div
                          className="h-full bg-brand-500"
                          style={{ width: `${widthPct * (dlPct / 100)}%` }}
                          title={`Download: ${formatBytes(day.downloadBytes)}`}
                        />
                        <div
                          className="h-full bg-brand-500"
                          style={{ width: `${widthPct * ((100 - dlPct) / 100)}%` }}
                          title={`Upload: ${formatBytes(day.uploadBytes)}`}
                        />
                      </div>
                      <span className="w-24 shrink-0 text-right text-slate-300">{formatBytes(total)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
          {/* TOP CONSUMERS TABLE */}
          <Card className="p-6 space-y-4 border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
              <div>
                <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Top users (last {bandwidthDays} days)
                </h2>
                <p className="text-xs text-slate-400">{tr("Subscribers who used the most data, PPPoE and hotspot.")}</p>
              </div>
              <div className="w-full sm:w-64">
                <Input
                  placeholder={tr("Search subscriber username...")}
                  value={searchSubscriber}
                  onChange={(e) => setSearchSubscriber(e.target.value)}
                  className="text-xs py-1.5"
                />
              </div>
            </div>
            {topLoading && <p className="text-xs text-slate-400 py-4">{tr("Querying top consumers...")}</p>}

            {filteredConsumers.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="px-4 py-3">{tr("Subscriber Username")}</th>
                      <th className="px-4 py-3">{tr("Download (Rx)")}</th>
                      <th className="px-4 py-3">{tr("Upload (Tx)")}</th>
                      <th className="px-4 py-3">{tr("Total Data")}</th>
                      <th className="px-4 py-3">{tr("Sessions")}</th>
                      <th className="px-4 py-3">{tr("FUP Status")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filteredConsumers.map((c) => (
                      <tr key={c.username} className="hover:bg-slate-900/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-white flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-emerald-400" />
                          <span>{c.username}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-300">{formatBytes(c.uploadBytes)}</td>
                        <td className="px-4 py-3 text-slate-300">{formatBytes(c.downloadBytes)}</td>
                        <td className="px-4 py-3 font-medium text-white">{formatBytes(c.totalBytes)}</td>
                        <td className="px-4 py-3 text-slate-400">{c.sessionCount}</td>
                        <td className="px-4 py-3">
                          <Badge variant={c.totalBytes > 50 * 1024 * 1024 * 1024 ? "warning" : "success"}>
                            {c.totalBytes > 50 * 1024 * 1024 * 1024 ? "Heavy User" : "Normal"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Stamped Receipt Modal */}
      {selectedPaymentId && (
        <StampedReceiptModal paymentId={selectedPaymentId} onClose={() => setSelectedPaymentId(null)} />
      )}
    </div>
  );
}
