"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Badge, Button, Card, ErrorText, HintText, Input, Label } from "@/components/ui";
import { formatMoney } from "@/lib/money";

interface Settlement {
  balance: { balanceMinor: number; creditedMinor: number; paidOutMinor: number };
  collectionMode: "OWN" | "PLATFORM";
  payoutShortcode: string | null;
  payoutShortcodeType: "PAYBILL" | "TILL";
}

/**
 * The no-credentials way to get paid: the platform collects and pays into this tenant's own
 * till or paybill.
 *
 * Presented alongside the gateway forms rather than on a separate screen, because from an
 * operator's point of view it answers the same question they all do — "how do I receive my
 * customers' money" — and it is the option most of them want: nothing to register with
 * Safaricom, no keys to paste, no passkey to rotate.
 */
export function PlatformPayoutSettings() {
  const queryClient = useQueryClient();
  const [shortcode, setShortcode] = useState("");
  const [shortcodeType, setShortcodeType] = useState<"PAYBILL" | "TILL">("PAYBILL");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data } = useQuery({
    queryKey: ["settlement"],
    queryFn: () => apiFetch<Settlement>("/api/v1/payments/mpesa/settlement"),
  });

  useEffect(() => {
    if (data?.payoutShortcode) setShortcode(data.payoutShortcode);
    if (data?.payoutShortcodeType) setShortcodeType(data.payoutShortcodeType);
  }, [data?.payoutShortcode, data?.payoutShortcodeType]);

  const save = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/payments/mpesa/settlement/destination", {
        method: "PATCH",
        body: JSON.stringify({
          payoutShortcode: shortcode.trim(),
          payoutShortcodeType: shortcodeType,
        }),
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

  const active = data?.collectionMode === "PLATFORM";

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">
              Get paid to your till or paybill
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No API keys, no consumer secret, no passkey. Your customers pay through us and we
              send your money to this number automatically.
            </p>
          </div>
          <Badge variant={active ? "success" : "neutral"}>
            {active ? "Active" : "Not enabled"}
          </Badge>
        </div>

        {!active && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-obsidian-950 dark:text-slate-300">
            Your account is currently set to collect payments into your own M-Pesa account, so
            nothing is sent from here yet. Save your number anyway — it is used the moment this is
            switched on for you.
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
          <Button disabled={save.isPending || !shortcode.trim()} onClick={() => save.mutate()}>
            {save.isPending ? "Saving..." : "Save payout number"}
          </Button>
          {saved && <span className="text-xs font-medium text-emerald-600">Saved</span>}
        </div>

        <HintText>
          Double-check the number. Money is sent here automatically every hour, and a payout to the
          wrong till is not something this platform can pull back.
        </HintText>
      </Card>

      {active && data && (
        <Card>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Owed to you</p>
          <p className="mt-0.5 text-2xl font-bold text-slate-900 dark:text-white">
            {formatMoney(data.balance.balanceMinor)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {formatMoney(data.balance.creditedMinor)} collected ·{" "}
            {formatMoney(data.balance.paidOutMinor)} already paid out
          </p>
        </Card>
      )}
    </div>
  );
}
