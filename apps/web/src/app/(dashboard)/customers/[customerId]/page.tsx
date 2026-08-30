"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
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
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [topUpAmount, setTopUpAmount] = useState("");
  const [revealed, setRevealed] = useState<Record<string, { username: string; password: string }>>({});
  const [linkEmail, setLinkEmail] = useState("");
  const [showLinkForm, setShowLinkForm] = useState(false);

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
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to subscribe"),
  });

  const revealPassword = useMutation({
    mutationFn: (subscriptionId: string) =>
      apiFetch<{ username: string; password: string }>(
        `/api/v1/radius/users/${subscriptionId}/reveal-password`,
        { method: "POST" }
      ),
    onSuccess: (data, subscriptionId) => setRevealed((prev) => ({ ...prev, [subscriptionId]: data })),
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to reveal password"),
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
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to link account"),
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
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to top up wallet"),
  });

  if (!customer) return <p className="text-sm text-slate-500">Loading subscriber details...</p>;

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
            Account #{customer.customerNumber} · {customer.phone} {customer.email ? `· ${customer.email}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {customer.userId ? (
            <Badge variant="success">
              <StatusDot status="ACTIVE" pulse={false} />
              <span>Self-service portal linked</span>
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
                placeholder="customer's login email"
                value={linkEmail}
                onChange={(e) => setLinkEmail(e.target.value)}
                className="w-56"
                required
              />
              <Button type="submit" disabled={linkAccount.isPending} className="px-3 py-1.5 text-xs">
                {linkAccount.isPending ? "Linking..." : "Link"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="px-3 py-1.5 text-xs"
                onClick={() => setShowLinkForm(false)}
              >
                Cancel
              </Button>
            </form>
          ) : (
            <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setShowLinkForm(true)}>
              Link self-service login
            </Button>
          )}
        </div>
      </div>

      {error && <ErrorText>{error}</ErrorText>}

      {/* Package Subscription Box */}
      <Card>
        <h2 className="mb-2 font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <IconPackage size={18} className="text-brand-600 dark:text-brand-400" />
          Assign Broadband Subscription
        </h2>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <select
            className="flex-1 min-w-[240px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-slate-100"
            value={selectedPackageId}
            onChange={(e) => setSelectedPackageId(e.target.value)}
          >
            <option value="">Select an active bandwidth tier...</option>
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
            {subscribe.isPending ? "Assigning & provisioning..." : "Subscribe Customer"}
          </Button>
        </div>
      </Card>

      {/* Active Subscriptions Grid */}
      <Card>
        <h2 className="mb-3 font-semibold text-slate-900 dark:text-white">Active PPPoE Subscriptions</h2>
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
                    Next billing date: {new Date(sub.nextBillingAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={sub.status === "ACTIVE" ? "success" : "warning"}>
                    {sub.status}
                  </Badge>
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
                      <span>Show PPPoE Credentials</span>
                    </Button>
                  )}
                </div>
              </div>

              {revealed[sub.id] && (
                <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-950 px-3 py-2.5 font-mono text-xs text-emerald-400 border border-slate-800">
                  <span>Username: {revealed[sub.id]!.username}</span>
                  <span>Password: {revealed[sub.id]!.password}</span>
                </div>
              )}
            </div>
          ))}
          {subscriptions && subscriptions.length === 0 && (
            <p className="text-xs text-slate-500 py-2">No active subscriptions on this subscriber account.</p>
          )}
        </div>
      </Card>

      {/* Invoices & Wallet in 2 columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Invoices */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <IconInvoice size={18} className="text-brand-600" />
              Invoices
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
                    Due {new Date(invoice.dueDate).toLocaleDateString()}
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
              <p className="text-xs text-slate-500 py-2">No invoices generated yet.</p>
            )}
          </div>
        </Card>

        {/* Wallet */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white">Customer Wallet</h2>
              <p className="text-xs text-slate-500">Prepaid balance for auto-renewals</p>
            </div>
            <span className="font-mono text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {walletData ? formatMoney(walletData.wallet.balanceMinor, walletData.wallet.currency) : "—"}
            </span>
          </div>

          <div className="mb-4 flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="topUpAmount">Record Cash / Manual Top-up</Label>
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
              {topUp.isPending ? "Recording..." : "Record Top-up"}
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
    </div>
  );
}
