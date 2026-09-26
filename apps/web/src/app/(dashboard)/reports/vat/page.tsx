"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { downloadFromApi } from "@/lib/download";
import { formatMoney } from "@/lib/money";
import { tr } from "@/lib/tr";
import { Input, Label } from "@/components/ui";
import { EmptyState, Metric, MetricGrid, Notice, PageHeader, Panel, TableShell, darkButton, td, th } from "@/components/dashboard/surface";

/**
 * The month's sales and VAT, ready for the KRA return: invoiced subscriptions with their own tax,
 * plus hotspot sales whose prices include VAT. Exports a CSV laid out like the iTax sales sheet.
 */

interface VatReport {
  month: string;
  currency: string;
  vatRegistered: boolean;
  kraPin: string;
  standardRatePercent: number;
  invoiced: { count: number; taxableMinor: number; vatMinor: number; grossMinor: number; byRate: { ratePercent: number; count: number; taxableMinor: number; vatMinor: number }[] };
  otherSales: { count: number; netMinor: number; vatMinor: number; grossMinor: number };
  total: { netMinor: number; vatMinor: number; grossMinor: number };
  zeroRatedInvoices: number;
  lines: { invoiceNumber: string; issuedAt: string; customerName: string; taxableMinor: number; vatMinor: number; totalMinor: number; ratePercent: number }[];
}

interface Preferences {
  tax: { vatRegistered: boolean; kraPin: string; vatRatePercent: number };
  [key: string]: unknown;
}

function lastMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function VatReportPage() {
  const { user } = useAuth();
  const canManage = user?.permissions.includes("settings.manage") ?? false;
  const [month, setMonth] = useState(lastMonth());
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ["vat", month], queryFn: () => apiFetch<VatReport>(`/api/v1/reports/vat?month=${month}`), enabled: /^\d{4}-\d{2}$/.test(month) });
  const money = (minor: number) => formatMoney(minor, data?.currency ?? "KES");

  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHeader
        title={tr("VAT report")}
        description={tr("Sales and VAT for one month, in your timezone, for the KRA VAT return.")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="month"
              aria-label={tr("Month")}
              value={month}
              max={new Date().toISOString().slice(0, 7)}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg border border-obsidian-700 bg-obsidian-950 px-2.5 py-1.5 text-sm text-slate-100"
            />
            <button
              type="button"
              className={darkButton("secondary")}
              onClick={() => {
                setDownloadError(null);
                downloadFromApi(`/api/v1/reports/vat.csv?month=${month}`, `vat-${month}.csv`).catch((e: Error) => setDownloadError(e.message));
              }}
            >
              {tr("Export CSV")}
            </button>
          </div>
        }
      />

      {downloadError && <Notice tone="bad">{downloadError}</Notice>}
      {error && <Notice tone="bad">{error instanceof Error ? error.message : String(error)}</Notice>}
      {data && !data.vatRegistered && (
        <Notice tone="warn">{tr("You are not marked as VAT-registered, so hotspot sales show no VAT. Set your VAT details below if you are registered.")}</Notice>
      )}
      {data && data.zeroRatedInvoices > 0 && (
        <Notice tone="warn">
          {data.zeroRatedInvoices} {tr("invoices this month carry no VAT. Set a tax rate on your internet plans so new invoices include it.")}
        </Notice>
      )}
      {isLoading && <p className="text-sm text-slate-400">{tr("Loading…")}</p>}

      {data && (
        <>
          <MetricGrid columns={3}>
            <Metric label={tr("Sales before VAT")} value={money(data.total.netMinor)} hint={`${data.invoiced.count + data.otherSales.count} ${tr("sales")}`} />
            <Metric label={tr("Output VAT")} value={money(data.total.vatMinor)} hint={data.kraPin ? `KRA PIN ${data.kraPin}` : tr("KRA PIN not set")} />
            <Metric label={tr("Sales including VAT")} value={money(data.total.grossMinor)} />
          </MetricGrid>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title={tr("Invoiced subscriptions")} description={`${data.invoiced.count} ${tr("invoices issued this month")}`}>
              {data.invoiced.byRate.length === 0 ? (
                <p className="text-sm text-slate-400">{tr("No invoices this month.")}</p>
              ) : (
                <dl className="space-y-2 text-sm">
                  {data.invoiced.byRate.map((r) => (
                    <div key={r.ratePercent} className="flex justify-between gap-3">
                      <dt className="text-slate-300">
                        {r.ratePercent}% · {r.count} {tr("invoices")}
                      </dt>
                      <dd className="tabular-nums text-white">
                        {money(r.taxableMinor)} + {money(r.vatMinor)} {tr("VAT")}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </Panel>
            <Panel title={tr("Hotspot and voucher sales")} description={tr("No invoice; prices include VAT at your standard rate.")}>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-300">
                    {data.otherSales.count} {tr("sales")}
                  </dt>
                  <dd className="tabular-nums text-white">{money(data.otherSales.grossMinor)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-300">
                    {tr("VAT inside")} ({data.vatRegistered ? data.standardRatePercent : 0}%)
                  </dt>
                  <dd className="tabular-nums text-white">{money(data.otherSales.vatMinor)}</dd>
                </div>
              </dl>
            </Panel>
          </div>

          <Panel title={tr("Invoices")} padded={false}>
            {data.lines.length === 0 ? (
              <EmptyState title={tr("No invoices this month")} />
            ) : (
              <TableShell minWidth={720}>
                <thead>
                  <tr>
                    <th className={th}>{tr("Date")}</th>
                    <th className={th}>{tr("Invoice")}</th>
                    <th className={th}>{tr("Customer")}</th>
                    <th className={`${th} text-right`}>{tr("Before VAT")}</th>
                    <th className={`${th} text-right`}>{tr("VAT")}</th>
                    <th className={`${th} text-right`}>{tr("Total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((l) => (
                    <tr key={l.invoiceNumber}>
                      <td className={`${td} text-slate-400`}>{new Date(l.issuedAt).toLocaleDateString()}</td>
                      <td className={`${td} font-mono`}>{l.invoiceNumber}</td>
                      <td className={td}>{l.customerName}</td>
                      <td className={`${td} text-right tabular-nums`}>{money(l.taxableMinor)}</td>
                      <td className={`${td} text-right tabular-nums`}>
                        {money(l.vatMinor)} <span className="text-xs text-slate-500">({l.ratePercent}%)</span>
                      </td>
                      <td className={`${td} text-right tabular-nums text-white`}>{money(l.totalMinor)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            )}
          </Panel>
        </>
      )}

      {canManage && <VatSettings />}
    </div>
  );
}

function VatSettings() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["preferences"], queryFn: () => apiFetch<Preferences>("/api/v1/settings/preferences") });
  const [form, setForm] = useState<Preferences["tax"] | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (data && !form) setForm(data.tax);
  }, [data, form]);
  const save = useMutation({
    mutationFn: () => apiFetch("/api/v1/settings/preferences", { method: "PUT", body: JSON.stringify({ ...data, tax: { ...form, kraPin: form!.kraPin.trim().toUpperCase() } }) }),
    onSuccess: () => {
      setSaved(true);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["preferences"] });
      queryClient.invalidateQueries({ queryKey: ["vat"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : tr("Something went wrong.")),
  });
  if (!form) return null;
  return (
    <Panel title={tr("VAT details")}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(false);
          save.mutate();
        }}
      >
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.vatRegistered} onChange={(e) => setForm({ ...form, vatRegistered: e.target.checked })} />
          {tr("We are registered for VAT")}
        </label>
        <div className="grid max-w-lg gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="kraPin">{tr("KRA PIN")}</Label>
            <Input id="kraPin" value={form.kraPin} onChange={(e) => setForm({ ...form, kraPin: e.target.value })} placeholder="P051234567X" maxLength={11} />
          </div>
          <div>
            <Label htmlFor="vatRate">{tr("Standard VAT rate (%)")}</Label>
            <Input id="vatRate" type="number" min={0} max={30} value={form.vatRatePercent} onChange={(e) => setForm({ ...form, vatRatePercent: Number(e.target.value) })} />
          </div>
        </div>
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="flex items-center gap-3">
          <button type="submit" className={darkButton("primary")} disabled={save.isPending}>
            {save.isPending ? tr("Saving…") : tr("Save")}
          </button>
          {saved && <span className="text-sm text-emerald-400">{tr("Saved")}</span>}
        </div>
      </form>
    </Panel>
  );
}
