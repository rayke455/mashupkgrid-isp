"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Badge, Card } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { IconInvoice } from "@/components/icons";

interface LedgerEntry {
  id: string;
  direction: "CREDIT" | "DEBIT";
  amountMinor: number;
  currency: string;
  description: string;
  createdAt: string;
}

interface Payout {
  id: string;
  amountMinor: number;
  currency: string;
  destinationShortcode: string;
  destinationType: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  transactionId: string | null;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface Settlement {
  balance: {
    creditedMinor: number;
    paidOutMinor: number;
    balanceMinor: number;
    currency: string;
  };
  entries: LedgerEntry[];
  payouts: Payout[];
}

const PAYOUT_VARIANT: Record<Payout["status"], "success" | "warning" | "danger" | "neutral"> = {
  COMPLETED: "success",
  PROCESSING: "warning",
  PENDING: "neutral",
  FAILED: "danger",
};

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * What the platform has collected on this tenant's behalf and still owes them.
 *
 * Only meaningful for a tenant whose payments the platform collects; one collecting on their own
 * M-Pesa account is paid directly by their customers and will simply see nothing here, which is
 * the correct answer rather than an error.
 */
export default function SettlementPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["settlement"],
    queryFn: () => apiFetch<Settlement>("/api/v1/payments/mpesa/settlement"),
    refetchInterval: 60_000,
  });

  const balance = data?.balance;
  const entries = data?.entries ?? [];
  const payouts = data?.payouts ?? [];
  const nothingHere = !isLoading && entries.length === 0 && payouts.length === 0;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/15 text-brand-600 dark:text-brand-400">
            <IconInvoice size={20} />
          </span>
          Settlement
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Money collected on your behalf, and what has been sent to you.
        </p>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading settlement…</p>}

      {nothingHere && (
        <Card className="px-4 py-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Your customers pay into your own M-Pesa account, so there is nothing for this platform
            to hold or send on.
          </p>
        </Card>
      )}

      {balance && !nothingHere && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card className="px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Owed to you</p>
            <p className="mt-0.5 text-2xl font-bold text-slate-900 dark:text-white">
              {formatMoney(balance.balanceMinor)}
            </p>
          </Card>
          <Card className="px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Collected</p>
            <p className="mt-0.5 text-2xl font-bold text-slate-900 dark:text-white">
              {formatMoney(balance.creditedMinor)}
            </p>
          </Card>
          <Card className="px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Paid out</p>
            <p className="mt-0.5 text-2xl font-bold text-slate-900 dark:text-white">
              {formatMoney(balance.paidOutMinor)}
            </p>
          </Card>
        </div>
      )}

      {payouts.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Payouts</h2>
          {payouts.map((payout) => (
            <Card key={payout.id} className="px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {formatMoney(payout.amountMinor)}
                    </span>
                    <Badge variant={PAYOUT_VARIANT[payout.status]}>{payout.status}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    To {payout.destinationType === "TILL" ? "till" : "paybill"}{" "}
                    {payout.destinationShortcode}
                    {payout.transactionId ? ` · ${payout.transactionId}` : ""}
                  </p>
                  {payout.failureReason && (
                    <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                      {payout.failureReason}
                    </p>
                  )}
                </div>
                <span className="text-xs text-slate-400">
                  {when(payout.completedAt ?? payout.createdAt)}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {entries.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Recent activity</h2>
          <Card className="divide-y divide-slate-100 px-0 py-0 dark:divide-obsidian-800">
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-sm text-slate-700 dark:text-slate-200">{entry.description}</p>
                  <p className="text-[11px] text-slate-400">{when(entry.createdAt)}</p>
                </div>
                <span
                  className={
                    entry.direction === "CREDIT"
                      ? "font-mono text-sm text-emerald-600 dark:text-emerald-400"
                      : "font-mono text-sm text-slate-500"
                  }
                >
                  {entry.direction === "CREDIT" ? "+" : "−"}
                  {formatMoney(entry.amountMinor)}
                </span>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}
