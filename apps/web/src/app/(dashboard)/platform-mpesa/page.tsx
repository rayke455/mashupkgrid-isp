"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Button, Card, ErrorText, HintText, Input, Label, Badge, StatusDot } from "@/components/ui";
import { IconMpesa } from "@/components/icons";

interface ConfigStatus {
  configured: boolean;
  isActive: boolean;
  shortcode: string | null;
  environment: string;
  /** Whether tenant payouts are possible at all. Never carries the credential itself. */
  b2b: { configured: boolean; initiatorName: string | null };
}

export default function PlatformMpesaPage() {
  const queryClient = useQueryClient();
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [shortcode, setShortcode] = useState("");
  const [passkey, setPasskey] = useState("");
  const [environment, setEnvironment] = useState<"sandbox" | "production">("sandbox");
  const [initiatorName, setInitiatorName] = useState("");
  const [initiatorCredential, setInitiatorCredential] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: status } = useQuery({
    queryKey: ["platform-mpesa-config"],
    queryFn: () => apiFetch<ConfigStatus>("/api/v1/payments/mpesa/platform-config"),
  });

  const saveConfig = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/payments/mpesa/platform-config", {
        method: "PUT",
        body: JSON.stringify({
          consumerKey,
          consumerSecret,
          shortcode,
          passkey,
          environment,
          // Sent only when filled in: saving collection settings must not wipe payout
          // credentials entered on a previous visit.
          ...(initiatorName.trim() ? { initiatorName: initiatorName.trim() } : {}),
          ...(initiatorCredential.trim() ? { initiatorCredential: initiatorCredential.trim() } : {}),
        }),
      }),
    onSuccess: () => {
      setConsumerKey("");
      setConsumerSecret("");
      setPasskey("");
      setInitiatorCredential("");
      queryClient.invalidateQueries({ queryKey: ["platform-mpesa-config"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to save configuration"),
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <IconMpesa size={20} />
            </span>
            Platform M-Pesa (Onboarding Fees)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            MASHUPKGRID&apos;s own Daraja credentials — used only to collect the KES 450 onboarding
            fee from new tenants. Separate from any tenant&apos;s own paybill.
          </p>
        </div>
        {status?.configured && (
          <Badge variant={status.isActive ? "success" : "warning"}>
            <StatusDot status={status.isActive ? "ONLINE" : "WARNING"} />
            <span>{status.environment.toUpperCase()} · {status.shortcode}</span>
          </Badge>
        )}
      </div>

      <Card>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-slate-900 dark:text-white">Daraja API Credentials</h2>
          <span className="text-xs text-slate-500">AES-256 encrypted at rest</span>
        </div>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          This is a single, platform-wide config — not per-tenant. Every new tenant&apos;s onboarding
          fee STK push goes through this paybill/till.
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
            <Label htmlFor="shortcode">Business Shortcode / Paybill</Label>
            <Input id="shortcode" placeholder="e.g. 174379" value={shortcode} onChange={(e) => setShortcode(e.target.value)} required />
          </div>
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
            <HintText>Onboarding fees will not be collectable until this is configured and active.</HintText>
          </div>

          {/* Paying tenants out is a separate Daraja product with its own approval, so it gets
              its own section rather than being mixed into the collection fields above. */}
          <div className="sm:col-span-2 rounded-xl border border-slate-200 p-4 dark:border-obsidian-800">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Tenant payouts (B2B)
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Required only for tenants whose payments you collect on their behalf.
                </p>
              </div>
              <Badge variant={status?.b2b?.configured ? "success" : "neutral"}>
                {status?.b2b?.configured ? "Ready" : "Not configured"}
              </Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="initiatorName">Initiator name</Label>
                <Input
                  id="initiatorName"
                  placeholder={status?.b2b?.initiatorName ?? "The Daraja API user allowed to move money"}
                  value={initiatorName}
                  onChange={(e) => setInitiatorName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="initiatorCredential">Security credential</Label>
                <Input
                  id="initiatorCredential"
                  type="password"
                  placeholder={status?.b2b?.configured ? "Saved — enter a new one to replace" : "Certificate-encrypted password"}
                  value={initiatorCredential}
                  onChange={(e) => setInitiatorCredential(e.target.value)}
                />
              </div>
            </div>
            <HintText>
              The security credential is your initiator password already encrypted with Safaricom&apos;s
              public certificate — generate it on the Daraja portal and paste the result. Leave both
              blank to keep what is saved.
            </HintText>
          </div>

          <div className="sm:col-span-2 pt-2">
            <Button type="submit" disabled={saveConfig.isPending}>
              {saveConfig.isPending ? "Encrypting & saving..." : "Save Platform Configuration"}
            </Button>
          </div>
        </form>
        {error && <ErrorText>{error}</ErrorText>}
      </Card>
    </div>
  );
}
