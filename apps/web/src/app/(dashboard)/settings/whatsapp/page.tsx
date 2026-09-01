"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Button, Card, ErrorText, HintText, Badge, StatusDot, Input } from "@/components/ui";
import { IconMessage } from "@/components/icons";

type ConnectionStatus = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "LOGGED_OUT";

interface WhatsappConnectionView {
  status: ConnectionStatus;
  phoneNumber: string | null;
  lastConnectedAt: string | null;
  lastError: string | null;
  /** PNG data URL, present only while a pairing QR is live. */
  qr: string | null;
  /** 8-character code for "link with phone number" pairing. WhatsApp issues either this or a
   *  QR per attempt, never both. */
  pairingCode: string | null;
  /** True while this tenant's customer messages are going out on the platform's shared line
   *  because no number of their own is linked. */
  deliveringOnPlatformLine: boolean;
}

const STATUS_META: Record<ConnectionStatus, { label: string; variant: "success" | "warning" | "danger" | "neutral"; dot: string }> = {
  CONNECTED: { label: "Connected", variant: "success", dot: "ONLINE" },
  CONNECTING: { label: "Waiting for scan", variant: "warning", dot: "WARNING" },
  LOGGED_OUT: { label: "Unlinked from phone", variant: "danger", dot: "DOWN" },
  DISCONNECTED: { label: "Not connected", variant: "neutral", dot: "UNKNOWN" },
};

export default function WhatsappSettingsPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pairPhoneNumber, setPairPhoneNumber] = useState("");

  const { data: connection } = useQuery({
    queryKey: ["whatsapp-connection"],
    queryFn: () => apiFetch<WhatsappConnectionView>("/api/v1/whatsapp/connection"),
    // The QR rotates roughly every 20 seconds and pairing completes asynchronously in the worker,
    // so this page has to keep pulling rather than render once — that's what makes the code on
    // screen stay scannable and the status flip to Connected on its own.
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
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to start the connection"),
  });

  const pairPhone = useMutation({
    mutationFn: (phoneNumber: string) =>
      apiFetch("/api/v1/whatsapp/connection/pair-phone", {
        method: "POST",
        body: JSON.stringify({ phoneNumber }),
      }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["whatsapp-connection"] });
    },
    onError: (err) =>
      setError(err instanceof ApiRequestError ? err.message : "Failed to request a pairing code"),
  });

  const disconnect = useMutation({
    mutationFn: () => apiFetch("/api/v1/whatsapp/connection/disconnect", { method: "POST" }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["whatsapp-connection"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to disconnect"),
  });

  const status = connection?.status ?? "DISCONNECTED";
  const meta = STATUS_META[status];
  const isPairing = status === "CONNECTING";

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <IconMessage size={18} />
            </span>
            WhatsApp
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Link your own WhatsApp number to send vouchers and answer customers automatically.
          </p>
        </div>
        <Badge variant={meta.variant}>
          <StatusDot status={meta.dot} pulse={isPairing} />
          <span>{meta.label}</span>
        </Badge>
      </div>

      {connection?.deliveringOnPlatformLine && (
        <Card className="border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Your customers are being messaged from a shared number
          </p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            Until you link your own WhatsApp, vouchers and login codes still reach your customers —
            but they arrive from a number that isn&apos;t yours, and{" "}
            <strong>anything a customer replies there is discarded</strong>: it does not reach your
            support queue and nobody sees it. Link your number below to send from your own line and
            start receiving replies.
          </p>
        </Card>
      )}

      {connection?.lastError && (
        <Card className="border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20">
          <p className="text-sm text-amber-800 dark:text-amber-300">{connection.lastError}</p>
        </Card>
      )}

      {status === "CONNECTED" ? (
        <Card className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Linked number</p>
            <p className="mt-0.5 font-mono text-lg font-bold text-slate-900 dark:text-white">
              {connection?.phoneNumber ?? "—"}
            </p>
            {connection?.lastConnectedAt && (
              <p className="mt-1 text-xs text-slate-500">
                Connected since {new Date(connection.lastConnectedAt).toLocaleString()}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 p-3.5 text-sm dark:border-obsidian-800">
            <p className="font-semibold text-slate-800 dark:text-slate-100">What this number now does</p>
            <ul className="mt-1.5 space-y-1 text-xs text-slate-500 dark:text-slate-400">
              <li>• Sends a voucher code the moment a customer&apos;s payment completes</li>
              <li>• Answers customers with a self-service menu (balance, buy Wi-Fi, report an outage, support)</li>
            </ul>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
              {disconnect.isPending ? "Disconnecting..." : "Disconnect"}
            </Button>
            <HintText>Reconnecting later needs a new QR scan.</HintText>
          </div>
        </Card>
      ) : (
        <Card className="space-y-4">
          {isPairing && connection?.pairingCode ? (
            <div className="space-y-3 text-center">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Enter this code on your phone
              </p>
              <p className="font-mono text-3xl font-black tracking-[0.3em] text-brand-500">
                {connection.pairingCode}
              </p>
              <p className="text-xs text-slate-500">
                WhatsApp → Settings → <strong>Linked Devices</strong> →{" "}
                <strong>Link with phone number</strong>
              </p>
            </div>
          ) : isPairing && connection?.qr ? (
            <div className="space-y-3 text-center">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Scan this from the phone you want to connect
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={connection.qr}
                alt="WhatsApp pairing QR code"
                className="mx-auto rounded-xl border border-slate-200 bg-white p-2 dark:border-obsidian-800"
                width={280}
                height={280}
              />
              <p className="text-xs text-slate-500">
                WhatsApp → Settings → <strong>Linked Devices</strong> → <strong>Link a Device</strong>
              </p>
              <HintText>This code refreshes automatically until it&apos;s scanned.</HintText>
            </div>
          ) : isPairing ? (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-500">Preparing your QR code…</p>
              <HintText>This takes a few seconds.</HintText>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Connect a WhatsApp number to message your customers directly. Use a number you can keep online —
                a dedicated business line is better than a personal phone.
              </p>
              <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
                {connect.isPending ? "Starting..." : "Connect WhatsApp"}
              </Button>

              <div className="border-t border-slate-100 pt-3 dark:border-obsidian-800">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Or link with a phone number
                </p>
                <p className="mt-0.5 mb-2.5 text-xs text-slate-500 dark:text-slate-400">
                  WhatsApp gives you an 8-character code to type on the phone, instead of scanning
                  a QR from this screen.
                </p>
                <form
                  className="flex flex-wrap gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (pairPhoneNumber.trim()) pairPhone.mutate(pairPhoneNumber.trim());
                  }}
                >
                  <Input
                    placeholder="e.g. +254712345678"
                    value={pairPhoneNumber}
                    onChange={(e) => setPairPhoneNumber(e.target.value)}
                    className="max-w-xs font-mono text-sm"
                  />
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={pairPhone.isPending || !pairPhoneNumber.trim()}
                  >
                    {pairPhone.isPending ? "Requesting..." : "Get pairing code"}
                  </Button>
                </form>
              </div>
            </div>
          )}

          {isPairing && (
            <div className="border-t border-slate-100 pt-3 dark:border-obsidian-800">
              <Button
                variant="ghost"
                className="px-2.5 py-1 text-xs"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
              >
                Cancel
              </Button>
            </div>
          )}
        </Card>
      )}

      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
