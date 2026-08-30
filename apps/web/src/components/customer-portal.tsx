"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";
import { Card, Button, Badge, StatusDot, ErrorText, Input, Label } from "@/components/ui";
import { IconPackage, IconInvoice, IconShield, IconLifeBuoy } from "@/components/icons";

interface MySubscription {
  id: string;
  status: string;
  nextBillingAt: string;
  package: { name: string; downloadKbps: number; uploadKbps: number };
}

interface MyInvoice {
  id: string;
  invoiceNumber: string;
  status: string;
  totalMinor: number;
  amountPaidMinor: number;
  currency: string;
  dueDate: string;
}

interface MyWallet {
  wallet: { balanceMinor: number; currency: string };
  transactions: { id: string; type: string; amountMinor: number; reason: string; createdAt: string }[];
}

interface MyTicket {
  id: string;
  subject: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  createdAt: string;
  updatedAt: string;
}

interface TicketMessage {
  id: string;
  body: string;
  authorUserId: string | null;
  authorLabel: string | null;
  createdAt: string;
}

interface MyTicketDetail extends MyTicket {
  messages: TicketMessage[];
}

function ticketStatusVariant(status: MyTicket["status"]): "success" | "warning" | "neutral" | "danger" | "info" {
  if (status === "OPEN") return "warning";
  if (status === "IN_PROGRESS") return "info";
  if (status === "RESOLVED") return "success";
  return "neutral";
}

/** Renders for a logged-in CUSTOMER who has a Customer record linked to their account (see
 *  linkCustomerToUserAccount) — everything here is scoped server-side to "my own data" by the
 *  /api/v1/me/* routes, not by anything this component checks. */
