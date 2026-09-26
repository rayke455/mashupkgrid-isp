"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { tr } from "@/lib/tr";
import { ReferralCard } from "@/components/referral-card";
import { AccountMembers } from "@/components/account-members";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { useBranches } from "@/lib/use-branches";
import { useLanguage } from "@/lib/language-context";
import { pageStrings } from "@/lib/page-strings";
import { formatMoney } from "@/lib/money";
import { Button, Card, ErrorText, Input, Label, Badge, StatusDot } from "@/components/ui";
import { IconUsers, IconInvoice, IconPackage, IconArrowRight, IconShield } from "@/components/icons";

interface Customer {
  id: string;
  customerNumber: string;
  fullName: string;
  phone: string;
  email: string | null;
  status: string;
  userId: string | null;
  branchId?: string | null;
}

interface Package {
  id: string;
  name: string;
  priceMinor: number;
  currency: string;
  billingCycle: string;
}

interface Subscription {
  id: string;
  status: string;
  nextBillingAt: string;
  pausedUntil?: string | null;
  package: Package;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  totalMinor: number;
  amountPaidMinor: number;
  currency: string;
  dueDate: string;
}

interface PaginatedInvoices {
  items: Invoice[];
}

interface WalletData {
  wallet: { balanceMinor: number; currency: string };
  transactions: { id: string; type: string; amountMinor: number; reason: string; createdAt: string }[];
}

