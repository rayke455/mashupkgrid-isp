"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Badge, Button, Card } from "@/components/ui";

type AttemptStatus = "PENDING" | "COMPLETED" | "FAILED" | "ABANDONED";

interface PurchaseAttempt {
  id: string;
  provider: "MPESA" | "PAYSTACK" | "PESAPAL";
  reference: string;
  createdAt: string;
  phone: string | null;
  email: string | null;
  amountMinor: number;
  currency: string;
  packageName: string | null;
  customerName: string | null;
  status: AttemptStatus;
  failureReason: string | null;
  voucherCode: string | null;
}

interface Summary {
  total: number;
  completed: number;
  pending: number;
  failed: number;
  abandoned: number;
  conversionRate: number | null;
}

const STATUS_VARIANT: Record<AttemptStatus, "success" | "warning" | "danger" | "neutral"> = {
  COMPLETED: "success",
  PENDING: "warning",
  FAILED: "danger",
  ABANDONED: "neutral",
};

const FILTERS: { value: AttemptStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "COMPLETED", label: "Paid" },
  { value: "PENDING", label: "Pending" },
  { value: "FAILED", label: "Failed" },
  { value: "ABANDONED", label: "Abandoned" },
];

function money(minor: number, currency: string): string {
  return `${currency} ${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PurchaseAttemptsPage() {
  const [status, setStatus] = useState<AttemptStatus | "ALL">("ALL");
  const [days, setDays] = useState(7);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canClean = Boolean(user?.permissions.includes("payments.refund"));
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // Housekeeping: failed and abandoned prompts are worth a call this week and are noise after.
  // The server never deletes a completed attempt or one linked to a payment, whatever is asked.
  const cleanup = useMutation({
    mutationFn: (olderThanDays: number) =>
      Promise.all([
        apiFetch<{ deleted: number }>("/api/v1/payments/purchase-attempts/cleanup", { method: "POST", body: JSON.stringify({ olderThanDays }) }),
        apiFetch<{ deleted: number }>("/api/v1/payments/cleanup", { method: "POST", body: JSON.stringify({ olderThanDays }) }),
      ]),
    onSuccess: ([attempts, payments]) => {
      setNotice({ ok: true, text: `Removed ${attempts.deleted} failed or abandoned attempt${attempts.deleted === 1 ? "" : "s"} and ${payments.deleted} failed payment record${payments.deleted === 1 ? "" : "s"}.` });
      queryClient.invalidateQueries({ queryKey: ["purchase-attempts"] });
    },
    onError: (err) => setNotice({ ok: false, text: err instanceof ApiRequestError ? err.message : "Clean-up failed" }),
  });
  const removeOne = useMutation({
    mutationFn: (attempt: PurchaseAttempt) => apiFetch(`/api/v1/payments/purchase-attempts/${attempt.provider}/${attempt.id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["purchase-attempts"] }),
    onError: (err) => setNotice({ ok: false, text: err instanceof ApiRequestError ? err.message : "Could not delete this attempt" }),
  });
  const askCleanup = () => {
    const answer = window.prompt("Delete failed and abandoned attempts (and failed payment records) older than how many days? Completed payments are never touched.", "7");
    if (answer === null) return;
    const daysBack = Number(answer);
    if (!Number.isInteger(daysBack) || daysBack < 1) {
      setNotice({ ok: false, text: "Enter a whole number of days, at least 1." });
      return;
    }
    cleanup.mutate(daysBack);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["purchase-attempts", status, days],
    queryFn: () =>
      apiFetch<{ attempts: PurchaseAttempt[]; summary: Summary }>(
        `/api/v1/payments/purchase-attempts?days=${days}${status === "ALL" ? "" : `&status=${status}`}`
      ),
    // These rows are how staff spot a customer stuck at the payment step, so a stale list is
    // actively unhelpful — refresh while the page is open.
    refetchInterval: 30_000,
  });

  const summary = data?.summary;
  const attempts = data?.attempts ?? [];

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Purchase attempts
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Everyone who started a payment — including the ones that never completed. A customer who
            tried and failed is usually one phone call away from paying.
          </p>
        </div>
        {canClean && (
          <Button variant="outline" size="sm" onClick={askCleanup} disabled={cleanup.isPending} className="shrink-0">
            {cleanup.isPending ? "Cleaning up…" : "Clean up old failures"}
          </Button>
        )}
      </div>

      {notice && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            notice.ok
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300"
          }`}
        >
          {notice.text}
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Attempts", value: summary.total },
            { label: "Paid", value: summary.completed },
            { label: "Pending", value: summary.pending },
            { label: "Failed", value: summary.failed },
            { label: "Abandoned", value: summary.abandoned },
          ].map((stat) => (
            <Card key={stat.label} className="px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {stat.label}
              </p>
              <p className="mt-0.5 text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
            </Card>
          ))}
        </div>
      )}

      {summary && summary.conversionRate !== null && (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <span className="font-semibold text-slate-900 dark:text-white">{summary.conversionRate}%</span> of
          attempts in the last {days} days were paid.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            onClick={() => setStatus(filter.value)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              status === filter.value
                ? "bg-brand-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-obsidian-800 dark:text-slate-300"
            }`}
          >
            {filter.label}
          </button>
        ))}
        <select
          className="ml-auto rounded-lg border border-slate-300/90 bg-white px-3 py-1 text-xs text-slate-900 dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-slate-100"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={1}>Last 24 hours</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading purchase attempts…</p>}

      {!isLoading && attempts.length === 0 && (
        <Card className="px-4 py-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No purchase attempts in this period.
          </p>
        </Card>
      )}

      <div className="space-y-2">
        {attempts.map((attempt) => (
          <Card key={attempt.id} className="px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {attempt.customerName || attempt.phone || attempt.email || "Guest"}
                  </span>
                  <Badge variant={STATUS_VARIANT[attempt.status]}>{attempt.status}</Badge>
                  <span className="text-xs font-medium text-slate-400">{attempt.provider}</span>
                </div>
                <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
                  {attempt.packageName ?? "Invoice payment"} · {money(attempt.amountMinor, attempt.currency)}
                </p>
                {attempt.failureReason && (
                  <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{attempt.failureReason}</p>
                )}
                {attempt.voucherCode && (
                  <p className="mt-1 font-mono text-xs text-emerald-600 dark:text-emerald-400">
                    Voucher {attempt.voucherCode}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500 dark:text-slate-400">{when(attempt.createdAt)}</p>
                {attempt.phone && attempt.customerName && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">{attempt.phone}</p>
                )}
                <p className="mt-0.5 font-mono text-[10px] text-slate-400">{attempt.reference}</p>
                {canClean && attempt.status !== "COMPLETED" && !attempt.voucherCode && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Delete this attempt? It never became a payment.")) removeOne.mutate(attempt);
                    }}
                    disabled={removeOne.isPending}
                    className="mt-1 text-xs text-slate-400 hover:text-rose-500 disabled:opacity-50"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