export function CustomerPortal() {
  const queryClient = useQueryClient();
  const [revealed, setRevealed] = useState<Record<string, { username: string; password: string }>>({});
  const [error, setError] = useState<string | null>(null);

  const [showTicketForm, setShowTicketForm] = useState(false);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketBody, setTicketBody] = useState("");
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");

  const { data: customer, isLoading: customerLoading, error: customerError } = useQuery({
    queryKey: ["me-customer"],
    queryFn: () => apiFetch<{ fullName: string; customerNumber: string }>("/api/v1/me/customer"),
    retry: false,
  });

  const { data: subscriptions } = useQuery({
    queryKey: ["me-subscriptions"],
    queryFn: () => apiFetch<MySubscription[]>("/api/v1/me/subscriptions"),
    enabled: Boolean(customer),
  });

  const { data: invoices } = useQuery({
    queryKey: ["me-invoices"],
    queryFn: () => apiFetch<MyInvoice[]>("/api/v1/me/invoices"),
    enabled: Boolean(customer),
  });

  const { data: walletData } = useQuery({
    queryKey: ["me-wallet"],
    queryFn: () => apiFetch<MyWallet>("/api/v1/me/wallet"),
    enabled: Boolean(customer),
  });

  const revealPassword = useMutation({
    mutationFn: (subscriptionId: string) =>
      apiFetch<{ username: string; password: string }>(
        `/api/v1/me/subscriptions/${subscriptionId}/reveal-pppoe-password`,
        { method: "POST" }
      ),
    onSuccess: (data, subscriptionId) => setRevealed((prev) => ({ ...prev, [subscriptionId]: data })),
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to reveal password"),
  });

  const { data: tickets } = useQuery({
    queryKey: ["me-tickets"],
    queryFn: () => apiFetch<MyTicket[]>("/api/v1/me/tickets"),
    enabled: Boolean(customer),
  });

  const { data: expandedTicket } = useQuery({
    queryKey: ["me-ticket", expandedTicketId],
    queryFn: () => apiFetch<MyTicketDetail>(`/api/v1/me/tickets/${expandedTicketId}`),
    enabled: Boolean(expandedTicketId),
  });

  const createTicket = useMutation({
    mutationFn: () =>
      apiFetch<MyTicket>("/api/v1/me/tickets", {
        method: "POST",
        body: JSON.stringify({ subject: ticketSubject.trim(), body: ticketBody.trim() }),
      }),
    onSuccess: () => {
      setTicketSubject("");
      setTicketBody("");
      setShowTicketForm(false);
      queryClient.invalidateQueries({ queryKey: ["me-tickets"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to raise ticket"),
  });

  const replyToTicket = useMutation({
    mutationFn: (ticketId: string) =>
      apiFetch(`/api/v1/me/tickets/${ticketId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: replyBody.trim() }),
      }),
    onSuccess: () => {
      setReplyBody("");
      queryClient.invalidateQueries({ queryKey: ["me-ticket", expandedTicketId] });
      queryClient.invalidateQueries({ queryKey: ["me-tickets"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to send reply"),
  });

  if (customerLoading) return <p className="text-sm text-slate-500">Loading your account...</p>;

  if (customerError) {
    return (
      <Card>
        <h2 className="mb-2 text-lg font-semibold">Account not linked yet</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Your login isn&apos;t connected to a subscriber record yet. Contact support with your
          account email and they&apos;ll link it — this usually happens right after
          installation.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-1 text-lg font-semibold">Welcome, {customer!.fullName}</h2>
        <p className="text-xs text-slate-500">Account #{customer!.customerNumber}</p>
      </Card>

      {error && <ErrorText>{error}</ErrorText>}

      <Card>
        <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
          <IconPackage size={18} className="text-brand-600 dark:text-brand-400" />
          My Subscription
        </h3>
        <div className="space-y-3">
          {subscriptions?.map((sub) => (
            <div key={sub.id}>
              <div className="flex items-center justify-between text-sm">
                <span>
                  {sub.package.name} — {sub.package.downloadKbps / 1000}/{sub.package.uploadKbps / 1000}{" "}
                  Mbps
                  <span className="ml-2 text-xs text-slate-500">
                    next billing {new Date(sub.nextBillingAt).toLocaleDateString()}
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant={sub.status === "ACTIVE" ? "success" : "danger"}>
                    <StatusDot status={sub.status} pulse={sub.status === "ACTIVE"} />
                    <span>{sub.status}</span>
                  </Badge>
                  {!revealed[sub.id] && (
                    <Button
                      variant="secondary"
                      className="px-2.5 py-1 text-xs gap-1"
                      onClick={() => {
                        setError(null);
                        revealPassword.mutate(sub.id);
                      }}
                    >
                      <IconShield size={12} />
                      Show PPPoE login
                    </Button>
                  )}
                </div>
              </div>
              {revealed[sub.id] && (
                <div className="mt-2 rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs dark:bg-obsidian-800">
                  Username: {revealed[sub.id]!.username} · Password: {revealed[sub.id]!.password}
                </div>
              )}
            </div>
          ))}
          {subscriptions && subscriptions.length === 0 && (
            <p className="text-sm text-slate-500">No active subscription yet.</p>
          )}
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
          <IconInvoice size={18} className="text-brand-600 dark:text-brand-400" />
          My Invoices
        </h3>
        <div className="space-y-2">
          {invoices?.map((invoice) => (
            <div key={invoice.id} className="flex items-center justify-between text-sm">
              <span>
                {invoice.invoiceNumber} — due {new Date(invoice.dueDate).toLocaleDateString()}
              </span>
              <span>
                {formatMoney(invoice.amountPaidMinor, invoice.currency)} /{" "}
                {formatMoney(invoice.totalMinor, invoice.currency)} · {invoice.status}
              </span>
            </div>
          ))}
          {invoices && invoices.length === 0 && <p className="text-sm text-slate-500">No invoices yet.</p>}
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold text-slate-900 dark:text-white">
          My Wallet —{" "}
          {walletData ? formatMoney(walletData.wallet.balanceMinor, walletData.wallet.currency) : "..."}
        </h3>
        <div className="space-y-1 text-sm">
          {walletData?.transactions.map((tx) => (
            <div key={tx.id} className="flex justify-between text-xs">
              <span>
                {tx.reason} ({tx.type})
              </span>
              <span>{formatMoney(tx.amountMinor)}</span>
            </div>
          ))}
          {walletData && walletData.transactions.length === 0 && (
            <p className="text-sm text-slate-500">No wallet activity yet.</p>
          )}
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
            <IconLifeBuoy size={18} className="text-brand-600 dark:text-brand-400" />
            My Support Tickets
          </h3>
          <Button
            variant="secondary"
            className="px-2.5 py-1 text-xs"
            onClick={() => setShowTicketForm((v) => !v)}
          >
            {showTicketForm ? "Cancel" : "+ Raise a Ticket"}
          </Button>
        </div>

        {showTicketForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              createTicket.mutate();
            }}
            className="mb-4 space-y-2 rounded-lg border border-slate-200 p-3 dark:border-obsidian-800"
          >
            <div>
              <Label htmlFor="ticketSubject">Subject</Label>
              <Input
                id="ticketSubject"
                value={ticketSubject}
                onChange={(e) => setTicketSubject(e.target.value)}
                placeholder="e.g. My connection keeps dropping"
                required
              />
            </div>
            <div>
              <Label htmlFor="ticketBody">Describe the issue</Label>
              <textarea
                id="ticketBody"
                value={ticketBody}
                onChange={(e) => setTicketBody(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-slate-100"
                required
              />
            </div>
            <Button type="submit" disabled={createTicket.isPending} className="px-3 py-1.5 text-xs">
              {createTicket.isPending ? "Sending..." : "Submit"}
            </Button>
          </form>
        )}

        <div className="space-y-2">
          {tickets?.map((ticket) => (
            <div key={ticket.id} className="rounded-lg border border-slate-200 dark:border-obsidian-800">
              <button
                type="button"
                onClick={() => setExpandedTicketId(expandedTicketId === ticket.id ? null : ticket.id)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm"
              >
                <span className="font-medium">{ticket.subject}</span>
                <Badge variant={ticketStatusVariant(ticket.status)}>{ticket.status.replace("_", " ")}</Badge>
              </button>

              {expandedTicketId === ticket.id && (
                <div className="border-t border-slate-200 p-3 dark:border-obsidian-800">
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {expandedTicket?.messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`rounded-lg px-3 py-2 text-xs ${
                          msg.authorUserId
                            ? "bg-slate-100 dark:bg-obsidian-800"
                            : "bg-brand-50 dark:bg-brand-950/40"
                        }`}
                      >
                        <p className="mb-0.5 font-semibold text-slate-500">
                          {msg.authorUserId ? "Support" : msg.authorLabel ?? "You"} ·{" "}
                          {new Date(msg.createdAt).toLocaleString()}
                        </p>
                        <p className="whitespace-pre-wrap">{msg.body}</p>
                      </div>
                    ))}
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      setError(null);
                      replyToTicket.mutate(ticket.id);
                    }}
                    className="mt-2 flex items-center gap-2"
                  >
                    <Input
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      placeholder="Reply..."
                      className="flex-1"
                      required
                    />
                    <Button type="submit" disabled={replyToTicket.isPending} className="px-3 py-1.5 text-xs">
                      Send
                    </Button>
                  </form>
                </div>
              )}
            </div>
          ))}
          {tickets && tickets.length === 0 && (
            <p className="text-sm text-slate-500">No support tickets yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
