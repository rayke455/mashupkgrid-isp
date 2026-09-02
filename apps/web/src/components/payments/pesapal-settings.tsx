"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Button, Card, ErrorText, HintText, Input, Label, Badge, StatusDot } from "@/components/ui";

interface PesapalConfigStatus {
  configured: boolean;
  isActive: boolean;
  consumerKey: string | null;
  environment: "live" | "sandbox";
}

export function PesapalSettings() {
  const queryClient = useQueryClient();
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [environment, setEnvironment] = useState<"live" | "sandbox">("sandbox");
  const [error, setError] = useState<string | null>(null);
  const [ipnStatusMessage, setIpnStatusMessage] = useState<string | null>(null);

  const { data: status } = useQuery({
    queryKey: ["pesapal-config"],
    queryFn: () => apiFetch<PesapalConfigStatus>("/api/v1/payments/pesapal/config"),
  });

  const saveConfig = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/payments/pesapal/config", {
        method: "PUT",
        body: JSON.stringify({
          consumerKey,
          consumerSecret,
          environment,
          isActive: true,
        }),
      }),
    onSuccess: () => {
      setConsumerSecret("");
      queryClient.invalidateQueries({ queryKey: ["pesapal-config"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to save configuration"),
  });

  const registerIpnMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ipnId: string; url: string }>("/api/v1/payments/pesapal/ipn/register", {
        method: "POST",
      }),
    onSuccess: (data) => {
      setIpnStatusMessage(`IPN Registered successfully! IPN ID: ${data.ipnId}`);
    },
    onError: (err) => {
      setError(err instanceof ApiRequestError ? err.message : "Failed to register IPN with Pesapal");
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
        </div>
        {status?.configured && (
          <Badge variant={status.isActive ? "success" : "warning"}>
            <StatusDot status={status.isActive ? "ONLINE" : "WARNING"} />
            <span>{status.isActive ? "Active" : "Inactive"}</span>
          </Badge>
        )}
      </div>

      <Card>
        <h2 className="mb-2 font-semibold text-slate-900 dark:text-white">Pesapal v3 API Credentials</h2>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Obtain your Consumer Key and Consumer Secret from your Pesapal Merchant Dashboard (Settings → API Credentials).
          Credentials are encrypted at rest with AES-256-GCM.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            saveConfig.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="consumerKey">Consumer Key</Label>
            <Input
              id="consumerKey"
              placeholder="e.g. bK7u83h9... or test credentials"
              value={consumerKey}
              onChange={(e) => setConsumerKey(e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="consumerSecret">Consumer Secret</Label>
            <Input
              id="consumerSecret"
              type="password"
              placeholder="••••••••••••••••••••••••"
              value={consumerSecret}
              onChange={(e) => setConsumerSecret(e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="environment">Gateway Environment</Label>
            <select
              id="environment"
              value={environment}
              onChange={(e) => setEnvironment(e.target.value as "live" | "sandbox")}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-obsidian-700 dark:bg-obsidian-900 dark:text-white"
            >
              <option value="sandbox">Sandbox (Testing / Cybqa)</option>
              <option value="live">Live (Production)</option>
            </select>
            <HintText>Select Sandbox while testing in development, or Live for real payments.</HintText>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={saveConfig.isPending}>
              {saveConfig.isPending ? "Saving..." : "Save & Activate Pesapal"}
            </Button>
          </div>
        </form>

        {error && <ErrorText>{error}</ErrorText>}
      </Card>

      {status?.configured && (
        <Card>
          <h2 className="mb-2 font-semibold text-slate-900 dark:text-white">IPN (Instant Payment Notification)</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Pesapal notifies this URL automatically when customers complete payments.
          </p>
          <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs dark:bg-obsidian-800">
            {typeof window !== "undefined" ? window.location.origin.replace("3000", "4000") : ""}
            /api/v1/payments/pesapal/ipn
          </p>

          <div className="mt-4">
            <Button
              type="button"
              variant="secondary"
              disabled={registerIpnMutation.isPending}
              onClick={() => {
                setError(null);
                setIpnStatusMessage(null);
                registerIpnMutation.mutate();
              }}
            >
              {registerIpnMutation.isPending ? "Registering IPN..." : "Auto-Register IPN with Pesapal"}
            </Button>
            {ipnStatusMessage && (
              <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                {ipnStatusMessage}
              </p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
