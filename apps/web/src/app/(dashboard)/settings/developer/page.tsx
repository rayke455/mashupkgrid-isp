"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Button, Card, ErrorText, HintText, Input, Label, Badge } from "@/components/ui";
import { IconKey, IconWebhook, IconCopy, IconCheck } from "@/components/icons";

interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdBy: { email: string | null } | null;
}

interface WebhookRow {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  isActive: boolean;
  lastTriggeredAt: string | null;
  lastStatusCode: number | null;
  consecutiveFailures: number;
  createdAt: string;
}

interface WebhookDelivery {
  id: string;
  eventType: string;
  statusCode: number | null;
  success: boolean;
  errorMessage: string | null;
  attemptedAt: string;
}

const COMMON_SCOPES = [
  "customers.read",
  "billing.read",
  "payments.read",
  "packages.read",
  "reports.read",
  "routers.read",
  "wallet.read",
];

function formatDate(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString();
}

export default function DeveloperSettingsPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>([]);
  const [fullAccess, setFullAccess] = useState(true);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);

  const [showWebhookForm, setShowWebhookForm] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookDescription, setWebhookDescription] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<string[]>([]);
  const [revealedSecret, setRevealedSecret] = useState<{ id: string; secret: string } | null>(null);
  const [deliveriesFor, setDeliveriesFor] = useState<string | null>(null);

  const { data: apiKeys, isLoading: keysLoading } = useQuery({
    queryKey: ["developer-api-keys"],
    queryFn: () => apiFetch<ApiKeyRow[]>("/api/v1/developer/api-keys"),
  });

  const { data: webhooks, isLoading: webhooksLoading } = useQuery({
    queryKey: ["developer-webhooks"],
    queryFn: () => apiFetch<WebhookRow[]>("/api/v1/developer/webhooks"),
  });

  const { data: eventCatalog } = useQuery({
    queryKey: ["developer-webhook-events"],
    queryFn: () => apiFetch<string[]>("/api/v1/developer/webhooks/events"),
  });

  const { data: deliveries } = useQuery({
    queryKey: ["developer-webhook-deliveries", deliveriesFor],
    queryFn: () => apiFetch<WebhookDelivery[]>(`/api/v1/developer/webhooks/${deliveriesFor}/deliveries`),
    enabled: deliveriesFor !== null,
    refetchInterval: deliveriesFor !== null ? 5000 : false,
  });

  const createKey = useMutation({
    mutationFn: () =>
      apiFetch<ApiKeyRow & { token: string }>("/api/v1/developer/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: newKeyName, scopes: fullAccess ? undefined : newKeyScopes }),
      }),
    onSuccess: (result) => {
      setRevealedToken(result.token);
      setNewKeyName("");
      setNewKeyScopes([]);
      setFullAccess(true);
      queryClient.invalidateQueries({ queryKey: ["developer-api-keys"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to create API key"),
  });

  const revokeKey = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/developer/api-keys/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["developer-api-keys"] }),
  });

  const createWebhook = useMutation({
    mutationFn: () =>
      apiFetch<WebhookRow & { secret: string }>("/api/v1/developer/webhooks", {
        method: "POST",
        body: JSON.stringify({
          url: webhookUrl,
          description: webhookDescription || null,
          events: webhookEvents,
        }),
      }),
    onSuccess: (result) => {
      setRevealedSecret({ id: result.id, secret: result.secret });
      setWebhookUrl("");
      setWebhookDescription("");
      setWebhookEvents([]);
      setShowWebhookForm(false);
      queryClient.invalidateQueries({ queryKey: ["developer-webhooks"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to create webhook"),
  });

  const toggleWebhook = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiFetch(`/api/v1/developer/webhooks/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["developer-webhooks"] }),
  });

  const deleteWebhook = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/developer/webhooks/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["developer-webhooks"] }),
  });

  const testWebhook = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/developer/webhooks/${id}/test`, { method: "POST" }),
    onSuccess: (_result, id) => setDeliveriesFor(id),
  });

  const revealSecret = useMutation({
    mutationFn: (id: string) => apiFetch<{ secret: string }>(`/api/v1/developer/webhooks/${id}/secret`),
    onSuccess: (result, id) => setRevealedSecret({ id, secret: result.secret }),
  });

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Developer</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          API tokens for external clients, and webhooks for outbound event delivery.
        </p>
      </div>

      {error && <ErrorText>{error}</ErrorText>}

      {/* --- API Tokens --- */}
      <Card>
        <div className="mb-4 flex items-center gap-2">
          <IconKey className="text-brand-600 dark:text-brand-400" />
          <h3 className="font-semibold text-slate-900 dark:text-white">API tokens</h3>
        </div>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          A token authenticates as the staff member who created it — send it as{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-obsidian-800">
            Authorization: Bearer mkg_...
          </code>{" "}
          against any API route their role can already reach.
        </p>

        {revealedToken && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/30">
            <p className="mb-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
              Copy this token now — it won&apos;t be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-white px-2 py-1.5 font-mono text-xs dark:bg-obsidian-950">
                {revealedToken}
              </code>
              <Button
                variant="secondary"
                className="px-2.5 py-1.5 text-xs gap-1"
                onClick={() => handleCopy(revealedToken, "token")}
              >
                {copied === "token" ? <IconCheck size={12} /> : <IconCopy size={12} />}
                {copied === "token" ? "Copied" : "Copy"}
              </Button>
              <Button variant="secondary" className="px-2.5 py-1.5 text-xs" onClick={() => setRevealedToken(null)}>
                Dismiss
              </Button>
            </div>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            createKey.mutate();
          }}
          className="mb-5 space-y-3 rounded-lg border border-slate-200 p-3.5 dark:border-obsidian-800"
        >
          <div>
            <Label htmlFor="keyName">Key name</Label>
            <Input
              id="keyName"
              placeholder="e.g. claude-desktop — so you know which one to revoke"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="fullAccess"
              type="checkbox"
              checked={fullAccess}
              onChange={(e) => setFullAccess(e.target.checked)}
              className="h-4 w-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300 dark:border-obsidian-700"
            />
            <Label htmlFor="fullAccess" className="!mb-0 cursor-pointer">
              Full access (same permissions as your account)
            </Label>
          </div>
          {!fullAccess && (
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {COMMON_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={newKeyScopes.includes(scope)}
                    onChange={(e) =>
                      setNewKeyScopes((prev) =>
                        e.target.checked ? [...prev, scope] : prev.filter((s) => s !== scope)
                      )
                    }
                    className="h-3.5 w-3.5 rounded text-brand-600 focus:ring-brand-500 border-slate-300 dark:border-obsidian-700"
                  />
                  <code className="font-mono">{scope}</code>
                </label>
              ))}
            </div>
          )}
          <Button type="submit" disabled={createKey.isPending} className="text-sm">
            {createKey.isPending ? "Creating..." : "Create key"}
          </Button>
        </form>

        {keysLoading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : apiKeys && apiKeys.length > 0 ? (
          <div className="space-y-2">
            {apiKeys.map((key) => (
              <div
                key={key.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-obsidian-800"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{key.name}</p>
                    {key.revokedAt && <Badge variant="danger">Revoked</Badge>}
                  </div>
                  <p className="font-mono text-xs text-slate-500">
                    {key.keyPrefix}... · created by {key.createdBy?.email ?? "unknown"} · last used{" "}
                    {formatDate(key.lastUsedAt)}
                  </p>
                  {key.scopes.length > 0 && (
                    <p className="mt-1 text-[11px] text-slate-400">scopes: {key.scopes.join(", ")}</p>
                  )}
                </div>
                {!key.revokedAt && (
                  <Button
                    variant="danger"
                    className="shrink-0 px-3 py-1.5 text-xs"
                    onClick={() => {
                      if (confirm(`Revoke "${key.name}"? Any client using it will stop working immediately.`)) {
                        revokeKey.mutate(key.id);
                      }
                    }}
                  >
                    Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No tokens yet.</p>
        )}
      </Card>

      {/* --- Webhooks --- */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconWebhook className="text-brand-600 dark:text-brand-400" />
            <h3 className="font-semibold text-slate-900 dark:text-white">Webhooks</h3>
          </div>
          <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setShowWebhookForm((v) => !v)}>
            {showWebhookForm ? "Cancel" : "+ Add endpoint"}
          </Button>
        </div>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Forward platform events to your own endpoint. Every payload is signed — verify it with the{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-obsidian-800">X-Mkg-Signature</code>{" "}
          header (HMAC-SHA256 over the raw body, using the secret shown when you create the endpoint).
        </p>

        {revealedSecret && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/30">
            <p className="mb-2 text-xs font-semibold text-amber-800 dark:text-amber-300">Signing secret</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-white px-2 py-1.5 font-mono text-xs dark:bg-obsidian-950">
                {revealedSecret.secret}
              </code>
              <Button
                variant="secondary"
                className="px-2.5 py-1.5 text-xs gap-1"
                onClick={() => handleCopy(revealedSecret.secret, "secret")}
              >
                {copied === "secret" ? <IconCheck size={12} /> : <IconCopy size={12} />}
                {copied === "secret" ? "Copied" : "Copy"}
              </Button>
              <Button variant="secondary" className="px-2.5 py-1.5 text-xs" onClick={() => setRevealedSecret(null)}>
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {showWebhookForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              createWebhook.mutate();
            }}
            className="mb-5 space-y-3 rounded-lg border border-slate-200 p-3.5 dark:border-obsidian-800"
          >
            <div>
              <Label htmlFor="webhookUrl">Endpoint URL</Label>
              <Input
                id="webhookUrl"
                type="url"
                placeholder="https://your-app.com/webhooks/mashupkgrid"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="webhookDescription">Description (optional)</Label>
              <Input
                id="webhookDescription"
                placeholder="e.g. Sync payments to our accounting system"
                value={webhookDescription}
                onChange={(e) => setWebhookDescription(e.target.value)}
              />
            </div>
            <div>
              <Label>Events</Label>
              <div className="flex flex-wrap gap-3">
                {(eventCatalog ?? []).map((eventType) => (
                  <label key={eventType} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                    <input
                      type="checkbox"
                      checked={webhookEvents.includes(eventType)}
                      onChange={(e) =>
                        setWebhookEvents((prev) =>
                          e.target.checked ? [...prev, eventType] : prev.filter((s) => s !== eventType)
                        )
                      }
                      className="h-3.5 w-3.5 rounded text-brand-600 focus:ring-brand-500 border-slate-300 dark:border-obsidian-700"
                    />
                    <code className="font-mono">{eventType}</code>
                  </label>
                ))}
              </div>
            </div>
            <Button type="submit" disabled={createWebhook.isPending || webhookEvents.length === 0} className="text-sm">
              {createWebhook.isPending ? "Creating..." : "Create endpoint"}
            </Button>
          </form>
        )}

        {webhooksLoading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : webhooks && webhooks.length > 0 ? (
          <div className="space-y-2">
            {webhooks.map((hook) => (
              <div key={hook.id} className="rounded-lg border border-slate-200 p-3 dark:border-obsidian-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-mono text-sm font-semibold text-slate-900 dark:text-white">
                        {hook.url}
                      </p>
                      <Badge variant={hook.isActive ? "success" : "neutral"}>
                        {hook.isActive ? "Active" : "Disabled"}
                      </Badge>
                      {hook.consecutiveFailures >= 3 && <Badge variant="danger">Failing</Badge>}
                    </div>
                    {hook.description && <p className="text-xs text-slate-500">{hook.description}</p>}
                    <p className="mt-1 text-[11px] text-slate-400">
                      events: {hook.events.join(", ")} · last triggered {formatDate(hook.lastTriggeredAt)}
                      {hook.lastStatusCode !== null ? ` (HTTP ${hook.lastStatusCode})` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    <Button
                      variant="secondary"
                      className="px-2.5 py-1 text-xs"
                      onClick={() => revealSecret.mutate(hook.id)}
                    >
                      Reveal secret
                    </Button>
                    <Button
                      variant="secondary"
                      className="px-2.5 py-1 text-xs"
                      onClick={() => testWebhook.mutate(hook.id)}
                      disabled={testWebhook.isPending}
                    >
                      Send test
                    </Button>
                    <Button
                      variant="secondary"
                      className="px-2.5 py-1 text-xs"
                      onClick={() => setDeliveriesFor(deliveriesFor === hook.id ? null : hook.id)}
                    >
                      {deliveriesFor === hook.id ? "Hide log" : "Delivery log"}
                    </Button>
                    <Button
                      variant="secondary"
                      className="px-2.5 py-1 text-xs"
                      onClick={() => toggleWebhook.mutate({ id: hook.id, isActive: !hook.isActive })}
                    >
                      {hook.isActive ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      variant="danger"
                      className="px-2.5 py-1 text-xs"
                      onClick={() => {
                        if (confirm("Delete this webhook endpoint?")) deleteWebhook.mutate(hook.id);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>

                {deliveriesFor === hook.id && (
                  <div className="mt-3 border-t border-slate-100 pt-3 dark:border-obsidian-800">
                    {deliveries && deliveries.length > 0 ? (
                      <table className="w-full text-left text-xs">
                        <thead className="text-slate-500 dark:text-slate-400">
                          <tr>
                            <th className="py-1 font-medium">Event</th>
                            <th className="py-1 font-medium">Status</th>
                            <th className="py-1 font-medium">Attempted</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-obsidian-800">
                          {deliveries.map((d) => (
                            <tr key={d.id}>
                              <td className="py-1 font-mono">{d.eventType}</td>
                              <td className="py-1">
                                {d.success ? (
                                  <span className="text-emerald-600 dark:text-emerald-400">
                                    {d.statusCode ?? "OK"}
                                  </span>
                                ) : (
                                  <span className="text-rose-600 dark:text-rose-400">
                                    {d.statusCode ?? "failed"} {d.errorMessage ? `— ${d.errorMessage}` : ""}
                                  </span>
                                )}
                              </td>
                              <td className="py-1 font-mono">{formatDate(d.attemptedAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-xs text-slate-500">No deliveries yet.</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No webhook endpoints yet.</p>
        )}
      </Card>
    </div>
  );
}
