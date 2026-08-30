"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Card, Button, Input, Label, Badge, StatusDot, ErrorText, HintText } from "@/components/ui";
import { IconLayers } from "@/components/icons";

interface TenantPlanSummary {
  id: string;
  name: string;
  monthlyPriceMinor: number;
  annualPriceMinor: number | null;
  maxCustomers: number | null;
  maxRouters: number | null;
}

interface Subscription {
  id: string;
  status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "EXPIRED" | "CANCELLED";
  billingCycle: "MONTHLY" | "ANNUAL";
  currentPeriodEnd: string;
  plan: TenantPlanSummary;
}

interface UsageLimit {
  used: number;
  limit: number | null;
}

interface SubscriptionPayment {
  id: string;
  amountMinor: number;
  status: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
  mpesaReceiptNumber: string | null;
  createdAt: string;
}

interface BillingResponse {
  subscription: Subscription;
  usage: { customers: UsageLimit; routers: UsageLimit };
  payments: SubscriptionPayment[];
}

const STATUS_META: Record<Subscription["status"], { label: string; variant: "success" | "warning" | "danger" | "info" | "neutral" }> = {
  TRIALING: { label: "Trial", variant: "info" },
  ACTIVE: { label: "Active", variant: "success" },
  PAST_DUE: { label: "Past Due", variant: "warning" },
  EXPIRED: { label: "Expired", variant: "danger" },
  CANCELLED: { label: "Cancelled", variant: "neutral" },
};

function formatMinor(amountMinor: number): string {
  return `KES ${(amountMinor / 100).toLocaleString()}`;
}

function UsageBar({ label, usage }: { label: string; usage: UsageLimit }) {
  const pct = usage.limit ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-medium text-slate-600 dark:text-slate-300">{label}</span>
        <span className="text-slate-400">{usage.used} / {usage.limit ?? "Unlimited"}</span>
      </div>
      {usage.limit !== null && (
        <div className="h-1.5 rounded-full bg-slate-100 dark:bg-obsidian-800 overflow-hidden">
          <div
            className={`h-full rounded-full ${pct >= 100 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-brand-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default function BillingPage() {
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["billing"],
    queryFn: () => apiFetch<BillingResponse>("/api/v1/billing"),
    refetchInterval: (query) =>
      query.state.data?.payments[0]?.status === "PENDING" ? 3000 : false,
  });

  const renew = useMutation({
    mutationFn: () => apiFetch("/api/v1/billing/renew", { method: "POST", body: JSON.stringify({ phone }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["billing"] }),
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to start renewal"),
  });

  if (isLoading || !data) {
    return <p className="text-sm text-slate-500">Loading subscription...</p>;
  }

  const { subscription, usage, payments } = data;
  const meta = STATUS_META[subscription.status];
  const price =
    subscription.billingCycle === "ANNUAL"
      ? subscription.plan.annualPriceMinor ?? subscription.plan.monthlyPriceMinor * 12
      : subscription.plan.monthlyPriceMinor;
  const latestPayment = payments[0];
  const periodEnd = new Date(subscription.currentPeriodEnd);
  const daysLeft = Math.ceil((periodEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <IconLayers size={18} className="text-brand-600 dark:text-brand-400" />
          My Subscription
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Your current plan, usage, and renewal history.
        </p>
      </div>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Current Plan</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{subscription.plan.name}</p>
          </div>
          <Badge variant={meta.variant}>
            <StatusDot status={meta.variant === "success" ? "ONLINE" : meta.variant === "danger" ? "DOWN" : "UNKNOWN"} />
            <span>{meta.label}</span>
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-slate-400 text-xs">Price</p>
            <p className="font-medium text-slate-800 dark:text-slate-200">
              {formatMinor(price)} / {subscription.billingCycle === "ANNUAL" ? "year" : "month"}
            </p>
          </div>
          <div>
            <p className="text-slate-400 text-xs">
              {subscription.status === "TRIALING" ? "Trial ends" : "Renews / due"}
            </p>
            <p className="font-medium text-slate-800 dark:text-slate-200">
              {periodEnd.toLocaleDateString()} ({daysLeft >= 0 ? `${daysLeft} days left` : "overdue"})
            </p>
          </div>
        </div>
        <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-obsidian-800">
          <UsageBar label="Customers" usage={usage.customers} />
          <UsageBar label="Routers" usage={usage.routers} />
        </div>
      </Card>

      <Card className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Renew Now</p>
        <div>
          <Label htmlFor="phone">M-Pesa Phone Number</Label>
          <Input
            id="phone"
            placeholder="0712345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={latestPayment?.status === "PENDING"}
          />
          <HintText>You&apos;ll receive an STK push prompt on this number for {formatMinor(price)}.</HintText>
        </div>
        <Button
          disabled={!phone || renew.isPending || latestPayment?.status === "PENDING"}
          onClick={() => {
            setError(null);
            renew.mutate();
          }}
        >
          {latestPayment?.status === "PENDING" ? "Waiting for payment..." : renew.isPending ? "Starting..." : "Renew Now"}
        </Button>
        {error && <ErrorText>{error}</ErrorText>}
      </Card>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Payment History</p>
        {payments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-obsidian-800 p-6 text-center">
            <p className="text-sm text-slate-500">No payments yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {payments.map((payment) => (
              <Card key={payment.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    {formatMinor(payment.amountMinor)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(payment.createdAt).toLocaleString()}
                    {payment.mpesaReceiptNumber ? ` · ${payment.mpesaReceiptNumber}` : ""}
                  </p>
                </div>
                <Badge
                  variant={
                    payment.status === "COMPLETED"
                      ? "success"
                      : payment.status === "PENDING"
                      ? "warning"
                      : "danger"
                  }
                >
                  {payment.status}
                </Badge>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
