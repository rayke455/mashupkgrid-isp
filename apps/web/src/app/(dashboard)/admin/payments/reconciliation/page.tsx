"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import {
  Alert,
  Dialog,
  Field,
  Money,
  PLATFORM_TABS,
  Panel,
  PaymentsWorkspace,
  buttonClass,
  formatDateTime,
  inputClass,
  qs,
} from "@/components/payments-gateway/kit";
import { usePlatformTenants } from "@/components/payments-gateway/use-platform";

interface Item {
  id: string;
  tenantId: string | null;
  tenantName: string | null;
  reference: string | null;
  amountMinor: number | null;
  occurredAt: string | null;
  detail: string;
}
interface Check {
  code: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  count: number;
  amountMinor: number;
  items: Item[];
}
interface Report {
  generatedAt: string;
  totals: {
    from: string;
    to: string;
    providerCollectedMinor: number;
    providerCount: number;
    transactionsGrossMinor: number;
    transactionsCount: number;
    ledgerCustomerCreditsMinor: number;
    platformFeesMinor: number;
    settledMinor: number;
    pendingSettlementMinor: number;
    totalOwedMinor: number;
  };
  checks: Check[];
}

const SEVERITY: Record<Check["severity"], { label: string; cls: string }> = {
  critical: { label: "Critical", cls: "bg-red-600 text-white" },
  high: { label: "High", cls: "bg-red-500/10 text-red-200 ring-1 ring-inset ring-red-500/30" },
  medium: { label: "Medium", cls: "bg-amber-500/10 text-amber-200 ring-1 ring-inset ring-amber-500/30" },
  low: { label: "Low", cls: "bg-obsidian-800 text-slate-300 ring-1 ring-inset ring-slate-500/20" },
  info: { label: "Info", cls: "bg-brand-500/10 text-brand-300 ring-1 ring-inset ring-brand-500/20" },
};

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function ReconciliationPage() {
  const [from, setFrom] = useState(isoDay(new Date(Date.now() - 29 * 86_400_000)));
  const [to, setTo] = useState(isoDay(new Date()));
  const [assigning, setAssigning] = useState<Item | null>(null);
  const { user } = useAuth();
  const canManage = Boolean(user?.permissions.includes("platform_payments.manage"));
  const query = qs({ from: from ? `${from}T00:00:00+03:00` : undefined, to: to ? `${to}T23:59:59+03:00` : undefined });
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["platform-payments", "reconciliation", query],
    queryFn: () => apiFetch<Report>(`/api/v1/platform/payments/reconciliation${query}`),
  });

  const problems = data?.checks.filter((c) => c.count > 0 && c.severity !== "info") ?? [];
  const t = data?.totals;

  return (
    <PaymentsWorkspace
      tabs={PLATFORM_TABS}
      title="Reconciliation"
      description="Four records of the same money, compared: what M-Pesa reported, the gateway's transactions, the ISPs' ledgers, and settlements. Each discrepancy lists the rows involved."
      actions={
        <button type="button" className={buttonClass("secondary")} onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? "Checking…" : "Run again"}
        </button>
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <Field label="From" htmlFor="rec-from">
          <input id="rec-from" type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To" htmlFor="rec-to">
          <input id="rec-to" type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        {data && <p className="pb-2 text-xs text-slate-400">Checked {formatDateTime(data.generatedAt)}</p>}
      </div>

      {error && <Alert title="Reconciliation failed to run">{(error as Error).message}</Alert>}

      <Panel title="Totals for the period" padded={false}>
        {isLoading || !t ? (
          <div className="m-5 h-24 animate-pulse rounded-md bg-obsidian-800" />
        ) : (
          <div className="grid divide-y divide-obsidian-800 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
            <Total label="Provider (M-Pesa)" minor={t.providerCollectedMinor} sub={`${t.providerCount} confirmed payments`} />
            <Total label="Gateway transactions" minor={t.transactionsGrossMinor} sub={`${t.transactionsCount} transactions`} mismatch={t.transactionsGrossMinor !== t.providerCollectedMinor} />
            <Total label="Ledger credits" minor={t.ledgerCustomerCreditsMinor} sub={<>Fees <Money minor={t.platformFeesMinor} /></>} mismatch={t.ledgerCustomerCreditsMinor !== t.transactionsGrossMinor} />
            <Total label="Settled" minor={t.settledMinor} sub={<>Pending <Money minor={t.pendingSettlementMinor} /> · Owed now <Money minor={t.totalOwedMinor} /></>} />
          </div>
        )}
        <p className="border-t border-obsidian-800 px-5 py-3 text-xs leading-5 text-slate-400">
          “Provider” is what Safaricom&apos;s callbacks told us — Safaricom has no API to list a paybill&apos;s transactions. A payment M-Pesa took
          but never reported can only be found by comparing with the M-Pesa statement. Totals can differ legitimately across the period boundary
          (a callback just before midnight, its ledger entry just after).
        </p>
      </Panel>

      {data && problems.length === 0 && (
        <Alert tone="green" title="No discrepancies found">
          Every provider record has its transaction and ledger entries, and every settlement matches the ledger.
        </Alert>
      )}

      <div className="space-y-3">
        {data?.checks.map((c) => (
          <CheckCard key={c.code} check={c} canAssign={canManage} onAssign={setAssigning} />
        ))}
      </div>

      {assigning && <AssignDialog item={assigning} onClose={() => setAssigning(null)} />}
    </PaymentsWorkspace>
  );
}

function Total({ label, minor, sub, mismatch }: { label: string; minor: number; sub: React.ReactNode; mismatch?: boolean }) {
  return (
    <div className="px-5 py-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${mismatch ? "text-amber-300" : "text-white"}`}>
        <Money minor={minor} />
      </p>
      <p className="mt-0.5 text-xs text-slate-400">{sub}</p>
    </div>
  );
}

