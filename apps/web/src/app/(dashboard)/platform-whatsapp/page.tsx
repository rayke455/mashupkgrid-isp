"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Button, Card, ErrorText, HintText, Badge, StatusDot, Input, Label } from "@/components/ui";
import { IconMessage, IconSparkles, IconCheck, IconShield } from "@/components/icons";

type ConnectionStatus = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "LOGGED_OUT";

interface WhatsappConnectionView {
  status: ConnectionStatus;
  phoneNumber: string | null;
  lastConnectedAt: string | null;
  lastError: string | null;
  /** PNG data URL, present only while a pairing QR is live. */
  qr: string | null;
}

const STATUS_META: Record<
  ConnectionStatus,
  { label: string; variant: "success" | "warning" | "danger" | "neutral"; dot: string }
> = {
  CONNECTED: { label: "Platform Line Connected", variant: "success", dot: "ONLINE" },
  CONNECTING: { label: "Waiting for QR Scan", variant: "warning", dot: "WARNING" },
  LOGGED_OUT: { label: "Unlinked from phone", variant: "danger", dot: "DOWN" },
  DISCONNECTED: { label: "Not Connected", variant: "neutral", dot: "UNKNOWN" },
};

export default function PlatformWhatsappPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [isSendingTest, setIsSendingTest] = useState(false);

  const { data: connection, isLoading } = useQuery({
    queryKey: ["whatsapp-connection"],
    queryFn: () => apiFetch<WhatsappConnectionView>("/api/v1/whatsapp/connection"),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "CONNECTING" ? 3000 : 15000;
    },
  });

  const connect = useMutation({
    mutationFn: () => apiFetch("/api/v1/whatsapp/connection/connect", { method: "POST" }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["whatsapp-connection"] });
    },
    onError: (err) =>
      setError(err instanceof ApiRequestError ? err.message : "Failed to start the connection"),
  });

  const disconnect = useMutation({
    mutationFn: () => apiFetch("/api/v1/whatsapp/connection/disconnect", { method: "POST" }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["whatsapp-connection"] });
    },
    onError: (err) =>
      setError(err instanceof ApiRequestError ? err.message : "Failed to disconnect"),
  });

  const handleSendTestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone.trim()) return;
    setIsSendingTest(true);
    setTestStatus(null);
    try {
      await apiFetch("/api/v1/auth/isp-registration/whatsapp-otp/send", {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify({ phone: testPhone.trim() }),
      });
      setTestStatus("✅ Test OTP sent successfully via Platform WhatsApp!");
    } catch (err) {
      setTestStatus(
        err instanceof ApiRequestError
          ? `❌ Error: ${err.message}`
          : "❌ Failed to send test OTP. Ensure Platform WhatsApp is connected."
      );
    } finally {
      setIsSendingTest(false);
    }
  };

  const status = connection?.status ?? "DISCONNECTED";
  const meta = STATUS_META[status];
  const isPairing = status === "CONNECTING";

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <IconMessage size={18} />
            </span>
            Platform WhatsApp (Tenant OTP Line)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Link the official platform WhatsApp number used to deliver verification OTPs and welcome credentials to new ISP tenant signups.
          </p>
        </div>
        <Badge variant={meta.variant}>
          <StatusDot status={meta.dot} pulse={isPairing} />
          <span>{meta.label}</span>
        </Badge>
      </div>

      {connection?.lastError && (
        <Card className="border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20">
          <p className="text-sm text-amber-800 dark:text-amber-300">{connection.lastError}</p>
        </Card>
      )}

      {/* Connected State */}
      {status === "CONNECTED" ? (
        <Card className="space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Connected Master Platform Line
              </p>
              <p className="mt-1 font-mono text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {connection?.phoneNumber ?? "—"}
              </p>
              {connection?.lastConnectedAt && (
                <p className="mt-1 text-xs text-slate-500">
                  Active since {new Date(connection.lastConnectedAt).toLocaleString()}
                </p>
              )}
            </div>
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-500 border border-emerald-500/20 flex items-center gap-1.5">
              <IconCheck size={14} />
              <span>Live &amp; Ready for Tenant OTPs</span>
            </span>
          </div>

          <div className="rounded-lg bg-slate-50 p-4 dark:bg-obsidian-800/60 border border-slate-200/80 dark:border-obsidian-700 space-y-2">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Automated Platform Roles:
            </h3>
            <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5 list-disc list-inside">
              <li>Sends 6-digit WhatsApp OTPs during ISP Tenant signup wizard.</li>
              <li>Sends welcome messages and dashboard login URLs to new tenant owners.</li>
              <li>Provides automated fallbacks if email SMTP is unconfigured.</li>
            </ul>
          </div>

          {/* Test Sender */}
          <div className="border-t border-slate-200 dark:border-obsidian-800 pt-5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
              Send Test Verification OTP
            </h3>
            <form onSubmit={handleSendTestOtp} className="flex gap-2">
              <Input
                placeholder="e.g. 254712345678"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                className="max-w-xs text-sm font-mono"
              />
              <Button type="submit" disabled={isSendingTest || !testPhone.trim()} size="sm">
                {isSendingTest ? "Sending..." : "Send Test OTP"}
              </Button>
            </form>
            {testStatus && <p className="mt-2 text-xs font-medium">{testStatus}</p>}
          </div>

          <div className="border-t border-slate-200 dark:border-obsidian-800 pt-4 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              disabled={disconnect.isPending}
              onClick={() => disconnect.mutate()}
            >
              {disconnect.isPending ? "Disconnecting..." : "Unlink Number"}
            </Button>
          </div>
        </Card>
      ) : (
        /* Disconnected / Pairing State */
        <Card className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Link Platform WhatsApp via QR Code
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Open WhatsApp on your mobile phone or WhatsApp Business app, go to{" "}
              <strong className="text-slate-700 dark:text-slate-300">Settings &gt; Linked Devices &gt; Link a Device</strong>, and scan the QR code below.
            </p>
          </div>

          {isPairing ? (
            <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-200/80 bg-slate-50 p-6 dark:border-obsidian-800 dark:bg-obsidian-950/60">
              {connection?.qr ? (
                <div className="rounded-xl bg-white p-3 shadow-md">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={connection.qr} alt="WhatsApp Pairing QR Code" className="h-64 w-64" />
                </div>
              ) : (
                <div className="flex h-64 w-64 flex-col items-center justify-center gap-2 text-center text-xs text-slate-400">
                  <span className="h-6 w-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                  <span>Generating pairing QR code...</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <StatusDot status="WARNING" pulse />
                <span>QR code refreshes automatically every ~20 seconds</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={disconnect.isPending}
                onClick={() => disconnect.mutate()}
              >
                Cancel Pairing
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-4">
              <Button
                disabled={connect.isPending}
                onClick={() => connect.mutate()}
                className="gap-2 shadow-glow"
              >
                <IconMessage size={16} />
                <span>{connect.isPending ? "Starting..." : "Generate Pairing QR Code"}</span>
              </Button>
              <HintText>
                Requires the backend worker container (<code className="font-mono">worker</code>) to be running.
              </HintText>
            </div>
          )}

          {error && <ErrorText>{error}</ErrorText>}
        </Card>
      )}
    </div>
  );
}
