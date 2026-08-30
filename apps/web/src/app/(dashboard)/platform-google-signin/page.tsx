"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Button, Card, ErrorText, HintText, Input, Label, Badge, StatusDot } from "@/components/ui";
import { IconLock } from "@/components/icons";

interface GoogleAuthConfig {
  enabled: boolean;
  clientId: string | null;
}

export default function PlatformGoogleSignInPage() {
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedOrigin, setCopiedOrigin] = useState<string | null>(null);

  const { data: config } = useQuery({
    queryKey: ["platform-google-config"],
    queryFn: () => apiFetch<GoogleAuthConfig>("/api/v1/auth/google/config", { skipAuth: true }),
  });

  useEffect(() => {
    if (!config) return;
    setClientId(config.clientId ?? "");
    setIsActive(config.enabled);
  }, [config]);

  const save = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/auth/google/config", {
        method: "PUT",
        body: JSON.stringify({ clientId: clientId.trim(), isActive }),
      }),
    onSuccess: () => {
      setSuccessMsg("Google OAuth configuration saved successfully!");
      queryClient.invalidateQueries({ queryKey: ["platform-google-config"] });
      setTimeout(() => setSuccessMsg(null), 4000);
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to save configuration"),
  });

  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedOrigin(text);
    setTimeout(() => setCopiedOrigin(null), 2000);
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
              <IconLock size={20} />
            </span>
            Google OAuth &amp; Social Sign-In
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Platform-wide Google Sign-In &amp; Sign-Up for Super Admins, Tenant Operators, and Subscribers.
          </p>
        </div>
        <Badge variant={config?.enabled ? "success" : "neutral"} className="self-start sm:self-auto">
          <StatusDot status={config?.enabled ? "ONLINE" : "UNKNOWN"} />
          <span>{config?.enabled ? "Google Sign-In Active" : "OAuth Disabled"}</span>
        </Badge>
      </div>

      {/* Configuration Card */}
      <Card className="space-y-4">
        <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Google OAuth 2.0 Web Client ID</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Only the Client ID is required (no secret needed on the frontend).
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            save.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="clientId">Client ID</Label>
            <Input
              id="clientId"
              placeholder="123456789-abcdefg.apps.googleusercontent.com"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="font-mono text-sm"
              required
            />
            <HintText>
              Get this from Google Cloud Console &rarr; Credentials &rarr; OAuth 2.0 Client ID (Web Application).
            </HintText>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800">
            <input
              id="isActive"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded-sm border-slate-300 text-cyan-600 focus:ring-cyan-500"
            />
            <label htmlFor="isActive" className="text-sm font-semibold text-slate-900 dark:text-white cursor-pointer">
              Enable &quot;Sign in with Google&quot; on Login and Registration Pages
            </label>
          </div>

          {error && <ErrorText>{error}</ErrorText>}
          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
              ✓ {successMsg}
            </div>
          )}

          <Button type="submit" disabled={save.isPending} className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold">
            {save.isPending ? "Saving..." : "Save Configuration"}
          </Button>
        </form>
      </Card>

      {/* Setup Step-by-Step Guide */}
      <Card className="space-y-4 border-slate-200/90 dark:border-slate-800">
        <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span>📋</span>
          Google Cloud Console Setup Checklist
        </h2>

        <div className="space-y-3 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          <div className="flex items-start gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-white font-bold text-[10px]">1</span>
            <p>
              Open the <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="text-cyan-600 dark:text-cyan-400 font-bold hover:underline">Google Cloud Console Credentials Page</a>.
            </p>
          </div>

          <div className="flex items-start gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-white font-bold text-[10px]">2</span>
            <p>
              Click <strong>Create Credentials &rarr; OAuth Client ID</strong> and select Application type as <strong>Web application</strong>.
            </p>
          </div>

          <div className="flex items-start gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-white font-bold text-[10px]">3</span>
            <div className="space-y-2 flex-1">
              <p>Under <strong>Authorized JavaScript origins</strong>, add your current domain and local test addresses:</p>
              <div className="flex items-center gap-2">
                <code className="p-2 rounded-lg bg-slate-100 dark:bg-slate-950 font-mono text-cyan-600 dark:text-cyan-400 border border-slate-200 dark:border-slate-800 flex-1">
                  {currentOrigin}
                </code>
                <Button
                  type="button"
                  variant="secondary"
                  className="text-xs py-1.5"
                  onClick={() => copyToClipboard(currentOrigin)}
                >
                  {copiedOrigin === currentOrigin ? "Copied!" : "Copy"}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-white font-bold text-[10px]">4</span>
            <p>
              Paste the generated <strong>Client ID</strong> into the form above, check <strong>Enable</strong>, and click <strong>Save</strong>!
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
