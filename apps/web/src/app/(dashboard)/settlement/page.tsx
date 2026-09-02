"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Badge, Button, Card, ErrorText, Input, Label } from "@/components/ui";
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
  /** PLATFORM means this platform collects and owes them; OWN means their customers pay them
   *  directly and there is nothing here to settle. */
  collectionMode: "OWN" | "PLATFORM";
  payoutShortcode: string | null;
  payoutShortcodeType: "PAYBILL" | "TILL";
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
  const queryClient = useQueryClient();
  const [shortcode, setShortcode] = useState("");
  const [shortcodeType, setShortcodeType] = useState<"PAYBILL" | "TILL">("PAYBILL");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["settlement"],
    queryFn: () => apiFetch<Settlement>("/api/v1/payments/mpesa/settlement"),
    refetchInterval: 60_000,
  });

  const balance = data?.balance;
  const entries = data?.entries ?? [];
  const payouts = data?.payouts ?? [];
  const aggregated = data?.collectionMode === "PLATFORM";
  const destinationSet = Boolean(data?.payoutShortcode);

  // Seeded from the server once loaded, so the field shows what is actually saved rather than
  // an empty box that looks like nothing is configured.
  useEffect(() => {
    if (data?.payoutShortcode) setShortcode(data.payoutShortcode);
    if (data?.payoutShortcodeType) setShortcodeType(data.payoutShortcodeType);
  }, [data?.payoutShortcode, data?.payoutShortcodeType]);

  const saveDestination = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/payments/mpesa/settlement/destination", {
        method: "PATCH",
        body: JSON.stringify({ payoutShortcode: shortcode.trim(), payoutShortcodeType: shortcodeType }),
      }),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      queryClient.invalidateQueries({ queryKey: ["settlement"] });
    },
    onError: (err) =>
      setError(err instanceof ApiRequestError ? err.message : "Could not save your payout number"),
  });

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

      {!isLoading && !aggregated && (
        <Card className="px-4 py-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Your customers pay into your own M-Pesa account, so there is nothing for this platform
            to hold or send on.
          </p>
        </Card>
      )}

      {aggregated && (
        <Card className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Where we send your money
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Your customers pay into our paybill and we pay you automatically. We only need the
              number you want the money in — no API keys, no passkey, nothing to set up on Safaricom.
            </p>
          </div>

          {!destinationSet && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              Add your number to start receiving payouts. Your earnings are safe in the meantime —
              they are held and paid out as soon as this is set.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label htmlFor="payoutShortcode">
                {shortcodeType === "TILL" ? "Your till number" : "Your paybill number"}
              </Label>
              <Input
                id="payoutShortcode"
                inputMode="numeric"
                placeholder="e.g. 174379"
                value={shortcode}
                onChange={(e) => setShortcode(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="payoutShortcodeType">Type</Label>
              <select
                id="payoutShortcodeType"
                className="w-full rounded-lg border border-slate-300/90 bg-white px-3.5 py-2 text-sm text-slate-900 dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-slate-100"
                value={shortcodeType}
                onChange={(e) => setShortcodeType(e.target.value as "PAYBILL" | "TILL")}
              >
                <option value="PAYBILL">Paybill</option>
                <option value="TILL">Till (Buy Goods)</option>
              </select>
            </div>
          </div>

          {error && <ErrorText>{error}</ErrorText>}

          <div className="flex items-center gap-3">
            <Button
              disabled={saveDestination.isPending || !shortcode.trim()}
              onClick={() => saveDestination.mutate()}
            >
              {saveDestination.isPending ? "Saving..." : "Save payout number"}
            </Button>
            {saved && <span className="text-xs font-medium text-emerald-600">Saved</span>}
          </div>
        </Card>
      )}

      {balance && aggregated && (
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