export default function CustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { lang } = useLanguage();
  const { branches } = useBranches();
  const t = pageStrings(lang).customers;
  const c = pageStrings(lang).common;
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [topUpAmount, setTopUpAmount] = useState("");
  const [revealed, setRevealed] = useState<Record<string, { username: string; password: string }>>({});
  const [linkEmail, setLinkEmail] = useState("");
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [msgSubject, setMsgSubject] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [msgChannels, setMsgChannels] = useState<{ EMAIL: boolean; SMS: boolean }>({ EMAIL: true, SMS: true });

  const { data: customer } = useQuery({
    queryKey: ["customer", customerId],
    queryFn: () => apiFetch<Customer>(`/api/v1/customers/${customerId}`),
  });

  const { data: packages } = useQuery({
    queryKey: ["packages", "active"],
    queryFn: () => apiFetch<{ items: Package[] }>("/api/v1/packages?activeOnly=true&limit=100"),
  });

  const { data: subscriptions } = useQuery({
    queryKey: ["subscriptions", customerId],
    queryFn: () => apiFetch<Subscription[]>(`/api/v1/subscriptions?customerId=${customerId}`),
  });

  const { data: invoices } = useQuery({
    queryKey: ["invoices", customerId],
    queryFn: () => apiFetch<PaginatedInvoices>(`/api/v1/invoices?customerId=${customerId}&limit=20`),
  });

  const { data: walletData } = useQuery({
    queryKey: ["wallet", customerId],
    queryFn: () => apiFetch<WalletData>(`/api/v1/wallets/${customerId}`),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["subscriptions", customerId] });
    queryClient.invalidateQueries({ queryKey: ["invoices", customerId] });
    queryClient.invalidateQueries({ queryKey: ["wallet", customerId] });
  };

  const subscribe = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/subscriptions", {
        method: "POST",
        body: JSON.stringify({ customerId, packageId: selectedPackageId }),
      }),
    onSuccess: () => {
      setSelectedPackageId("");
      invalidateAll();
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : t.failedSubscribe),
  });

  const revealPassword = useMutation({
    mutationFn: (subscriptionId: string) =>
      apiFetch<{ username: string; password: string }>(
        `/api/v1/radius/users/${subscriptionId}/reveal-password`,
        { method: "POST" }
      ),
    onSuccess: (data, subscriptionId) => setRevealed((prev) => ({ ...prev, [subscriptionId]: data })),
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : t.failedReveal),
  });

  const linkAccount = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/customers/${customerId}/link-account`, {
        method: "POST",
        body: JSON.stringify({ email: linkEmail }),
      }),
    onSuccess: () => {
      setLinkEmail("");
      setShowLinkForm(false);
      queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : t.failedLink),
  });

  // Extra days for a subscriber: pushes the billing date and any open invoice's due date, and
  // reactivates a suspended line — an outage credit or "pay me Friday" in one click.
  const extend = useMutation({
    mutationFn: ({ subscriptionId, days, reason }: { subscriptionId: string; days: number; reason: string }) =>
      apiFetch<{ nextBillingAt: string; invoicesMoved: number; reactivated: boolean }>(`/api/v1/subscriptions/${subscriptionId}/extend`, {
        method: "POST",
        body: JSON.stringify({ days, reason: reason || undefined }),
      }),
    onSuccess: (res, vars) => {
      setNotice(
        `Extended by ${vars.days} day${vars.days === 1 ? "" : "s"}: next billing ${new Date(res.nextBillingAt).toLocaleDateString()}` +
          (res.invoicesMoved ? `, ${res.invoicesMoved} open invoice${res.invoicesMoved === 1 ? "" : "s"} moved` : "") +
          (res.reactivated ? ", service reactivated." : ".")
      );
      invalidateAll();
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : t.failedExtend),
  });
  const askExtend = (subscriptionId: string) => {
    const answer = window.prompt("Extend this subscription by how many days?", "7");
    if (answer === null) return;
    const days = Number(answer);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      setError("Enter a whole number of days between 1 and 365.");
      return;
    }
    const reason = window.prompt("Reason (optional, kept in the audit log):", "") ?? "";
    setError(null);
    extend.mutate({ subscriptionId, days, reason });
  };

  // A pause switches the line off and moves the next bill out by the paused days; staff pauses
  // aren't limited by the customer's yearly allowance.
  const pause = useMutation({
    mutationFn: ({ subscriptionId, days }: { subscriptionId: string; days?: number }) =>
      apiFetch<{ pausedUntil: string | null }>(`/api/v1/subscriptions/${subscriptionId}/${days ? "pause" : "resume"}`, {
        method: "POST",
        body: JSON.stringify(days ? { days } : {}),
      }),
    onSuccess: (res) => {
      setNotice(res.pausedUntil ? `${tr("Plan paused until")} ${new Date(res.pausedUntil).toLocaleDateString()}.` : tr("Plan resumed."));
      invalidateAll();
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : tr("Something went wrong.")),
  });
  const askPause = (subscriptionId: string) => {
    const answer = window.prompt(tr("Pause this plan for how many days?"), "14");
    if (answer === null) return;
    const days = Number(answer);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      setError(tr("Enter a whole number of days between 1 and 365."));
      return;
    }
    setError(null);
    pause.mutate({ subscriptionId, days });
  };

  const sendMessage = useMutation({
    mutationFn: () =>
      apiFetch<{ note: string }>(`/api/v1/customers/${customerId}/message`, {
        method: "POST",
        body: JSON.stringify({
          channels: (["EMAIL", "SMS"] as const).filter((c) => msgChannels[c]),
          subject: msgSubject.trim(),
          body: msgBody.trim(),
        }),
      }),
    onSuccess: (res) => {
      setNotice(res.note);
      setMsgSubject("");
      setMsgBody("");
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : t.failedSend),
  });

  const topUp = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/payments/top-up", {
        method: "POST",
        body: JSON.stringify({
          customerId,
          method: "CASH",
          amountMinor: Math.round(Number(topUpAmount) * 100),
        }),
      }),
    onSuccess: () => {
      setTopUpAmount("");
      invalidateAll();
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : t.failedTopUp),
  });

  if (!customer) return <p className="text-sm text-slate-500">{t.loadingDetails}</p>;

  return (
    <div className="space-y-6">
      {/* Header Profile */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {customer.fullName}
            </h1>
            <Badge variant={customer.status === "ACTIVE" ? "success" : "neutral"}>
              <StatusDot status={customer.status} pulse={customer.status === "ACTIVE"} />
              <span>{customer.status}</span>
            </Badge>
          </div>
          <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">
            {t.account} #{customer.customerNumber} · {customer.phone} {customer.email ? `· ${customer.email}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {branches.length > 0 && (
            <select
              aria-label={t.branch}
              value={customer.branchId ?? ""}
              onChange={(e) =>
                apiFetch(`/api/v1/customers/${customer.id}`, { method: "PATCH", body: JSON.stringify({ branchId: e.target.value || null }) })
                  .then(() => queryClient.invalidateQueries({ queryKey: ["customer", customerId] }))
                  .catch((err) => setError(err instanceof ApiRequestError ? err.message : String(err)))
              }
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-slate-200 text-xs"
            >
              <option value="">{t.noBranch}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          <Link href={`/customers/${customer.id}/statement`}>
            <Button variant="secondary" className="px-3 py-1.5 text-xs">
              Statement
            </Button>
          </Link>
          <Link href={`/customers/${customer.id}/install-card`}>
            <Button variant="secondary" className="px-3 py-1.5 text-xs">
              {tr("Install card")}
            </Button>
          </Link>
          {customer.userId ? (
            <Badge variant="success">
              <StatusDot status="ACTIVE" pulse={false} />
              <span>{t.portalLinked}</span>
            </Badge>
          ) : showLinkForm ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                linkAccount.mutate();
              }}
            >
              <Input
                type="email"
                placeholder={t.loginEmailPlaceholder}
                value={linkEmail}
                onChange={(e) => setLinkEmail(e.target.value)}
                className="w-56"
                required
              />
              <Button type="submit" disabled={linkAccount.isPending} className="px-3 py-1.5 text-xs">
                {linkAccount.isPending ? t.linking : t.link}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="px-3 py-1.5 text-xs"
                onClick={() => setShowLinkForm(false)}
              >
                {c.cancel}
              </Button>
            </form>
          ) : (
            <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setShowLinkForm(true)}>
              {t.linkLogin}
            </Button>
          )}
        </div>
      </div>

      {error && <ErrorText>{error}</ErrorText>}

      {/* Package Subscription Box */}
      <Card>
        <h2 className="mb-2 font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <IconPackage size={18} className="text-brand-600 dark:text-brand-400" />
          {t.assignSubscription}
        </h2>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <select
            className="flex-1 min-w-[240px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-slate-100"
            value={selectedPackageId}
            onChange={(e) => setSelectedPackageId(e.target.value)}
          >
            <option value="">{t.selectTier}</option>
            {packages?.items.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.name} — {formatMoney(pkg.priceMinor, pkg.currency)} / {pkg.billingCycle}
              </option>
            ))}
          </select>
          <Button
            disabled={!selectedPackageId || subscribe.isPending}
            onClick={() => {
              setError(null);
              subscribe.mutate();
            }}
          >
            {subscribe.isPending ? t.assigning : t.subscribeCustomer}
          </Button>
        </div>
      </Card>

      {notice && (
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">{notice}</div>
      )}

      {/* Message the customer */}
      <Card>
        <h2 className="mb-1 font-semibold text-slate-900 dark:text-white">{t.messageCustomer}</h2>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          {t.sentBy(customer.email, customer.phone)}
        </p>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <Input placeholder={c.subject} value={msgSubject} onChange={(e) => setMsgSubject(e.target.value)} maxLength={150} />
            <textarea
              value={msgBody}
              onChange={(e) => setMsgBody(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder={t.yourMessage}
              className="w-full rounded-lg border border-slate-300/90 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-slate-100"
            />
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={msgChannels.EMAIL} disabled={!customer.email} onChange={(e) => setMsgChannels((c) => ({ ...c, EMAIL: e.target.checked }))} />
              {c.email}
            </label>
            <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={msgChannels.SMS} onChange={(e) => setMsgChannels((c) => ({ ...c, SMS: e.target.checked }))} />
              {c.sms}
            </label>
            <Button
              disabled={sendMessage.isPending || !msgSubject.trim() || !msgBody.trim() || !((msgChannels.EMAIL && customer.email) || msgChannels.SMS)}
              onClick={() => {
                setError(null);
                sendMessage.mutate();
              }}
            >
              {sendMessage.isPending ? c.sending : c.send}
            </Button>
          </div>
        </div>
      </Card>

      {/* Active Subscriptions Grid */}
      <Card>
        <h2 className="mb-3 font-semibold text-slate-900 dark:text-white">{t.activeSubscriptions}</h2>
        <div className="space-y-3">
          {subscriptions?.map((sub) => (
            <div
              key={sub.id}
              className="rounded-lg border border-slate-200/90 bg-slate-50/60 p-4 text-sm dark:border-obsidian-800 dark:bg-obsidian-950/60"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {sub.package.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {t.nextBilling(new Date(sub.nextBillingAt).toLocaleDateString())}
                    {sub.pausedUntil && ` · ${tr("Paused until")} ${new Date(sub.pausedUntil).toLocaleDateString()}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={sub.status === "ACTIVE" ? "success" : "warning"}>
                    {sub.pausedUntil ? tr("PAUSED") : sub.status}
                  </Badge>
                  {sub.pausedUntil ? (
                    <Button variant="secondary" className="px-2.5 py-1 text-xs" disabled={pause.isPending} onClick={() => pause.mutate({ subscriptionId: sub.id })}>
                      {tr("Resume")}
                    </Button>
                  ) : (
                    sub.status === "ACTIVE" && (
                      <Button variant="secondary" className="px-2.5 py-1 text-xs" disabled={pause.isPending} onClick={() => askPause(sub.id)}>
                        {tr("Pause")}
                      </Button>
                    )
                  )}
                  {sub.status !== "CANCELLED" && (
                    <Button variant="secondary" className="px-2.5 py-1 text-xs" disabled={extend.isPending} onClick={() => askExtend(sub.id)}>
                      {t.extendDays}
                    </Button>
                  )}
                  {!revealed[sub.id] && (
                    <Button
                      variant="secondary"
                      className="px-2.5 py-1 text-xs gap-1"
                      disabled={revealPassword.isPending}
                      onClick={() => {
                        setError(null);
                        revealPassword.mutate(sub.id);
                      }}
                    >
                      <IconShield size={13} />
                      <span>{t.showCredentials}</span>
                    </Button>
                  )}
                </div>
              </div>

              {revealed[sub.id] && (
                <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-950 px-3 py-2.5 font-mono text-xs text-emerald-400 border border-slate-800">
                  <span>{t.usernameLabel}: {revealed[sub.id]!.username}</span>
                  <span>{t.passwordLabel}: {revealed[sub.id]!.password}</span>
                </div>
              )}
            </div>
          ))}
          {subscriptions && subscriptions.length === 0 && (
            <p className="text-xs text-slate-500 py-2">{t.noSubscriptions}</p>
          )}
        </div>
      </Card>

      <AccountMembers base={`/api/v1/customers/${customerId}/members`} />

      {/* Invoices & Wallet in 2 columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Invoices */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <IconInvoice size={18} className="text-brand-600" />
              {t.invoices}
            </h2>
          </div>
          <div className="space-y-2">
            {invoices?.items.map((invoice) => (
              <Link
                key={invoice.id}
                href={`/invoices/${invoice.id}`}
                className="flex items-center justify-between rounded-lg border border-slate-200/60 p-2.5 text-xs hover:bg-slate-50 dark:border-obsidian-800 dark:hover:bg-obsidian-950 transition-colors"
              >
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {invoice.invoiceNumber}
                  </p>
                  <p className="text-slate-500">
                    {c.due(new Date(invoice.dueDate).toLocaleDateString())}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono font-semibold">
                    {formatMoney(invoice.totalMinor, invoice.currency)}
                  </p>
                  <span className="text-[10px] uppercase font-semibold text-slate-500">
                    {invoice.status}
                  </span>
                </div>
              </Link>
            ))}
            {invoices && invoices.items.length === 0 && (
              <p className="text-xs text-slate-500 py-2">{t.noInvoicesYet}</p>
            )}
          </div>
        </Card>

        {/* Wallet */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white">{t.wallet}</h2>
              <p className="text-xs text-slate-500">{t.walletHint}</p>
            </div>
            <span className="font-mono text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {walletData ? formatMoney(walletData.wallet.balanceMinor, walletData.wallet.currency) : "—"}
            </span>
          </div>

          <div className="mb-4 flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="topUpAmount">{t.recordTopUp}</Label>
              <Input
                id="topUpAmount"
                type="number"
                step="0.01"
                placeholder="500.00"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
              />
            </div>
            <Button
              disabled={!topUpAmount || topUp.isPending}
              onClick={() => {
                setError(null);
                topUp.mutate();
              }}
            >
              {topUp.isPending ? t.recording : t.recordTopUpButton}
            </Button>
          </div>

          <div className="space-y-1.5 border-t border-slate-200/80 pt-3 dark:border-obsidian-800 text-xs">
            {walletData?.transactions.map((tx) => (
              <div key={tx.id} className="flex justify-between py-1 font-mono">
                <span className="text-slate-600 dark:text-slate-400 truncate max-w-[200px]">
                  {tx.reason}
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {formatMoney(tx.amountMinor)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <ReferralCard customerId={customerId} />
    </div>
  );
}
