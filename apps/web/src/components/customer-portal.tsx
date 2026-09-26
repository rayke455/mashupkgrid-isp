"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";
import { Badge, Button, ErrorText, Input, Label } from "@/components/ui";
import { IconMpesa, IconShield } from "@/components/icons";
import { EmptyState, Metric, MetricGrid, Notice, PageHeader, Panel, Pill, TableShell, darkButton, td, th } from "@/components/dashboard/surface";

/**
 * What a subscriber sees when they sign in: is my internet on, when is the next bill, what do I
 * owe, and one button to pay it from their phone. Everything here is scoped server-side to "my
 * own data" by the /api/v1/me/* routes — the component checks nothing.
 */

interface MyCustomer {
  fullName: string;
  customerNumber: string;
  phone: string;
  email: string | null;
}

interface MySubscription {
  id: string;
  status: string;
  nextBillingAt: string;
  package: { name: string; downloadKbps: number; uploadKbps: number; priceMinor: number; currency: string; billingCycle: string };
}

interface MyInvoice {
  id: string;
  invoiceNumber: string;
  status: string;
  totalMinor: number;
  amountPaidMinor: number;
  currency: string;
  dueDate: string;
  issuedAt: string;
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

interface StkStatus {
  checkoutRequestId: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
  resultDesc: string | null;
  mpesaReceiptNumber: string | null;
  amountMinor: number;
}

const OPEN = new Set(["PENDING", "PARTIALLY_PAID", "OVERDUE"]);

function ticketTone(status: MyTicket["status"]): "good" | "warn" | "neutral" {
  if (status === "OPEN") return "warn";
  if (status === "RESOLVED") return "good";
  return "neutral";
}

function invoiceTone(status: string): "good" | "warn" | "bad" | "neutral" {
  if (status === "PAID") return "good";
  if (status === "OVERDUE") return "bad";
  if (OPEN.has(status)) return "warn";
  return "neutral";
}

function mbps(kbps: number): string {
  return `${Math.round(kbps / 1000)} Mbps`;
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function CustomerPortal() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, { username: string; password: string }>>({});

  // Paying: which invoice, the phone to prompt, and the push being watched.
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);
  const [payPhone, setPayPhone] = useState("");
  const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);

  const [showTicketForm, setShowTicketForm] = useState(false);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketBody, setTicketBody] = useState("");
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");

  const { data: customer, isLoading: customerLoading, error: customerError } = useQuery({
    queryKey: ["me-customer"],
    queryFn: () => apiFetch<MyCustomer>("/api/v1/me/customer"),
    retry: false,
  });
  const enabled = Boolean(customer);
  const { data: subscriptions } = useQuery({ queryKey: ["me-subscriptions"], queryFn: () => apiFetch<MySubscription[]>("/api/v1/me/subscriptions"), enabled });
  const { data: invoices } = useQuery({ queryKey: ["me-invoices"], queryFn: () => apiFetch<MyInvoice[]>("/api/v1/me/invoices"), enabled });
  const { data: walletData } = useQuery({ queryKey: ["me-wallet"], queryFn: () => apiFetch<MyWallet>("/api/v1/me/wallet"), enabled });
  const { data: tickets } = useQuery({ queryKey: ["me-tickets"], queryFn: () => apiFetch<MyTicket[]>("/api/v1/me/tickets"), enabled });
  const { data: expandedTicket } = useQuery({
    queryKey: ["me-ticket", expandedTicketId],
    queryFn: () => apiFetch<MyTicketDetail>(`/api/v1/me/tickets/${expandedTicketId}`),
    enabled: Boolean(expandedTicketId),
  });

  useEffect(() => {
    if (customer && !payPhone) setPayPhone(customer.phone);
  }, [customer, payPhone]);

  const refreshMoney = () => {
    queryClient.invalidateQueries({ queryKey: ["me-invoices"] });
    queryClient.invalidateQueries({ queryKey: ["me-wallet"] });
    queryClient.invalidateQueries({ queryKey: ["me-subscriptions"] });
  };

  const pay = useMutation({
    mutationFn: (invoiceId: string) =>
      apiFetch<{ checkoutRequestId: string }>(`/api/v1/me/invoices/${invoiceId}/pay`, { method: "POST", body: JSON.stringify({ phone: payPhone.trim() }) }),
    onSuccess: (res) => setCheckoutRequestId(res.checkoutRequestId),
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Could not start the M-Pesa payment"),
  });

  const { data: stk } = useQuery({
    queryKey: ["me-stk", checkoutRequestId],
    queryFn: () => apiFetch<StkStatus>(`/api/v1/me/payments/${checkoutRequestId}`),
    enabled: Boolean(checkoutRequestId),
    refetchInterval: (query) => (query.state.data?.status === "PENDING" ? 3000 : false),
  });
  useEffect(() => {
    if (stk?.status === "COMPLETED") {
      refreshMoney();
      setPayingInvoiceId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stk?.status]);

  const revealPassword = useMutation({
    mutationFn: (subscriptionId: string) => apiFetch<{ username: string; password: string }>(`/api/v1/me/subscriptions/${subscriptionId}/reveal-pppoe-password`, { method: "POST" }),
    onSuccess: (data, subscriptionId) => setRevealed((prev) => ({ ...prev, [subscriptionId]: data })),
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to reveal password"),
  });

  const createTicket = useMutation({
    mutationFn: () => apiFetch<MyTicket>("/api/v1/me/tickets", { method: "POST", body: JSON.stringify({ subject: ticketSubject.trim(), body: ticketBody.trim() }) }),
    onSuccess: () => {
      setTicketSubject("");
      setTicketBody("");
      setShowTicketForm(false);
      queryClient.invalidateQueries({ queryKey: ["me-tickets"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to raise ticket"),
  });

  const replyToTicket = useMutation({
    mutationFn: (ticketId: string) => apiFetch(`/api/v1/me/tickets/${ticketId}/messages`, { method: "POST", body: JSON.stringify({ body: replyBody.trim() }) }),
    onSuccess: () => {
      setReplyBody("");
      queryClient.invalidateQueries({ queryKey: ["me-ticket", expandedTicketId] });
      queryClient.invalidateQueries({ queryKey: ["me-tickets"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to send reply"),
  });

  if (customerLoading) return <p className="text-sm text-slate-400">Loading your account…</p>;

  if (customerError || !customer) {
    return (
      <Panel title="Your account is not linked yet">
        <p className="text-sm leading-6 text-slate-400">
          Your login isn&rsquo;t connected to a subscriber record yet. Contact support with your account email and they&rsquo;ll link it —
          this usually happens right after installation.
        </p>
      </Panel>
    );
  }

  const primary = subscriptions?.[0] ?? null;
  const openInvoices = (invoices ?? []).filter((i) => OPEN.has(i.status));
  const owedMinor = openInvoices.reduce((sum, i) => sum + (i.totalMinor - i.amountPaidMinor), 0);
  const currency = openInvoices[0]?.currency ?? primary?.package.currency ?? "KES";
  const nextDays = primary ? daysUntil(primary.nextBillingAt) : null;
  const serviceOn = primary?.status === "ACTIVE";
  const firstOpen = openInvoices.find((i) => i.status === "OVERDUE") ?? openInvoices[0];

  const payingInvoice = payingInvoiceId ? invoices?.find((i) => i.id === payingInvoiceId) : undefined;

  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHeader
        title={`Hello, ${customer.fullName.split(" ")[0]}`}
        description={`Account ${customer.customerNumber}`}
        actions={
          firstOpen && (
            <button type="button" className={darkButton("primary")} onClick={() => setPayingInvoiceId(firstOpen.id)}>
              <IconMpesa size={16} /> Pay {formatMoney(owedMinor, currency)} now
            </button>
          )
        }
      />

      {error && <ErrorText>{error}</ErrorText>}

      {primary && !serviceOn && (
        <Notice tone={primary.status === "SUSPENDED" ? "bad" : "warn"}>
          {primary.status === "SUSPENDED"
            ? "Your internet is suspended because of an unpaid invoice. It comes back on automatically within a minute of your payment."
            : `Your subscription is ${primary.status.toLowerCase()}.`}
        </Notice>
      )}

      <MetricGrid columns={4}>
        <Metric
          label="Internet"
          value={primary ? (serviceOn ? "On" : primary.status === "SUSPENDED" ? "Suspended" : primary.status) : "No plan"}
          hint={primary ? `${primary.package.name} · ${mbps(primary.package.downloadKbps)} down / ${mbps(primary.package.uploadKbps)} up` : "Ask support to set up your plan"}
          tone={primary ? (serviceOn ? "good" : "bad") : undefined}
        />
        <Metric
          label="Next bill"
          value={primary ? new Date(primary.nextBillingAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "—"}
          hint={nextDays === null ? undefined : nextDays < 0 ? `${-nextDays} day${nextDays === -1 ? "" : "s"} ago` : nextDays === 0 ? "Today" : `In ${nextDays} day${nextDays === 1 ? "" : "s"}`}
          tone={nextDays !== null && nextDays <= 3 ? "warn" : undefined}
        />
        <Metric
          label="Amount due"
          value={formatMoney(owedMinor, currency)}
          hint={openInvoices.length === 0 ? "Nothing outstanding" : `${openInvoices.length} open invoice${openInvoices.length === 1 ? "" : "s"}`}
          tone={owedMinor > 0 ? (openInvoices.some((i) => i.status === "OVERDUE") ? "bad" : "warn") : "good"}
        />
        <Metric label="Wallet" value={walletData ? formatMoney(walletData.wallet.balanceMinor, walletData.wallet.currency) : "—"} hint="Credit applied to your next bill" />
      </MetricGrid>

      {/* Pay sheet: the phone to prompt and the live result of the push. */}
      {payingInvoice && (
        <Panel
          title={`Pay ${payingInvoice.invoiceNumber} with M-Pesa`}
          description={`${formatMoney(payingInvoice.totalMinor - payingInvoice.amountPaidMinor, payingInvoice.currency)} due ${new Date(payingInvoice.dueDate).toLocaleDateString()}`}
          actions={
            !checkoutRequestId && (
              <button type="button" className={darkButton("ghost", "sm")} onClick={() => setPayingInvoiceId(null)}>
                Cancel
              </button>
            )
          }
        >
          {!checkoutRequestId ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label htmlFor="payPhone">M-Pesa phone number</Label>
                <Input id="payPhone" value={payPhone} onChange={(e) => setPayPhone(e.target.value)} placeholder="07XX XXX XXX" inputMode="tel" />
              </div>
              <Button
                disabled={pay.isPending || payPhone.trim().length < 9}
                onClick={() => {
                  setError(null);
                  pay.mutate(payingInvoice.id);
                }}
              >
                {pay.isPending ? "Sending prompt…" : "Send M-Pesa prompt"}
              </Button>
            </div>
          ) : stk?.status === "COMPLETED" ? (
            <Notice tone="good">
              Paid — thank you. Receipt {stk.mpesaReceiptNumber ?? "pending"}. {primary && !serviceOn ? "Your internet is being switched back on now." : ""}
              <button type="button" className={`${darkButton("ghost", "sm")} ml-2`} onClick={() => { setCheckoutRequestId(null); setPayingInvoiceId(null); }}>
                Done
              </button>
            </Notice>
          ) : stk?.status === "FAILED" || stk?.status === "CANCELLED" ? (
            <Notice tone="bad">
              {stk.status === "CANCELLED" ? "The prompt was cancelled on your phone." : `Payment failed${stk.resultDesc ? `: ${stk.resultDesc}` : "."}`}
              <button type="button" className={`${darkButton("secondary", "sm")} ml-2`} onClick={() => setCheckoutRequestId(null)}>
                Try again
              </button>
            </Notice>
          ) : (
            <Notice tone="warn">Check your phone — enter your M-Pesa PIN to complete the payment. This updates on its own.</Notice>
          )}
        </Panel>
      )}

      {/* Invoices */}
      <Panel title="Invoices" padded={false}>
        {!invoices || invoices.length === 0 ? (
          <EmptyState title="No invoices yet" />
        ) : (
          <TableShell minWidth={560}>
            <thead>
              <tr>
                <th className={th}>Invoice</th>
                <th className={th}>Due</th>
                <th className={`${th} text-right`}>Amount</th>
                <th className={th}>Status</th>
                <th className={`${th} text-right`}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.slice(0, 12).map((inv) => {
                const balance = inv.totalMinor - inv.amountPaidMinor;
                return (
                  <tr key={inv.id}>
                    <td className={`${td} font-mono text-[13px] text-white`}>{inv.invoiceNumber}</td>
                    <td className={`${td} text-slate-400`}>{new Date(inv.dueDate).toLocaleDateString()}</td>
                    <td className={`${td} text-right tabular-nums text-white`}>
                      {formatMoney(inv.totalMinor, inv.currency)}
                      {inv.amountPaidMinor > 0 && balance > 0 && <span className="block text-xs text-slate-500">{formatMoney(balance, inv.currency)} left</span>}
                    </td>
                    <td className={td}>
                      <Pill tone={invoiceTone(inv.status)}>{inv.status.replace("_", " ").toLowerCase()}</Pill>
                    </td>
                    <td className={`${td} text-right`}>
                      {OPEN.has(inv.status) && (
                        <button type="button" className={darkButton("secondary", "sm")} onClick={() => { setCheckoutRequestId(null); setPayingInvoiceId(inv.id); }}>
                          Pay
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Plan + PPPoE login */}
        <Panel title="My plan">
          {!subscriptions || subscriptions.length === 0 ? (
            <p className="text-sm text-slate-400">No plan on this account yet.</p>
          ) : (
            <div className="space-y-4">
              {subscriptions.map((sub) => (
                <div key={sub.id} className="rounded-lg border border-obsidian-800 bg-obsidian-950/60 p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-white">{sub.package.name}</p>
                      <p className="text-xs text-slate-400">
                        {mbps(sub.package.downloadKbps)} / {mbps(sub.package.uploadKbps)} · {formatMoney(sub.package.priceMinor, sub.package.currency)} {sub.package.billingCycle.toLowerCase()}
                      </p>
                    </div>
                    <Badge variant={sub.status === "ACTIVE" ? "success" : "danger"}>{sub.status}</Badge>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <span className="text-xs text-slate-500">Renews {new Date(sub.nextBillingAt).toLocaleDateString()}</span>
                    {!revealed[sub.id] ? (
                      <button type="button" className={darkButton("ghost", "sm")} disabled={revealPassword.isPending} onClick={() => revealPassword.mutate(sub.id)}>
                        <IconShield size={13} /> Show PPPoE login
                      </button>
                    ) : (
                      <span className="rounded bg-obsidian-800 px-2 py-1 font-mono text-xs text-slate-200">
                        {revealed[sub.id]!.username} · {revealed[sub.id]!.password}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* Wallet */}
        <Panel title="Wallet" description="Credit and adjustments on your account">
          {!walletData || walletData.transactions.length === 0 ? (
            <p className="text-sm text-slate-400">No wallet activity yet.</p>
          ) : (
            <ul className="divide-y divide-obsidian-800 text-sm">
              {walletData.transactions.slice(0, 8).map((tx) => (
                <li key={tx.id} className="flex items-center justify-between py-2">
                  <span className="text-slate-300">
                    {tx.reason}
                    <span className="block text-xs text-slate-500">{new Date(tx.createdAt).toLocaleDateString()}</span>
                  </span>
                  <span className={`tabular-nums ${tx.amountMinor < 0 ? "text-rose-300" : "text-emerald-300"}`}>{formatMoney(tx.amountMinor, walletData.wallet.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Support */}
      <Panel
        title="Support"
        description="Tell us what's wrong and we'll reply here."
        actions={
          <button type="button" className={darkButton("secondary", "sm")} onClick={() => setShowTicketForm((v) => !v)}>
            {showTicketForm ? "Cancel" : "New request"}
          </button>
        }
      >
        {showTicketForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              createTicket.mutate();
            }}
            className="mb-5 space-y-3 rounded-lg border border-obsidian-800 p-4"
          >
            <div>
              <Label htmlFor="ticketSubject">Subject</Label>
              <Input id="ticketSubject" value={ticketSubject} onChange={(e) => setTicketSubject(e.target.value)} placeholder="e.g. My connection keeps dropping" required />
            </div>
            <div>
              <Label htmlFor="ticketBody">What&rsquo;s happening?</Label>
              <textarea
                id="ticketBody"
                value={ticketBody}
                onChange={(e) => setTicketBody(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-obsidian-700 bg-obsidian-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-500"
                required
              />
            </div>
            <Button type="submit" disabled={createTicket.isPending} size="sm">
              {createTicket.isPending ? "Sending…" : "Send"}
            </Button>
          </form>
        )}

        {!tickets || tickets.length === 0 ? (
          <p className="text-sm text-slate-400">No support requests yet.</p>
        ) : (
          <div className="space-y-2">
            {tickets.map((ticket) => (
              <div key={ticket.id} className="rounded-lg border border-obsidian-800">
                <button
                  type="button"
                  onClick={() => setExpandedTicketId(expandedTicketId === ticket.id ? null : ticket.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm"
                >
                  <span className="font-medium text-slate-100">{ticket.subject}</span>
                  <Pill tone={ticketTone(ticket.status)}>{ticket.status.replace("_", " ").toLowerCase()}</Pill>
                </button>
                {expandedTicketId === ticket.id && (
                  <div className="border-t border-obsidian-800 p-4">
                    <div className="max-h-64 space-y-2 overflow-y-auto">
                      {expandedTicket?.messages.map((msg) => (
                        <div key={msg.id} className={`rounded-lg px-3 py-2 text-xs ${msg.authorUserId ? "bg-obsidian-800" : "bg-brand-950/40"}`}>
                          <p className="mb-0.5 font-semibold text-slate-400">
                            {msg.authorUserId ? "Support" : (msg.authorLabel ?? "You")} · {new Date(msg.createdAt).toLocaleString()}
                          </p>
                          <p className="whitespace-pre-wrap text-slate-200">{msg.body}</p>
                        </div>
                      ))}
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        setError(null);
                        replyToTicket.mutate(ticket.id);
                      }}
                      className="mt-3 flex items-center gap-2"
                    >
                      <Input value={replyBody} onChange={(e) => setReplyBody(e.target.value)} placeholder="Reply…" className="flex-1" required />
                      <Button type="submit" size="sm" disabled={replyToTicket.isPending}>
                        Send
                      </Button>
                    </form>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
