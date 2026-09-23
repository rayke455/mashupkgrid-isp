"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import {
  Alert,
  CHANNEL_LABEL,
  DetailList,
  Dialog,
  Drawer,
  EnvironmentBadge,
  Field,
  LedgerTable,
  Money,
  StatusBadge,
  buttonClass,
  formatDateTime,
  formatKes,
  inputClass,
  percentFromBps,
} from "./kit";
import type { GatewayTransactionDetail } from "./types";

/**
 * One gateway transaction, end to end: the payment, the fee rule it was charged under, every
 * ledger entry it produced, refunds, and the settlement that paid it out. Super admins also get the
 * refund/reversal actions (`admin`); tenants see the same facts, read-only.
 */
export function TransactionDrawer({
  id,
  onClose,
  endpointBase,
  admin = false,
}: {
  id: string | null;
  onClose: () => void;
  endpointBase: string;
  admin?: boolean;
}) {
  const [action, setAction] = useState<"REFUND" | "REVERSAL" | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["gateway-transaction", endpointBase, id],
    queryFn: () => apiFetch<GatewayTransactionDetail>(`${endpointBase}/transactions/${id}`),
    enabled: Boolean(id),
  });

  const remaining = data ? data.grossMinor - data.refundedMinor : 0;
  const canRefund = admin && data && (data.status === "COMPLETED" || data.status === "PARTIALLY_REFUNDED");

  return (
    <Drawer
      open={Boolean(id)}
      onClose={onClose}
      title={data?.txnNumber ?? "Transaction"}
      subtitle={data ? formatDateTime(data.createdAt) : undefined}
      footer={
        canRefund ? (
          <>
            <button type="button" className={buttonClass("secondary")} onClick={() => setAction("REFUND")}>
              Refund
            </button>
            <button type="button" className={buttonClass("danger")} onClick={() => setAction("REVERSAL")}>
              Reverse payment
            </button>
          </>
        ) : undefined
      }
    >
      {isLoading && <div className="h-64 animate-pulse rounded-lg bg-slate-100" />}
      {error && <Alert title="Couldn't load this transaction">{(error as Error).message}</Alert>}
      {data && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={data.status} />
            <StatusBadge status={data.settlementStatus} />
            <EnvironmentBadge environment={data.environment} />
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 p-4 text-center">
            <Amount label="Customer paid" value={<Money minor={data.grossMinor} />} />
            <Amount label={`Fee (${feeRule(data.feePercentBps, data.feeFixedMinor)})`} value={<Money minor={-data.feeMinor} />} />
            <Amount label="Tenant receives" value={<Money minor={data.netMinor} className="text-emerald-700" />} />
          </div>

          <DetailList
            items={[
              ...(data.tenant ? [{ label: "ISP", value: data.tenant.name }] : []),
              { label: "Customer", value: data.customer ? `${data.customer.fullName} · ${data.customer.customerNumber}` : "Walk-in (hotspot)" },
              { label: "Invoice", value: data.invoice?.invoiceNumber ?? "—" },
              { label: "Payment reference", value: data.paymentReference?.reference ?? "—" },
              { label: "Method", value: CHANNEL_LABEL[data.channel] ?? data.channel },
              {
                label: "M-Pesa receipt",
                value: data.providerReference.startsWith("PRV-") ? (
                  <span>
                    {data.providerReference} <span className="text-xs text-amber-700">(provisional — awaiting Safaricom&apos;s receipt)</span>
                  </span>
                ) : (
                  <span className="font-mono">{data.providerReference}</span>
                ),
              },
              { label: "Paid from", value: data.payerPhone ?? "—" },
              { label: "Description", value: data.description },
              {
                label: "Settlement",
                value: data.settlement ? (
                  <span className="inline-flex items-center gap-2">
                    {data.settlement.settlementNumber} <StatusBadge status={data.settlement.status} />
                  </span>
                ) : (
                  "Not yet settled"
                ),
              },
            ]}
          />

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Ledger entries</h3>
            <LedgerTable entries={data.ledgerEntries} />
          </div>

          {data.refunds.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Refunds &amp; reversals</h3>
              <ul className="space-y-2">
                {data.refunds.map((r) => (
                  <RefundRow key={r.id} refund={r} admin={admin} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {data && action && (
        <RefundDialog
          transactionId={data.id}
          txnNumber={data.txnNumber}
          kind={action}
          remainingMinor={remaining}
          onClose={() => setAction(null)}
        />
      )}
    </Drawer>
  );
}

function Amount({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function feeRule(bps: number, fixed: number): string {
  if (bps && fixed) return `${percentFromBps(bps)} + ${formatKes(fixed)}`;
  if (fixed) return formatKes(fixed);
  return percentFromBps(bps);
}

function RefundRow({ refund, admin }: { refund: GatewayTransactionDetail["refunds"][number]; admin: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState("");
  const complete = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/platform/payments/refunds/${refund.id}/complete`, { method: "POST", body: JSON.stringify({ externalReference: reference }) }),
    onSuccess: () => {
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["gateway-transaction"] });
    },
  });
  return (
    <li className="rounded-lg border border-slate-200 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-slate-900">
          {refund.refundNumber} · {refund.kind === "REVERSAL" ? "Reversal" : "Refund"} <Money minor={refund.amountMinor} />
        </span>
        <StatusBadge status={refund.status} />
      </div>
      <p className="mt-1 text-slate-600">{refund.reason}</p>
      <p className="mt-1 text-xs text-slate-500">
        Fee returned to ISP: <Money minor={refund.feeReturnedMinor} />
        {refund.externalReference ? ` · Ref ${refund.externalReference}` : ""} · {formatDateTime(refund.createdAt)}
      </p>
      {admin && refund.status === "PENDING_CUSTOMER_PAYOUT" && (
        <button type="button" className={`${buttonClass("secondary", "sm")} mt-2`} onClick={() => setOpen(true)}>
          Record customer payout
        </button>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Record how ${refund.refundNumber} was paid back`}
        footer={
          <>
            <button type="button" className={buttonClass("ghost")} onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className={buttonClass("primary")} disabled={reference.trim().length < 3 || complete.isPending} onClick={() => complete.mutate()}>
              {complete.isPending ? "Saving…" : "Mark as paid back"}
            </button>
          </>
        }
      >
        <p>Enter the M-Pesa or bank reference of the money sent back to the customer.</p>
        <Field label="Reference" htmlFor={`ref-${refund.id}`}>
          <input id={`ref-${refund.id}`} className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        {complete.error && <Alert>{(complete.error as ApiRequestError).message}</Alert>}
      </Dialog>
    </li>
  );
}

function RefundDialog({
  transactionId,
  txnNumber,
  kind,
  remainingMinor,
  onClose,
}: {
  transactionId: string;
  txnNumber: string;
  kind: "REFUND" | "REVERSAL";
  remainingMinor: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [returned, setReturned] = useState(false);
  const [reference, setReference] = useState("");
  const amountMinor = Math.round(Number(amount.replace(/,/g, "")) * 100);
  const validAmount = kind === "REVERSAL" || (Number.isFinite(amountMinor) && amountMinor > 0 && amountMinor <= remainingMinor);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/platform/payments/transactions/${transactionId}/refunds`, {
        method: "POST",
        body: JSON.stringify({
          kind,
          reason,
          ...(kind === "REFUND" ? { amountMinor } : { moneyAlreadyReturned: returned }),
          ...(reference.trim() ? { externalReference: reference.trim() } : {}),
        }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries();
      onClose();
    },
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={kind === "REVERSAL" ? `Reverse ${txnNumber}` : `Refund part of ${txnNumber}`}
      footer={
        <>
          <button type="button" className={buttonClass("ghost")} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={buttonClass(kind === "REVERSAL" ? "danger" : "primary")}
            disabled={!validAmount || reason.trim().length < 3 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Recording…" : kind === "REVERSAL" ? `Reverse ${formatKes(remainingMinor)}` : "Record refund"}
          </button>
        </>
      }
    >
      <p>
        {kind === "REVERSAL"
          ? "The remaining amount comes off the ISP's balance, their platform fee is returned, and the invoice is reopened. The original transaction stays on record."
          : "The refunded amount comes off the ISP's balance with a proportional share of the fee returned. The invoice is not changed."}
      </p>
      {kind === "REFUND" && (
        <Field label="Amount (KES)" htmlFor="refund-amount" hint={`Up to ${formatKes(remainingMinor)}`}>
          <input id="refund-amount" inputMode="decimal" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </Field>
      )}
      <Field label="Reason" htmlFor="refund-reason">
        <textarea id="refund-reason" rows={2} className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {kind === "REVERSAL" && (
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-1" checked={returned} onChange={(e) => setReturned(e.target.checked)} />
          <span>Safaricom has already returned the money to the customer (e.g. an M-Pesa reversal). Leave unticked if someone still has to pay them back.</span>
        </label>
      )}
      <Field label="Reference (optional)" htmlFor="refund-ref" hint="Safaricom reversal or transfer reference, if you have one.">
        <input id="refund-ref" className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} />
      </Field>
      {mutation.error && <Alert>{(mutation.error as ApiRequestError).message}</Alert>}
    </Dialog>
  );
}
