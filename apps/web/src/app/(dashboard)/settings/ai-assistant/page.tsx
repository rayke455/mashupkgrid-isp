"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Button, Card, ErrorText, HintText, Input, Label, Badge, StatusDot } from "@/components/ui";
import { tr } from "@/lib/tr";

interface AiAssistantConfigStatus {
  configured: boolean;
  isActive: boolean;
}

export default function AiAssistantSettingsPage() {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: status } = useQuery({
    queryKey: ["ai-assistant-config"],
    queryFn: () => apiFetch<AiAssistantConfigStatus>("/api/v1/ai-assistant/config"),
  });

  const saveConfig = useMutation({
    mutationFn: () => apiFetch("/api/v1/ai-assistant/config", { method: "PUT", body: JSON.stringify({ apiKey }) }),
    onSuccess: () => {
      setApiKey("");
      queryClient.invalidateQueries({ queryKey: ["ai-assistant-config"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to save configuration"),
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            {tr("AI assistant")}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {tr("Lets you manage hotspot packages by describing changes in plain language, from the Hotspot Vouchers page.")}
          </p>
        </div>
        {status?.configured && (
          <Badge variant={status.isActive ? "success" : "warning"}>
            <StatusDot status={status.isActive ? "ONLINE" : "WARNING"} />
            <span>{status.isActive ? "Active" : "Disabled"}</span>
          </Badge>
        )}
      </div>

      <Card>
        <h2 className="mb-2 font-semibold text-slate-900 dark:text-white">{tr("Anthropic API key")}</h2>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Your own key from{" "}
          <span className="font-mono">console.anthropic.com</span> — this platform never uses its own key on your
          behalf, so usage is billed to your account. Encrypted at rest and never shown again once saved.
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
            <Label htmlFor="apiKey">{tr("API key")}</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="sk-ant-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required
            />
            <HintText>{tr("Needs at least one available Claude model on your account.")}</HintText>
          </div>
          <Button type="submit" disabled={saveConfig.isPending}>
            {saveConfig.isPending ? "Saving..." : "Save key"}
          </Button>
          {error && <ErrorText>{error}</ErrorText>}
        </form>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold text-slate-900 dark:text-white">{tr("What it can do")}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Once configured, open the <span className="font-medium text-slate-700 dark:text-slate-300">{tr("Hotspot Vouchers")}</span>{" "}
          page and use the assistant panel there to create, change, or deactivate hotspot packages by describing
          what you want — e.g. &quot;add a 2 hour package for KES 50&quot; or &quot;raise the daily plan to KES
          150&quot;. Every action it takes goes through the same package tools the dashboard itself uses, and is
          logged in the audit trail like any other change.
        </p>
      </Card>
    </div>
  );
}
