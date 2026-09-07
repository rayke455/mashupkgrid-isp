"use client";

import { useState, useRef, useEffect } from "react";
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

interface TestChatEntry {
  direction: "out" | "in";
  text: string;
  phone: string;
  ts: number;
}

const STATUS_META: Record<ConnectionStatus, { label: string; variant: "success" | "warning" | "danger" | "neutral"; dot: string }> = {
  CONNECTED: { label: "Connected", variant: "success", dot: "ONLINE" },
  CONNECTING: { label: "Waiting for scan", variant: "warning", dot: "WARNING" },
  LOGGED_OUT: { label: "Unlinked from phone", variant: "danger", dot: "DOWN" },
  DISCONNECTED: { label: "Not connected", variant: "neutral", dot: "UNKNOWN" },
};

// ---------------------------------------------------------------------------
// Bot Testing Chat Panel
// ---------------------------------------------------------------------------
function BotTestPanel() {
  const queryClient = useQueryClient();
  const [testPhone, setTestPhone] = useState("");
  const [activePhone, setActivePhone] = useState<string | null>(null);
  const [msgText, setMsgText] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Poll test messages while the panel is active
  const { data: messages = [] } = useQuery({
    queryKey: ["whatsapp-test-messages"],
    queryFn: () => apiFetch<TestChatEntry[]>("/api/v1/whatsapp/test-messages"),
    refetchInterval: activePhone ? 2000 : false,
    enabled: !!activePhone,
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const sendMessage = useMutation({
    mutationFn: (data: { phone: string; text: string }) =>
      apiFetch("/api/v1/whatsapp/test-message", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      setMsgText("");
      setSendError(null);
      queryClient.invalidateQueries({ queryKey: ["whatsapp-test-messages"] });
    },
    onError: (err) =>
      setSendError(err instanceof ApiRequestError ? err.message : "Failed to send"),
  });

  const clearChat = useMutation({
    mutationFn: () => apiFetch("/api/v1/whatsapp/test-messages", { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-test-messages"] });
      setActivePhone(null);
    },
  });

  const handleStartChat = (e: React.FormEvent) => {
    e.preventDefault();
    const digits = testPhone.replace(/\D/g, "");
    if (digits.length >= 8) {
      setActivePhone(digits);
      setSendError(null);
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgText.trim() || !activePhone) return;
    sendMessage.mutate({ phone: activePhone, text: msgText.trim() });
  };

  if (!activePhone) {
    return (
      <Card className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-500/15 text-violet-600 dark:text-violet-400">
              🤖
            </span>
            Test Bot
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Interact with your WhatsApp self-service bot as if you were a customer. Enter a phone
            number to simulate a conversation — the bot replies are captured here instead of being
            sent to the real phone.
          </p>
        </div>
        <form onSubmit={handleStartChat} className="flex gap-2">
          <Input
            placeholder="Customer phone, e.g. 254712345678"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            className="flex-1 font-mono text-sm"
          />
          <Button type="submit" disabled={testPhone.replace(/\D/g, "").length < 8}>
            Start Chat
          </Button>
        </form>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col overflow-hidden h-[480px]">
      {/* Chat header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-obsidian-800 bg-gradient-to-r from-emerald-500/5 to-transparent">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-lg">
            🤖
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">Bot Test</p>
            <p className="text-xs font-mono text-slate-500">+{activePhone}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => clearChat.mutate()}
          disabled={clearChat.isPending}
          className="text-xs"
        >
          {clearChat.isPending ? "Clearing..." : "New Chat"}
        </Button>
      </div>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-slate-50/50 dark:bg-obsidian-950/30">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-sm text-slate-400 gap-2">
            <span className="text-3xl">💬</span>
            <p>Send a message to test the bot.</p>
            <p className="text-xs">Try &quot;hi&quot;, &quot;1&quot;, &quot;2&quot;, &quot;3&quot;, or &quot;4&quot; to navigate the menu.</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.direction === "out" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`relative max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                msg.direction === "out"
                  ? "bg-emerald-500 text-white rounded-br-md"
                  : "bg-white dark:bg-obsidian-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-obsidian-700 rounded-bl-md"
              }`}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
              <p
                className={`mt-1 text-right text-[10px] ${
                  msg.direction === "out" ? "text-emerald-100" : "text-slate-400"
                }`}
              >
                {new Date(msg.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Chat input */}
      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 border-t border-slate-200 px-4 py-3 dark:border-obsidian-800 bg-white dark:bg-obsidian-900"
      >
        <input
          type="text"
          placeholder="Type a message..."
          value={msgText}
          onChange={(e) => setMsgText(e.target.value)}
          className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none transition-colors focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 dark:border-obsidian-700 dark:bg-obsidian-800 dark:text-white dark:focus:border-emerald-500"
        />
        <button
          type="submit"
          disabled={sendMessage.isPending || !msgText.trim()}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md transition-all hover:bg-emerald-600 hover:shadow-lg disabled:opacity-40 disabled:shadow-none"
        >
          {sendMessage.isPending ? (
            <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth={2.5}>
              <path d="M22 2L11 13" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </form>
      {sendError && <p className="px-4 pb-2 text-xs text-red-500">{sendError}</p>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
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

      {/* Bot Testing Panel — only shown when connected */}
      {status === "CONNECTED" && <BotTestPanel />}

      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
