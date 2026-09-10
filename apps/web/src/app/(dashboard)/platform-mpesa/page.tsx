"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Button, Card, ErrorText, HintText, Input, Label, Badge, StatusDot } from "@/components/ui";
import { IconMpesa } from "@/components/icons";
import { useAuth } from "@/lib/auth-context";

interface ConfigStatus {
  configured: boolean;
  isActive: boolean;
  shortcode: string | null;
  environment: string;
  donateEnabled?: boolean;
  donatePaybill?: string | null;
  donateAccountReference?: string | null;
  /** Whether tenant payouts are possible at all. Never carries the credential itself. */
  b2b: { configured: boolean; initiatorName: string | null };
}

export default function PlatformMpesaPage() {
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    // If a tenant tries to access platform M-Pesa, redirect them to their own payment setup
    if (user?.tenantId) {
      router.replace("/payments-setup");
    }
  }, [user, router]);

  // Platform Daraja credentials
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [shortcode, setShortcode] = useState("");
  const [passkey, setPasskey] = useState("");
  const [environment, setEnvironment] = useState<"sandbox" | "production">("sandbox");
  const [initiatorName, setInitiatorName] = useState("");
  const [initiatorCredential, setInitiatorCredential] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Donate / "Buy Me a Coffee" gateway settings
  const [donateEnabled, setDonateEnabled] = useState(false);
  const [donatePaybill, setDonatePaybill] = useState("");
  const [donateAccountReference, setDonateAccountReference] = useState("COFFEE");
  const [donateSaved, setDonateSaved] = useState(false);
  const [donateError, setDonateError] = useState<string | null>(null);

  const { data: status } = useQuery({
    queryKey: ["platform-mpesa-config"],
    queryFn: () => apiFetch<ConfigStatus>("/api/v1/payments/mpesa/platform-config"),
    enabled: !user?.tenantId,
  });

  useEffect(() => {
    if (status) {
      setDonateEnabled(Boolean(status.donateEnabled));
      setDonatePaybill(status.donatePaybill ?? "");
      setDonateAccountReference(status.donateAccountReference ?? "COFFEE");
    }
  }, [status]);

  const saveConfig = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/payments/mpesa/platform-config", {
        method: "PUT",
        body: JSON.stringify({
          ...(consumerKey.trim() ? { consumerKey: consumerKey.trim() } : {}),
          ...(consumerSecret.trim() ? { consumerSecret: consumerSecret.trim() } : {}),
          ...(shortcode.trim() ? { shortcode: shortcode.trim() } : {}),
          ...(passkey.trim() ? { passkey: passkey.trim() } : {}),
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

  const saveDonateConfig = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/payments/mpesa/platform-config", {
        method: "PUT",
        body: JSON.stringify({
          donateEnabled,
          donatePaybill: donatePaybill.trim(),
          donateAccountReference: donateAccountReference.trim() || "COFFEE",
        }),
      }),
    onSuccess: () => {
      setDonateError(null);
      setDonateSaved(true);
      setTimeout(() => setDonateSaved(false), 3500);
      queryClient.invalidateQueries({ queryKey: ["platform-mpesa-config"] });
    },
    onError: (err) =>
      setDonateError(err instanceof ApiRequestError ? err.message : "Failed to save donate settings"),
  });

  if (user?.tenantId) {
    return null;
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <IconMpesa size={20} />
            </span>
            Platform M-Pesa &amp; Gateways
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            MASHUPKGRID&apos;s platform Daraja credentials for onboarding fees, tenant payouts, and public donation gateway.
          </p>
        </div>
        {status?.configured && (
          <Badge variant={status.isActive ? "success" : "warning"}>
            <StatusDot status={status.isActive ? "ONLINE" : "WARNING"} />
            <span>{status.environment.toUpperCase()} · {status.shortcode}</span>
          </Badge>
        )}
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* 1. Donate / Buy Me a Coffee Gateway Configuration                   */}
      {/* ------------------------------------------------------------------- */}
      <Card className="border-amber-500/20 bg-gradient-to-br from-white via-white to-amber-500/[0.03] dark:from-obsidian-900 dark:via-obsidian-900 dark:to-amber-500/[0.05]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xl font-bold">
              ☕
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-slate-900 dark:text-white">
                  Donate Section M-Pesa Gateway
                </h2>
                <Badge variant={donateEnabled ? "success" : "neutral"}>
                  {donateEnabled ? "Active" : "Disabled"}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configure M-Pesa tips &amp; donations collected via the public{" "}
                <code className="text-amber-600 dark:text-amber-400 font-mono font-semibold">/donate</code> page.
              </p>
            </div>
          </div>
          <a
            href="/donate"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400 hover:underline font-medium self-start sm:self-center"
          >
            Preview Live /donate ↗
          </a>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setDonateError(null);
            saveDonateConfig.mutate();
          }}
          className="space-y-4 pt-2"
        >
          {/* Toggle Switch */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-obsidian-800 dark:bg-obsidian-950/60">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Enable M-Pesa Donations
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                When enabled, visitors on the donate page can send tips instantly via 1-tap M-Pesa STK Push.
              </p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={donateEnabled}
                onChange={(e) => setDonateEnabled(e.target.checked)}
              />
              <div className="h-6 w-11 rounded-full bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-500 dark:bg-obsidian-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-obsidian-600 peer-checked:bg-emerald-500"></div>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="donatePaybill">Donate Paybill / Till Number</Label>
              <Input
                id="donatePaybill"
                placeholder={status?.shortcode ? `Default: ${status.shortcode}` : "e.g. 247247 or Till"}
                value={donatePaybill}
                onChange={(e) => setDonatePaybill(e.target.value)}
              />
              <HintText>
                Leave blank to automatically use the platform shortcode ({status?.shortcode ?? "not set yet"}).
              </HintText>
            </div>

            <div>
              <Label htmlFor="donateAccountReference">M-Pesa Account Reference</Label>
              <Input
                id="donateAccountReference"
                placeholder="COFFEE"
                value={donateAccountReference}
                onChange={(e) => setDonateAccountReference(e.target.value)}
              />
              <HintText>The reference shown on donor&apos;s phone (e.g. COFFEE, DONATE, TIP).</HintText>
            </div>
          </div>

          {/* Live Preview Box */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 text-xs space-y-1.5">
            <div className="flex items-center justify-between font-semibold text-amber-800 dark:text-amber-300">
              <span>Visitor Experience Preview</span>
              <span className={donateEnabled ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}>
                {donateEnabled ? "● STK Push Live" : "○ STK Disabled"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-slate-700 dark:text-slate-300 font-medium">
              <div>
                <span className="text-slate-400">Paybill: </span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {donatePaybill.trim() || status?.shortcode || "Not configured"}
                </span>
              </div>
              <div>
                <span className="text-slate-400">Account: </span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {donateAccountReference.trim() || "COFFEE"}
                </span>
              </div>
              <div>
                <span className="text-slate-400">STK Processing: </span>
                <span className={status?.configured ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-amber-600 font-semibold"}>
                  {status?.configured ? "Platform Daraja Gateway" : "Requires Platform Credentials"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <Button type="submit" disabled={saveDonateConfig.isPending}>
              {saveDonateConfig.isPending ? "Saving..." : "Save Donate Configuration"}
            </Button>
            {donateSaved && (
              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                ✓ Donate configuration saved!
              </span>
            )}
          </div>
          {donateError && <ErrorText>{donateError}</ErrorText>}
        </form>
      </Card>

      {/* ------------------------------------------------------------------- */}
      {/* 2. Platform Daraja Credentials                                      */}
      {/* ------------------------------------------------------------------- */}
      <Card>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-slate-900 dark:text-white">Daraja API Credentials</h2>
          <span className="text-xs text-slate-500">AES-256 encrypted at rest</span>
        </div>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          This is a single, platform-wide config — not per-tenant. Every new tenant&apos;s onboarding
          fee STK push and public donation STK push goes through this gateway.
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
            <Input
              id="consumerKey"
              placeholder={status?.configured ? "Saved — enter a new one to replace" : "Daraja consumer key"}
              value={consumerKey}
              onChange={(e) => setConsumerKey(e.target.value)}
              required={!status?.configured}
            />
          </div>
          <div>
            <Label htmlFor="consumerSecret">Consumer Secret</Label>
            <Input
              id="consumerSecret"
              type="password"
              placeholder={status?.configured ? "Saved — enter a new one to replace" : "Daraja consumer secret"}
              value={consumerSecret}
              onChange={(e) => setConsumerSecret(e.target.value)}
              required={!status?.configured}
            />
          </div>
          <div>
            <Label htmlFor="shortcode">Business Shortcode / Paybill</Label>
            <Input
              id="shortcode"
              placeholder={status?.shortcode ?? "e.g. 174379"}
              value={shortcode}
              onChange={(e) => setShortcode(e.target.value)}
              required={!status?.configured}
            />
          </div>
          <div>
            <Label htmlFor="passkey">Lipa Na M-Pesa Online Passkey</Label>
            <Input
              id="passkey"
              type="password"
              placeholder={status?.configured ? "Saved — enter a new one to replace" : "Lipa Na M-Pesa passkey"}
              value={passkey}
              onChange={(e) => setPasskey(e.target.value)}
              required={!status?.configured}
            />
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

          {/* Tenant payouts (B2B) */}
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
