"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";
import { Button, Card, ErrorText, Input, Label, Badge, StatusDot } from "@/components/ui";
import { IconMpesa, IconCheck } from "@/components/icons";

interface ConfigStatus {
  configured: boolean;
  isActive: boolean;
  shortcode: string | null;
  shortcodeType: "PAYBILL" | "TILL";
  storeNumber: string | null;
  environment: string;
}

interface C2BTransaction {
  id: string;
  transactionId: string;
  amountMinor: number;
  msisdn: string;
  billRefNumber: string | null;
  transactionTime: string;
}

export function MpesaSettings() {
  const queryClient = useQueryClient();
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [shortcode, setShortcode] = useState("");
  const [shortcodeType, setShortcodeType] = useState<"PAYBILL" | "TILL">("PAYBILL");
  const [storeNumber, setStoreNumber] = useState("");
  const [passkey, setPasskey] = useState("");
  const [environment, setEnvironment] = useState<"sandbox" | "production">("sandbox");
  const [error, setError] = useState<string | null>(null);
  const [matchingId, setMatchingId] = useState<string | null>(null);
  const [matchValue, setMatchValue] = useState("");
  const [matchType, setMatchType] = useState<"invoiceId" | "customerId">("invoiceId");

  const { data: status } = useQuery({
    queryKey: ["mpesa-config"],
    queryFn: () => apiFetch<ConfigStatus>("/api/v1/payments/mpesa/config"),
  });

  const { data: reconciliation } = useQuery({
    queryKey: ["mpesa-reconciliation"],
    queryFn: () => apiFetch<C2BTransaction[]>("/api/v1/payments/mpesa/reconciliation"),
  });

  const saveConfig = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/payments/mpesa/config", {
        method: "PUT",
        body: JSON.stringify({
          consumerKey,
          consumerSecret,
          shortcode,
          shortcodeType,
          storeNumber: shortcodeType === "TILL" ? storeNumber : undefined,
          passkey,
          environment,
        }),
      }),
    onSuccess: () => {
      setConsumerKey("");
      setConsumerSecret("");
      setPasskey("");
      queryClient.invalidateQueries({ queryKey: ["mpesa-config"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to save configuration"),
  });

  const reconcile = useMutation({
    mutationFn: (transactionId: string) =>
      apiFetch(`/api/v1/payments/mpesa/reconciliation/${transactionId}/match`, {
        method: "POST",
        body: JSON.stringify({ [matchType]: matchValue }),
      }),
    onSuccess: () => {
      setMatchingId(null);
      setMatchValue("");
      queryClient.invalidateQueries({ queryKey: ["mpesa-reconciliation"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to reconcile"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
        
          <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-obsidian-900 dark:text-slate-300">
            Only needed if you collect your customers&apos; payments into your own M-Pesa account.
            If the platform collects on your behalf, you need nothing here — just the paybill or
            till number on your <strong>Settlement</strong> page, and you are paid automatically.
          </p>
</div>

        {status?.configured && (
          <Badge variant={status.isActive ? "success" : "warning"}>
            <StatusDot status={status.isActive ? "ONLINE" : "WARNING"} />
            <span>
              {status.environment.toUpperCase()} · {status.shortcodeType === "TILL" ? "Till" : "Paybill"} {status.shortcode}
            </span>
          </Badge>
        )}
      </div>

      <Card>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-slate-900 dark:text-white">Daraja API Credentials</h2>
          <span className="text-xs text-slate-500">AES-256 encrypted at rest</span>
        </div>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Enter your Safaricom Developer Portal credentials below. Passkeys and secrets are stored in encrypted vaults and never revealed in API responses.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            saveConfig.mutate();
          }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          <div>
            <Label htmlFor="consumerKey">Consumer Key</Label>
            <Input id="consumerKey" value={consumerKey} onChange={(e) => setConsumerKey(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="consumerSecret">Consumer Secret</Label>
            <Input
              id="consumerSecret"
              type="password"
              value={consumerSecret}
              onChange={(e) => setConsumerSecret(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="shortcodeType">Account Type</Label>
            <select
              id="shortcodeType"
              className="w-full rounded-lg border border-slate-300/90 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-slate-100"
              value={shortcodeType}
              onChange={(e) => setShortcodeType(e.target.value as "PAYBILL" | "TILL")}
            >
              <option value="PAYBILL">Paybill</option>
              <option value="TILL">Buy Goods (Till)</option>
            </select>
          </div>
          <div>
            <Label htmlFor="shortcode">{shortcodeType === "TILL" ? "Till Number" : "Paybill Number"}</Label>
            <Input
              id="shortcode"
              placeholder={shortcodeType === "TILL" ? "e.g. 5678901" : "e.g. 174379"}
              value={shortcode}
              onChange={(e) => setShortcode(e.target.value)}
              required
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              The number your customers actually pay.
            </p>
          </div>
          {shortcodeType === "TILL" && (
            <div className="sm:col-span-2">
              <Label htmlFor="storeNumber">Head Office / Store Number</Label>
              <Input
                id="storeNumber"
                placeholder="Issued by Safaricom alongside your till"
                value={storeNumber}
                onChange={(e) => setStoreNumber(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Your passkey belongs to this number, not the till, so Safaricom signs the payment
                request with it. Leave blank only if Safaricom issued you a single number for both.
              </p>
            </div>
          )}
          <div>
            <Label htmlFor="passkey">Lipa Na M-Pesa Online Passkey</Label>
            <Input id="passkey" type="password" value={passkey} onChange={(e) => setPasskey(e.target.value)} required />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="environment">Gateway Environment</Label>
            <select
              id="environment"
              className="w-full rounded-lg border border-slate-300/90 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-slate-100"
              value={environment}
              onChange={(e) => setEnvironment(e.target.value as "sandbox" | "production")}
            >
              <option value="sandbox">Sandbox (Testing)</option>
              <option value="production">Production (Live Safaricom)</option>
            </select>
          </div>
          <div className="sm:col-span-2 pt-2">
            <Button type="submit" disabled={saveConfig.isPending}>
              {saveConfig.isPending ? "Encrypting & saving..." : "Save Gateway Configuration"}
            </Button>
          </div>
        </form>
        {error && <ErrorText>{error}</ErrorText>}
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900 dark:text-white">
            Unreconciled Paybill Transactions
          </h2>
          <span className="font-mono text-xs text-slate-500">
            {reconciliation?.length ?? 0} pending matching
          </span>
        </div>
        <div className="space-y-3">
          {reconciliation?.map((txn) => (
            <div
              key={txn.id}
              className="rounded-lg border border-slate-200/90 bg-slate-50/60 p-3.5 text-sm dark:border-obsidian-800 dark:bg-obsidian-950/60"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {txn.transactionId}
                  </span>{" "}
                  · <span className="font-semibold">{formatMoney(txn.amountMinor)}</span> from{" "}
                  <span className="font-mono">{txn.msisdn}</span>
                  {txn.billRefNumber && (
                    <span className="ml-2 rounded bg-slate-200/80 px-1.5 py-0.5 text-xs font-mono dark:bg-obsidian-800">
                      Ref: {txn.billRefNumber}
                    </span>
                  )}
                </div>
                <Button
                  variant="secondary"
                  className="px-3 py-1 text-xs"
                  onClick={() => {
                    setMatchingId(matchingId === txn.id ? null : txn.transactionId);
                    setMatchValue("");
                  }}
                >
                  {matchingId === txn.transactionId ? "Close" : "Manual Match"}
                </Button>
              </div>

              {matchingId === txn.transactionId && (
                <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-200/80 pt-3 dark:border-obsidian-800">
                  <select
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-obsidian-700 dark:bg-obsidian-900"
                    value={matchType}
                    onChange={(e) => setMatchType(e.target.value as "invoiceId" | "customerId")}
                  >
                    <option value="invoiceId">Match to Invoice ID</option>
                    <option value="customerId">Match to Customer ID</option>
                  </select>
                  <Input
                    value={matchValue}
                    onChange={(e) => setMatchValue(e.target.value)}
                    placeholder="Enter target UUID..."
                    className="text-xs max-w-xs"
                  />
                  <Button
                    disabled={!matchValue || reconcile.isPending}
                    className="text-xs py-1.5"
                    onClick={() => {
                      setError(null);
                      reconcile.mutate(txn.transactionId);
                    }}
                  >
                    {reconcile.isPending ? "Matching..." : "Confirm Reconciliation"}
                  </Button>
                </div>
              )}
            </div>
          ))}

          {reconciliation && reconciliation.length === 0 && (
            <div className="p-6 text-center text-xs text-slate-500">
              <IconCheck size={20} className="mx-auto text-emerald-500 mb-1" />
              All incoming M-Pesa payments are reconciled with subscriber accounts.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
