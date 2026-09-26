"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";
import { EmptyState, Metric, MetricGrid, Modal, Notice, PageHeader, Panel, TableShell, darkButton, td, th } from "@/components/dashboard/surface";
import { tr } from "@/lib/tr";

/**
 * Money that arrived with nowhere to land. Each row is a completed payment with no invoice: an
 * M-Pesa paybill payment whose account number matched no customer, or a top-up nobody assigned.
 * The operator finds the right invoice and applies it; the invoice balance and service follow.
 */

interface UnmatchedPayment {
  id: string;
  amountMinor: number;
  currency: string;
  method: string;
  reference: string | null;
  createdAt: string;
  customer: { id: string; fullName: string; phone: string; customerNumber: string } | null;
}
interface InvoiceHit {
  id: string;
  invoiceNumber: string;
  status: string;
  totalMinor: number;
  amountPaidMinor: number;
  currency: string;
  dueDate: string;
  customer?: { fullName: string; phone: string } | null;
}

export default function ReconciliationPage() {
  const queryClient = useQueryClient();
  const [matching, setMatching] = useState<UnmatchedPayment | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["payments-unmatched"],
    queryFn: () => apiFetch<{ items: UnmatchedPayment[]; summary: { count: number; totalMinor: number } }>("/api/v1/payments/unmatched"),
    refetchInterval: 60_000,
  });

  const { data: invoices } = useQuery({
    queryKey: ["invoice-search", search, matching?.customer?.id],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "10", status: "PENDING" });
      if (search.trim()) params.set("search", search.trim());
      if (matching?.customer?.id) params.set("customerId", matching.customer.id);
      return apiFetch<{ items: InvoiceHit[] }>(`/api/v1/invoices?${params.toString()}`);
    },
    enabled: matching !== null,
  });

  const match = useMutation({
    mutationFn: ({ paymentId, invoiceId }: { paymentId: string; invoiceId: string }) =>
      apiFetch<{ invoice: InvoiceHit }>(`/api/v1/payments/${paymentId}/match`, { method: "POST", body: JSON.stringify({ invoiceId }) }),
    onSuccess: (res) => {
      setMatching(null);
      setDone(`Applied to ${res.invoice.invoiceNumber}. ${res.invoice.status === "PAID" ? "Invoice paid and service restored." : "Invoice partly paid."}`);
      queryClient.invalidateQueries({ queryKey: ["payments-unmatched"] });
      setTimeout(() => setDone(null), 6000);
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Could not apply the payment"),
  });

  const items = data?.items ?? [];

  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHeader
        title={tr("Reconciliation")}
        description={tr("Payments that arrived without an invoice to settle. Apply each one to the right invoice so the customer's balance and service are correct.")}
      />
      {done && <Notice tone="good">{done}</Notice>}
      {error && <Notice tone="bad">{error}</Notice>}

      <MetricGrid columns={3}>
        <Metric label={tr("Unmatched payments")} value={data ? data.summary.count : "—"} tone={data && data.summary.count > 0 ? "warn" : "good"} />
        <Metric label={tr("Money waiting")} value={data ? formatMoney(data.summary.totalMinor) : "—"} hint={tr("Received but not yet on an invoice")} />
        <Metric label={tr("Checked")} value={data ? "Live" : "—"} hint={tr("Refreshes every minute")} />
      </MetricGrid>

      <Panel padded={false}>
        {isLoading ? (
          <p className="px-5 py-8 text-sm text-slate-400">{tr("Loading…")}</p>
        ) : items.length === 0 ? (
          <EmptyState title={tr("Everything is matched")}>{tr("Every completed payment is on an invoice. Nothing to do here.")}</EmptyState>
        ) : (
          <TableShell minWidth={760}>
            <thead>
              <tr>
                <th className={th}>{tr("Received")}</th>
                <th className={th}>{tr("Reference")}</th>
                <th className={th}>{tr("Method")}</th>
                <th className={th}>{tr("Paid by")}</th>
                <th className={`${th} text-right`}>{tr("Amount")}</th>
                <th className={`${th} text-right`}>
                  <span className="sr-only">{tr("Actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td className={`${td} text-slate-400`}>{new Date(p.createdAt).toLocaleString()}</td>
                  <td className={`${td} font-mono text-[13px] text-slate-200`}>{p.reference ?? "—"}</td>
                  <td className={`${td} text-slate-300`}>{p.method.replace("_", " ")}</td>
                  <td className={td}>
                    {p.customer ? (
                      <Link href={`/customers/${p.customer.id}`} className="text-white hover:underline">
                        {p.customer.fullName}
                        <span className="block text-xs text-slate-500">{p.customer.phone}</span>
                      </Link>
                    ) : (
                      <span className="text-slate-500">{tr("Unknown payer")}</span>
                    )}
                  </td>
                  <td className={`${td} text-right font-medium tabular-nums text-white`}>{formatMoney(p.amountMinor, p.currency)}</td>
                  <td className={`${td} text-right`}>
                    <button
                      type="button"
                      className={darkButton("primary", "sm")}
                      onClick={() => {
                        setError(null);
                        setSearch("");
                        setMatching(p);
                      }}
                    >
                      {tr("Apply to invoice")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Panel>

      <Modal
        open={matching !== null}
        onClose={() => setMatching(null)}
        title={tr("Apply payment to an invoice")}
        description={matching ? `${formatMoney(matching.amountMinor, matching.currency)} received ${new Date(matching.createdAt).toLocaleString()}${matching.reference ? ` · ${matching.reference}` : ""}` : undefined}
        footer={
          <button type="button" className={darkButton("secondary")} onClick={() => setMatching(null)}>
            {tr("Cancel")}
          </button>
        }
      >
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tr("Invoice number, customer name or phone")}
          className="w-full rounded-lg border border-obsidian-700 bg-obsidian-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-brand-500"
        />
        <div className="mt-3 space-y-2">
          {(invoices?.items ?? []).map((inv) => {
            const balance = inv.totalMinor - inv.amountPaidMinor;
            return (
              <div key={inv.id} className="flex items-center justify-between gap-3 rounded-lg border border-obsidian-800 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-mono text-[13px] text-white">{inv.invoiceNumber}</span>
                  <span className="ml-2 text-slate-400">{inv.customer?.fullName ?? ""}</span>
                  <span className="block text-xs text-slate-500">
                    Balance {formatMoney(balance, inv.currency)} · due {new Date(inv.dueDate).toLocaleDateString()}
                  </span>
                </div>
                <button
                  type="button"
                  className={darkButton("primary", "sm")}
                  disabled={match.isPending}
                  onClick={() => matching && match.mutate({ paymentId: matching.id, invoiceId: inv.id })}
                >
                  {tr("Apply")}
                </button>
              </div>
            );
          })}
          {invoices && invoices.items.length === 0 && <p className="text-sm text-slate-500">{tr("No open invoices match.")}</p>}
        </div>
      </Modal>
    </div>
  );
}
