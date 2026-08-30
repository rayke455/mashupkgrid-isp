"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Button, Card, ErrorText, HintText, Input, Label, Badge, StatusDot } from "@/components/ui";
import { IconInvoice } from "@/components/icons";

interface PaystackConfigStatus {
  configured: boolean;
  isActive: boolean;
  publicKey: string | null;
}

export default function PaystackPage() {
  const queryClient = useQueryClient();
  const [secretKey, setSecretKey] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: status } = useQuery({
    queryKey: ["paystack-config"],
    queryFn: () => apiFetch<PaystackConfigStatus>("/api/v1/payments/paystack/config"),
  });

  const saveConfig = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/payments/paystack/config", {
        method: "PUT",
        body: JSON.stringify({ secretKey, publicKey: publicKey || undefined }),
      }),
    onSuccess: () => {
      setSecretKey("");
      queryClient.invalidateQueries({ queryKey: ["paystack-config"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to save configuration"),
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400">
              <IconInvoice size={18} />
            </span>
            Paystack
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Card, bank, and mobile money payments across Africa via Paystack.
          </p>
        </div>
        {status?.configured && (
          <Badge variant={status.isActive ? "success" : "warning"}>
            <StatusDot status={status.isActive ? "ONLINE" : "WARNING"} />
            <span>{status.isActive ? "Active" : "Inactive"}</span>
          </Badge>
        )}
      </div>

      <Card>
        <h2 className="mb-2 font-semibold text-slate-900 dark:text-white">Paystack API Keys</h2>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          From your Paystack dashboard&apos;s Settings → API Keys &amp; Webhooks. The secret key is
          encrypted at rest and never shown again — use a test key (<code>sk_test_...</code>)
          while you&apos;re setting things up.
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
            <Label htmlFor="secretKey">Secret Key</Label>
            <Input
              id="secretKey"
              type="password"
              placeholder="sk_test_..."
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="publicKey">Public Key (optional)</Label>
            <Input
              id="publicKey"
              placeholder="pk_test_..."
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
            />
            <HintText>Not required to initiate payments from this dashboard — only needed for a client-side checkout widget.</HintText>
          </div>
          <Button type="submit" disabled={saveConfig.isPending}>
            {saveConfig.isPending ? "Saving..." : "Save configuration"}
          </Button>
        </form>
        {error && <ErrorText>{error}</ErrorText>}
      </Card>

      {status?.configured && (
        <Card>
          <h2 className="mb-2 font-semibold text-slate-900 dark:text-white">Webhook URL</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Add this URL in your Paystack dashboard&apos;s Settings → API Keys &amp; Webhooks so
            payment confirmations arrive automatically:
          </p>
          <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs dark:bg-obsidian-800">
            {typeof window !== "undefined" ? window.location.origin.replace("3000", "4000") : ""}
            /api/v1/payments/paystack/webhook
          </p>
        </Card>
      )}
    </div>
  );
}
