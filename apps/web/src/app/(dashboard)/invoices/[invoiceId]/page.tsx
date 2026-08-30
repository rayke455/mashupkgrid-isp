"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";
import { Button, Card, ErrorText, Input, Label, Badge, StatusDot } from "@/components/ui";
import { IconMpesa, IconCheck, IconInvoice } from "@/components/icons";

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  totalMinor: number;
}

interface Payment {
  id: string;
  method: string;
  status: string;
  amountMinor: number;
  createdAt: string;
}

interface Invoice {
  id: string;
  customerId: string;
  invoiceNumber: string;
  status: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  amountPaidMinor: number;
  currency: string;
  dueDate: string;
  items: InvoiceItem[];
  payments: Payment[];
}

interface StkStatus {
  status: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
  resultDesc: string | null;
  unresolvedSuccess?: boolean;
}

const METHODS = ["CASH", "BANK_TRANSFER", "WALLET", "MANUAL"] as const;

export default function InvoiceDetailPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<(typeof METHODS)[number]>("CASH");
  const [error, setError] = useState<string | null>(null);
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);

  const { data: invoice } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => apiFetch<Invoice>(`/api/v1/invoices/${invoiceId}`),
  });

  const recordPayment = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/payments/record", {
        method: "POST",
        body: JSON.stringify({ invoiceId, method, amountMinor: Math.round(Number(amount) * 100) }),
      }),
    onSuccess: () => {
      setAmount("");
      queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to record payment"),
  });

  const initiateStkPush = useMutation({
    mutationFn: () =>
      apiFetch<{ checkoutRequestId: string }>("/api/v1/payments/mpesa/stk-push", {
        method: "POST",
        body: JSON.stringify({
          customerId: invoice?.customerId,
          invoiceId,
          phone: mpesaPhone,
          amountMinor: invoice ? invoice.totalMinor - invoice.amountPaidMinor : 0,
        }),
      }),
    onSuccess: (result) => setCheckoutRequestId(result.checkoutRequestId),
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to initiate M-Pesa push"),
  });

  const initiatePaystack = useMutation({
    mutationFn: () =>
      apiFetch<{ authorizationUrl: string; transaction: { reference: string } }>("/api/v1/payments/paystack/initialize", {
        method: "POST",
        body: JSON.stringify({
          customerId: invoice?.customerId,
          invoiceId,
          amountMinor: invoice ? invoice.totalMinor - invoice.amountPaidMinor : 0,
        }),
      }),
    onSuccess: (result) => {
      window.location.href = result.authorizationUrl;
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to initiate Paystack checkout"),
  });

  const { data: stkStatus } = useQuery({
    queryKey: ["mpesa-stk-status", checkoutRequestId],
    queryFn: () => apiFetch<StkStatus>(`/api/v1/payments/mpesa/stk-push/${checkoutRequestId}`),
    enabled: !!checkoutRequestId,
    refetchInterval: (query) => (query.state.data?.status === "PENDING" ? 3000 : false),
  });

  useEffect(() => {
    if (stkStatus?.status === "COMPLETED") {
      queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    }
  }, [stkStatus?.status, queryClient, invoiceId]);

  if (!invoice) return <p className="text-sm text-slate-500">Loading invoice...</p>;
  const remainingMinor = invoice.totalMinor - invoice.amountPaidMinor;

  const badgeVariant =
    invoice.status === "PAID"
      ? "success"
      : invoice.status === "PENDING" || invoice.status === "PARTIALLY_PAID"
      ? "warning"
      : invoice.status === "OVERDUE"
      ? "danger"
      : "neutral";

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-mono">
              {invoice.invoiceNumber}
            </h1>
            <Badge variant={badgeVariant}>
              <StatusDot status={invoice.status} pulse={invoice.status === "PENDING"} />
              <span>{invoice.status}</span>
            </Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Due {new Date(invoice.dueDate).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Invoice Breakdown Card */}
      <Card className="divide-y divide-slate-200/80 dark:divide-obsidian-800">
        <div className="pb-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
            Billed Items
          </h2>
          <div className="space-y-2 text-sm font-mono">
            {invoice.items.map((item) => (
              <div key={item.id} className="flex justify-between py-1">
                <span className="text-slate-700 dark:text-slate-300">
                  {item.description} <span className="text-xs text-slate-400">× {item.quantity}</span>
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {formatMoney(item.totalMinor, invoice.currency)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="py-4 space-y-2 text-sm font-mono">
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>Subtotal</span>
            <span>{formatMoney(invoice.subtotalMinor, invoice.currency)}</span>
          </div>
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>Tax (16% VAT)</span>
            <span>{formatMoney(invoice.taxMinor, invoice.currency)}</span>
          </div>
          <div className="flex justify-between font-bold text-base text-slate-900 dark:text-white pt-1">
            <span>Total Invoiced</span>
            <span>{formatMoney(invoice.totalMinor, invoice.currency)}</span>
          </div>
          <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
            <span>Amount Paid</span>
            <span>{formatMoney(invoice.amountPaidMinor, invoice.currency)}</span>
          </div>
          <div className="flex justify-between font-bold text-base text-rose-600 dark:text-rose-400 pt-1 border-t border-slate-200 dark:border-obsidian-800">
            <span>Balance Due</span>
            <span>{formatMoney(remainingMinor, invoice.currency)}</span>
          </div>
        </div>
      </Card>

      {/* Online Gateway Payment Card (M-Pesa STK + Paystack Card/Bank) */}
      {remainingMinor > 0 && (invoice.status === "PENDING" || invoice.status === "PARTIALLY_PAID" || invoice.status === "OVERDUE") && (
        <Card className="border-emerald-500/40 bg-emerald-50/20 dark:bg-emerald-950/20 space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <IconMpesa className="text-emerald-600 dark:text-emerald-400" />
              <h2 className="font-semibold text-slate-900 dark:text-white">Instant Online Payment</h2>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Collect payment via M-Pesa STK Push or Paystack (Cards, Apple Pay, Bank Transfer).
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-emerald-500/20">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="mpesaPhone">M-Pesa Phone Number</Label>
              <Input
                id="mpesaPhone"
                placeholder="0712345678"
                value={mpesaPhone}
                onChange={(e) => setMpesaPhone(e.target.value)}
                disabled={stkStatus?.status === "PENDING"}
              />
            </div>
            <Button
              disabled={!mpesaPhone || initiateStkPush.isPending || stkStatus?.status === "PENDING"}
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => {
                setError(null);
                setCheckoutRequestId(null);
                initiateStkPush.mutate();
              }}
            >
              {initiateStkPush.isPending ? "Triggering..." : `Pay ${formatMoney(remainingMinor, invoice.currency)} via M-Pesa`}
            </Button>
            <Button
              variant="secondary"
              disabled={initiatePaystack.isPending}
              className="border-purple-500/40 text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-950/40"
              onClick={() => {
                setError(null);
                initiatePaystack.mutate();
              }}
            >
              {initiatePaystack.isPending ? "Connecting..." : "💳 Pay via Paystack"}
            </Button>
          </div>

          {checkoutRequestId && stkStatus && (
            <div className="mt-4 rounded-lg p-3 text-xs font-mono border border-slate-200 dark:border-obsidian-800 bg-white dark:bg-obsidian-950">
              {stkStatus.status === "PENDING" && (
                <p className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                  Prompt dispatched — waiting for subscriber to enter M-Pesa PIN...
                </p>
              )}
              {stkStatus.status === "COMPLETED" && (
                <p className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold">
                  <IconCheck size={14} />
                  Payment confirmed! Invoice reconciled and session unlocked.
                </p>
              )}
              {stkStatus.status === "FAILED" && (
                <p className="text-rose-600 dark:text-rose-400">
                  Payment failed: {stkStatus.resultDesc ?? "Subscriber PIN cancelled or insufficient funds."}
                </p>
              )}
              {stkStatus.status === "CANCELLED" && (
                <p className="text-amber-600">The subscriber cancelled the prompt.</p>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Manual Payment Recording */}
      {remainingMinor > 0 && (invoice.status === "PENDING" || invoice.status === "PARTIALLY_PAID" || invoice.status === "OVERDUE") && (
        <Card>
          <h2 className="mb-3 font-semibold text-slate-900 dark:text-white">Record Manual Payment</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="amount">Amount Paid (KES)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="1000.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="method">Payment Method</Label>
              <select
                id="method"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-slate-100"
                value={method}
                onChange={(e) => setMethod(e.target.value as (typeof METHODS)[number])}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <Button
              disabled={!amount || recordPayment.isPending}
              onClick={() => {
                setError(null);
                recordPayment.mutate();
              }}
            >
              {recordPayment.isPending ? "Recording..." : "Record Payment"}
            </Button>
          </div>
          {error && <ErrorText>{error}</ErrorText>}
        </Card>
      )}

      {/* Payment History Table */}
      <Card>
        <h2 className="mb-3 font-semibold text-slate-900 dark:text-white">Payment Ledger</h2>
        <div className="space-y-2">
          {invoice.payments.map((payment) => (
            <div
              key={payment.id}
              className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 p-2.5 text-xs font-mono dark:border-obsidian-800 dark:bg-obsidian-950/40"
            >
              <div>
                <span className="font-semibold text-slate-900 dark:text-white">{payment.method}</span>
                <span className="ml-2 text-slate-500">
                  {new Date(payment.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 dark:text-white">
                  {formatMoney(payment.amountMinor, invoice.currency)}
                </span>
                <Badge variant={payment.status === "COMPLETED" ? "success" : "neutral"}>
                  {payment.status}
                </Badge>
              </div>
            </div>
          ))}
          {invoice.payments.length === 0 && (
            <p className="text-xs text-slate-500 py-2">No payments recorded against this invoice yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
