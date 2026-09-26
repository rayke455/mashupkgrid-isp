"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";
import { describeAddOn } from "@/lib/addons";
import { tr } from "@/lib/tr";
import { Notice, Panel, darkButton } from "@/components/dashboard/surface";
import { Input, Label } from "@/components/ui";
import { IconMpesa, IconZap } from "@/components/icons";

/**
 * "Boost my internet" in the customer app: the ISP's add-ons, paid with an M-Pesa prompt. The
 * add-on starts as soon as the payment lands; running ones show when they end.
 */

interface AddOn {
  id: string;
  name: string;
  kind: "SPEED" | "DATA";
  downloadKbps: number | null;
  uploadKbps: number | null;
  dataMb: number | null;
  durationHours: number;
  priceMinor: number;
  currency: string;
}

interface Purchase extends Omit<AddOn, "id"> {
  id: string;
  status: "AWAITING_PAYMENT" | "ACTIVE" | "EXPIRED" | "CANCELLED";
  endsAt: string | null;
}

interface Stk {
  status: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
  resultDesc: string | null;
}

export function BuyAddOn({ subscriptionId, phone, canPay }: { subscriptionId: string; phone: string; canPay: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["me-addons"], queryFn: () => apiFetch<{ catalog: AddOn[]; purchases: Purchase[] }>("/api/v1/me/addons") });
  const [choice, setChoice] = useState<AddOn | null>(null);
  const [payPhone, setPayPhone] = useState(phone);
  const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buy = useMutation({
    mutationFn: (a: AddOn) =>
      apiFetch<{ checkoutRequestId: string }>(`/api/v1/me/subscriptions/${subscriptionId}/addons`, { method: "POST", body: JSON.stringify({ addOnId: a.id, phone: payPhone.trim() }) }),
    onSuccess: (res) => {
      setError(null);
      setCheckoutRequestId(res.checkoutRequestId);
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : tr("Something went wrong.")),
  });
  const { data: stk } = useQuery({
    queryKey: ["me-stk", checkoutRequestId],
    queryFn: () => apiFetch<Stk>(`/api/v1/me/payments/${checkoutRequestId}`),
    enabled: Boolean(checkoutRequestId),
    refetchInterval: (q) => (q.state.data?.status === "PENDING" || !q.state.data ? 3000 : false),
  });
  useEffect(() => {
    if (stk?.status === "COMPLETED") {
      void qc.invalidateQueries({ queryKey: ["me-addons"] });
      void qc.invalidateQueries({ queryKey: ["me-invoices"] });
    }
  }, [stk?.status, qc]);

  // Buying the same add-on again extends it, leaving two rows with one end time: show it once.
  const running = (data?.purchases ?? []).filter(
    (p, i, all) => p.status === "ACTIVE" && p.endsAt && new Date(p.endsAt) > new Date() && all.findIndex((q) => q.name === p.name && q.endsAt === p.endsAt && q.status === "ACTIVE") === i
  );
  if (!data || (data.catalog.length === 0 && running.length === 0)) return null;

  const reset = () => {
    setChoice(null);
    setCheckoutRequestId(null);
    setError(null);
  };
  const ends = (iso: string) => new Date(iso).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <Panel title={tr("Boost my internet")} description={tr("Faster speed or extra data for a while, paid with M-Pesa. It starts as soon as you pay.")}>
      <div className="space-y-4">
        {running.map((p) => (
          <Notice key={p.id} tone="good">
            {p.name} ({describeAddOn(p)}) {tr("is on until")} {ends(p.endsAt!)}.
          </Notice>
        ))}
        {error && <Notice tone="bad">{error}</Notice>}

        {choice ? (
          <div className="space-y-3 rounded-lg border border-obsidian-800 p-4">
            <p className="text-sm text-white">
              {choice.name} · {describeAddOn(choice)} · <strong>{formatMoney(choice.priceMinor, choice.currency)}</strong>
            </p>
            {!checkoutRequestId ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Label htmlFor="addon-phone">{tr("M-Pesa phone")}</Label>
                  <Input id="addon-phone" inputMode="tel" value={payPhone} onChange={(e) => setPayPhone(e.target.value)} />
                </div>
                <button type="button" className={darkButton("primary")} disabled={buy.isPending || payPhone.trim().length < 9} onClick={() => buy.mutate(choice)}>
                  <IconMpesa size={16} /> {buy.isPending ? tr("Sending…") : tr("Send M-Pesa prompt")}
                </button>
                <button type="button" className={darkButton("ghost")} onClick={reset}>
                  {tr("Cancel")}
                </button>
              </div>
            ) : stk?.status === "COMPLETED" ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-emerald-300">{tr("Paid. Your add-on is on. If you were online, your connection restarts for a few seconds.")}</p>
                <button type="button" className={darkButton("ghost", "sm")} onClick={reset}>
                  {tr("Done")}
                </button>
              </div>
            ) : stk?.status === "FAILED" || stk?.status === "CANCELLED" ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-rose-300">{stk.status === "CANCELLED" ? tr("The prompt was cancelled.") : `${tr("Payment failed.")} ${stk.resultDesc ?? ""}`}</p>
                <button type="button" className={darkButton("ghost", "sm")} onClick={() => setCheckoutRequestId(null)}>
                  {tr("Try again")}
                </button>
              </div>
            ) : (
              <p className="text-sm text-slate-300">{tr("Check your phone and enter your M-Pesa PIN…")}</p>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.catalog.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-obsidian-800 p-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-medium text-white">
                    <IconZap size={15} /> {a.name}
                  </p>
                  <p className="text-xs text-slate-400">{describeAddOn(a)}</p>
                </div>
                {canPay ? (
                  <button type="button" className={darkButton("secondary", "sm")} onClick={() => setChoice(a)}>
                    {formatMoney(a.priceMinor, a.currency)}
                  </button>
                ) : (
                  <span className="text-sm tabular-nums text-slate-300">{formatMoney(a.priceMinor, a.currency)}</span>
                )}
              </div>
            ))}
          </div>
        )}
        {!canPay && <p className="text-xs text-slate-400">{tr("Only the account holder can buy add-ons.")}</p>}
      </div>
    </Panel>
  );
}
