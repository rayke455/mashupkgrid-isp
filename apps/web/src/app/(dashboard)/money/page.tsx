"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Badge, Button, Card, ErrorText, HintText, Input, Label } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { IconInvoice } from "@/components/icons";

interface OwedTenant {
  tenantId: string;
  balanceMinor: number;
  creditedMinor: number;
  paidOutMinor: number;
  tenant: {
    id: string;
    name: string;
    slug: string;
    payoutShortcode: string | null;
    payoutShortcodeType: string;
  } | null;
}

interface Payout {
  id: string;
  amountMinor: number;
  destinationShortcode: string;
  destinationType: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  transactionId: string | null;
  failureReason: string | null;
  createdAt: string;
  tenant: { name: string; slug: string } | null;
}

interface PlatformConfig {
  b2b: { configured: boolean; initiatorName: string | null; payoutMinimumMinor: number };
}

const STATUS_VARIANT: Record<Payout["status"], "success" | "warning" | "danger" | "neutral"> = {
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
 * The operator's view of money held on tenants' behalf: what is owed, what has been sent, and the
 * one rule governing when it goes out.
 *
 * Deliberately one screen. Money owed, money sent and the threshold between them are the same
 * question asked three ways, and splitting them across pages is how a balance sits unnoticed
 * because the threshold was set somewhere else.
 */
export default function MoneyManagementPage() {
  const queryClient = useQueryClient();
  const [minimumShillings, setMinimumShillings] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: owed } = useQuery({
    queryKey: ["settlement-owed"],
    queryFn: () => apiFetch<OwedTenant[]>("/api/v1/payments/mpesa/settlement/owed"),
    refetchInterval: 60_000,
  });

  const { data: payouts } = useQuery({
    queryKey: ["settlement-payouts"],
    queryFn: () => apiFetch<Payout[]>("/api/v1/payments/mpesa/settlement/payouts"),
    refetchInterval: 60_000,
  });

  const { data: config } = useQuery({
    queryKey: ["platform-mpesa-config"],
    queryFn: () => apiFetch<PlatformConfig>("/api/v1/payments/mpesa/platform-config"),
  });

  // Shown in shillings because that is the unit the decision is made in; stored in cents because
  // that is the unit the money is held in.
  useEffect(() => {
    if (config?.b2b?.payoutMinimumMinor !== undefined) {
      setMinimumShillings(String(config.b2b.payoutMinimumMinor / 100));
    }
  }, [config?.b2b?.payoutMinimumMinor]);

  const saveMinimum = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/payments/mpesa/platform-config", {
        method: "PUT",
        body: JSON.stringify({
          payoutMinimumMinor: Math.max(1, Math.round(Number(minimumShillings) * 100)),
        }),
      }),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      queryClient.invalidateQueries({ queryKey: ["platform-mpesa-config"] });
    },
    onError: (err) =>
      setError(err instanceof ApiRequestError ? err.message : "Could not save the payout minimum"),
  });

  const release = useMutation({
    mutationFn: (tenantId: string) =>
      apiFetch(`/api/v1/payments/mpesa/settlement/${tenantId}/payout`, { method: "POST" }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["settlement-owed"] });
      queryClient.invalidateQueries({ queryKey: ["settlement-payouts"] });
    },
    onError: (err) =>
      setError(err instanceof ApiRequestError ? err.message : "Could not release that payout"),
  });

  const rows = owed ?? [];
  const totalOwed = rows.reduce((sum, r) => sum + r.balanceMinor, 0);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/15 text-brand-600 dark:text-brand-400">
            <IconInvoice size={20} />
          </span>
          Money management
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Money you are holding for tenants, and what has been sent to them.
        </p>
      </div>

      {error && <ErrorText>{error}</ErrorText>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Owed to tenants
          </p>
          <p className="mt-0.5 text-2xl font-bold text-slate-900 dark:text-white">
            {formatMoney(totalOwed)}
          </p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Tenants awaiting payout
          </p>
          <p className="mt-0.5 text-2xl font-bold text-slate-900 dark:text-white">{rows.length}</p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Payouts</p>
          <p className="mt-0.5 text-2xl font-bold text-slate-900 dark:text-white">
            {config?.b2b?.configured ? "Ready" : "Not set up"}
          </p>
        </Card>
      </div>

      <Card className="space-y-3">
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-white">Automatic payout rule</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Payouts run every hour. A tenant is paid once their balance reaches this amount.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Label htmlFor="minimum">Minimum payout (KES)</Label>
            <Input
              id="minimum"
              inputMode="decimal"
              value={minimumShillings}
              onChange={(e) => setMinimumShillings(e.target.value)}
            />
          </div>
          <Button disabled={saveMinimum.isPending} onClick={() => saveMinimum.mutate()}>
            {saveMinimum.isPending ? "Saving..." : "Save"}
          </Button>
          {saved && <span className="text-xs font-medium text-emerald-600">Saved</span>}
        </div>

        <HintText>
          Set it to 0.01 to send every cent. Each transfer carries a Safaricom fee, so a very low
          minimum can cost more than it moves — a balance below the minimum is never lost, it
          simply waits for the next run. M-Pesa sends whole shillings, so any odd cents stay on the
          tenant&apos;s balance until they make up a shilling.
        </HintText>
      </Card>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Awaiting payout</h2>
        {rows.length === 0 && (
          <Card className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            Nothing is owed right now.
          </Card>
        )}
        {rows.map((row) => (
          <Card key={row.tenantId} className="px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 dark:text-white">
                  {row.tenant?.name ?? row.tenantId}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {row.tenant?.payoutShortcode
                    ? `${row.tenant.payoutShortcodeType === "TILL" ? "Till" : "Paybill"} ${row.tenant.payoutShortcode}`
                    : "No payout number set — cannot be paid yet"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {formatMoney(row.balanceMinor)}
                </span>
                <Button
                  variant="secondary"
                  className="px-2.5 py-1 text-xs"
                  disabled={release.isPending || !row.tenant?.payoutShortcode}
                  onClick={() => release.mutate(row.tenantId)}
                >
                  Send now
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Payout history</h2>
        {(payouts ?? []).length === 0 && (
          <Card className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            No payouts yet.
          </Card>
        )}
        {(payouts ?? []).map((payout) => (
          <Card key={payout.id} className="px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {formatMoney(payout.amountMinor)}
                  </span>
                  <Badge variant={STATUS_VARIANT[payout.status]}>{payout.status}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {payout.tenant?.name ?? "—"} · {payout.destinationType === "TILL" ? "till" : "paybill"}{" "}
                  {payout.destinationShortcode}
                  {payout.transactionId ? ` · ${payout.transactionId}` : ""}
                </p>
                {payout.failureReason && (
                  <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                    {payout.failureReason}
                  </p>
                )}
              </div>
              <span className="text-xs text-slate-400">{when(payout.createdAt)}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