function CheckCard({ check, canAssign, onAssign }: { check: Check; canAssign: boolean; onAssign: (i: Item) => void }) {
  const [open, setOpen] = useState(false);
  const ok = check.count === 0;
  const sev = SEVERITY[check.severity];
  return (
    <section className={`rounded-lg border bg-obsidian-900 ${ok ? "border-obsidian-800" : check.severity === "critical" ? "border-red-500/30" : "border-obsidian-800"}`}>
      <button
        type="button"
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        disabled={ok}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {ok ? (
              <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-200 ring-1 ring-inset ring-emerald-500/30">OK</span>
            ) : (
              <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${sev.cls}`}>{sev.label}</span>
            )}
            <h3 className={`text-sm font-semibold ${ok ? "text-slate-400" : "text-white"}`}>{check.title}</h3>
          </div>
          {!ok && <p className="mt-1 max-w-3xl text-sm text-slate-400">{check.description}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-sm font-semibold tabular-nums ${ok ? "text-slate-500" : "text-white"}`}>{check.count.toLocaleString()}</p>
          {check.amountMinor !== 0 && (
            <p className="text-xs text-slate-400">
              <Money minor={check.amountMinor} />
            </p>
          )}
        </div>
      </button>
      {open && !ok && (
        <div className="overflow-x-auto border-t border-obsidian-800">
          <table className="w-full min-w-[640px] text-left text-sm">
            <tbody>
              {check.items.map((i) => (
                <tr key={i.id} className="border-b border-obsidian-800 last:border-0">
                  <td className="whitespace-nowrap px-5 py-2.5 font-mono text-xs text-slate-300">{i.reference ?? i.id.slice(0, 8)}</td>
                  <td className="px-3 py-2.5 text-slate-300">{i.tenantName ?? <span className="text-slate-500">No ISP</span>}</td>
                  <td className="px-3 py-2.5 text-slate-400">{i.detail}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-100">{i.amountMinor !== null ? <Money minor={i.amountMinor} /> : ""}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-400">{formatDateTime(i.occurredAt)}</td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-right">
                    {check.code === "UNMATCHED_PLATFORM_PAYBILL" && canAssign && (
                      <button type="button" className={buttonClass("secondary", "sm")} onClick={() => onAssign(i)}>
                        Assign
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {check.count > check.items.length && (
            <p className="px-5 py-2 text-xs text-slate-400">Showing the first {check.items.length} of {check.count}.</p>
          )}
        </div>
      )}
    </section>
  );
}

interface CustomerOption {
  id: string;
  fullName: string;
  customerNumber: string;
  invoices: { id: string; invoiceNumber: string; totalMinor: number; amountPaidMinor: number }[];
}

function AssignDialog({ item, onClose }: { item: Item; onClose: () => void }) {
  const qc = useQueryClient();
  const tenants = usePlatformTenants();
  const [tenantId, setTenantId] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const customers = useQuery({
    queryKey: ["platform-payments", "tenant-customers", tenantId, debounced],
    queryFn: () => apiFetch<CustomerOption[]>(`/api/v1/platform/payments/tenants/${tenantId}/customers${qs({ search: debounced })}`),
    enabled: Boolean(tenantId),
  });
  const customer = customers.data?.find((c) => c.id === customerId);

  const assign = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/platform/payments/reconciliation/platform-c2b/${encodeURIComponent(item.reference ?? "")}/assign`, {
        method: "POST",
        body: JSON.stringify({ tenantId, customerId, ...(invoiceId ? { invoiceId } : {}) }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries();
      onClose();
    },
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Assign payment ${item.reference}`}
      footer={
        <>
          <button type="button" className={buttonClass("ghost")} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={buttonClass("primary")} disabled={!tenantId || !customerId || assign.isPending} onClick={() => assign.mutate()}>
            {assign.isPending ? "Assigning…" : "Assign & credit ISP"}
          </button>
        </>
      }
    >
      <p>
        <Money minor={item.amountMinor} /> · {item.detail}. It will be recorded for the customer and credited to the ISP less the platform fee.
      </p>
      <Field label="ISP" htmlFor="assign-tenant">
        <select id="assign-tenant" className={inputClass} value={tenantId} onChange={(e) => { setTenantId(e.target.value); setCustomerId(""); setInvoiceId(""); }}>
          <option value="">Choose an ISP</option>
          {tenants.data?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>
      {tenantId && (
        <Field label="Customer" htmlFor="assign-customer">
          <input id="assign-customer-search" className={`${inputClass} mb-2`} placeholder="Search name, number or phone" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search customers" />
          <select id="assign-customer" className={inputClass} value={customerId} onChange={(e) => { setCustomerId(e.target.value); setInvoiceId(""); }}>
            <option value="">{customers.isLoading ? "Loading…" : "Choose a customer"}</option>
            {customers.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName} · {c.customerNumber}
              </option>
            ))}
          </select>
        </Field>
      )}
      {customer && customer.invoices.length > 0 && (
        <Field label="Apply to invoice (optional)" htmlFor="assign-invoice" hint="Leave empty to credit the customer's wallet.">
          <select id="assign-invoice" className={inputClass} value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
            <option value="">Customer wallet</option>
            {customer.invoices.map((i) => (
              <option key={i.id} value={i.id}>
                {i.invoiceNumber} · KES {((i.totalMinor - i.amountPaidMinor) / 100).toLocaleString("en-KE")} due
              </option>
            ))}
          </select>
        </Field>
      )}
      {assign.error && <Alert>{(assign.error as ApiRequestError).message}</Alert>}
    </Dialog>
  );
}
