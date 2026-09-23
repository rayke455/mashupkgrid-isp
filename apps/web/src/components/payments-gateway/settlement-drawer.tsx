"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import {
  Alert,
  DESTINATION_LABEL,
  DetailList,
  Dialog,
  Drawer,
  EnvironmentBadge,
  Field,
  LedgerTable,
  Money,
  PROVIDER_LABEL,
  StatusBadge,
  buttonClass,
  formatDateTime,
  inputClass,
} from "./kit";
import type { SettlementDetail } from "./types";

/**
 * A settlement's full story: where it went, each state it passed through with its timestamp,
 * the ledger entries behind it, and the payments it covered. Admin actions are offered only for
 * the states they are valid in — the API enforces the same rules.
 */
export function SettlementDrawer({
  id,
  onClose,
  endpointBase,
  admin = false,
  sandboxActions = false,
}: {
  id: string | null;
  onClose: () => void;
  endpointBase: string;
  admin?: boolean;
  sandboxActions?: boolean;
}) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<null | "cancel" | "resolve-settled" | "resolve-failed">(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["settlement", endpointBase, id],
    queryFn: () => apiFetch<SettlementDetail>(`${endpointBase}/settlements/${id}`),
    enabled: Boolean(id),
  });

  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) =>
      apiFetch(`/api/v1/platform/payments/settlements/${id}/${path}`, { method: "POST", body: JSON.stringify(body ?? {}) }),
    onSuccess: () => void qc.invalidateQueries(),
  });

  const footer =
    admin && data ? (
      <>
        {data.status === "AWAITING_APPROVAL" && (
          <>
            <button type="button" className={buttonClass("secondary")} onClick={() => setDialog("cancel")}>
              Cancel
            </button>
            <button type="button" className={buttonClass("primary")} disabled={act.isPending} onClick={() => act.mutate({ path: "approve" })}>
              {data.provider === "MANUAL" ? "Approve for manual transfer" : "Approve & send"}
            </button>
          </>
        )}
        {data.status === "REQUESTED" && (
          <button type="button" className={buttonClass("secondary")} onClick={() => setDialog("cancel")}>
            Cancel
          </button>
        )}
        {data.status === "PROCESSING" && (
          <>
            {sandboxActions && data.provider === "SANDBOX" && data.originatorConversationId && (
              <>
                <button type="button" className={buttonClass("secondary")} disabled={act.isPending} onClick={() => act.mutate({ path: "simulate", body: { success: false } })}>
                  Simulate failure
                </button>
                <button type="button" className={buttonClass("secondary")} disabled={act.isPending} onClick={() => act.mutate({ path: "simulate", body: { success: true } })}>
                  Simulate success
                </button>
              </>
            )}
            <button type="button" className={buttonClass("secondary")} onClick={() => setDialog("resolve-failed")}>
              Mark failed
            </button>
            <button type="button" className={buttonClass("primary")} onClick={() => setDialog("resolve-settled")}>
              Mark settled
            </button>
          </>
        )}
        {data.status === "FAILED" && !data.retry && (
          <button type="button" className={buttonClass("primary")} disabled={act.isPending} onClick={() => act.mutate({ path: "retry" })}>
            Retry settlement
          </button>
        )}
      </>
    ) : undefined;

  return (
    <Drawer open={Boolean(id)} onClose={onClose} title={data?.settlementNumber ?? "Settlement"} subtitle={data?.tenant?.name} footer={footer}>
      {isLoading && <div className="h-64 animate-pulse rounded-lg bg-slate-100" />}
      {error && <Alert title="Couldn't load this settlement">{(error as Error).message}</Alert>}
      {act.error && (
        <div className="mb-4">
          <Alert>{(act.error as ApiRequestError).message}</Alert>
        </div>
      )}
      {data && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={data.status} />
            <EnvironmentBadge environment={data.environment} />
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm text-slate-500">Amount</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">
              <Money minor={data.amountMinor} />
            </p>
            <p className="mt-1 text-sm text-slate-600">
              to {data.destinationSnapshot?.label ?? DESTINATION_LABEL[data.destinationType] ?? data.destinationType}
              {data.destinationSnapshot?.accountName ? ` · ${data.destinationSnapshot.accountName}` : ""}
            </p>
          </div>

          {(data.timedOutAt || (data.status === "PROCESSING" && data.failureReason)) && (
            <Alert tone="amber" title="Outcome unknown — needs a person">
              {data.timedOutAt ? "M-Pesa reported a queue timeout. " : `${data.failureReason} `}
              The balance stays reserved until this is resolved. Confirm with Safaricom, then mark it settled (with the transaction reference) or failed.
            </Alert>
          )}
          {data.status === "FAILED" && data.failureReason && <Alert title="Why it failed">{data.failureReason}. The amount was returned to the ISP&apos;s balance.</Alert>}
          {data.provider === "MANUAL" && data.status === "PROCESSING" && (
            <Alert tone="blue" title="Manual transfer">
              Make the bank transfer, then record its reference with “Mark settled”. Nothing is marked as paid without it.
            </Alert>
          )}

          <Timeline settlement={data} />

          <DetailList
            items={[
              { label: "Method", value: PROVIDER_LABEL[data.provider] ?? data.provider },
              { label: "Triggered by", value: { AUTOMATIC: "Automatic schedule", TENANT_REQUEST: "ISP request", ADMIN: "Administrator" }[data.trigger] },
              { label: "Provider reference", value: data.transactionId ? <span className="font-mono">{data.transactionId}</span> : "—" },
              ...(data.retryOf ? [{ label: "Retry of", value: data.retryOf.settlementNumber }] : []),
              ...(data.retry ? [{ label: "Retried as", value: data.retry.settlementNumber }] : []),
              ...(data.notes ? [{ label: "Notes", value: data.notes }] : []),
            ]}
          />

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Ledger entries</h3>
            <LedgerTable entries={data.ledgerEntries} />
          </div>

          {data.gatewayTransactions.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Payments covered ({data.gatewayTransactions.length})</h3>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
                {data.gatewayTransactions.slice(0, 50).map((t) => (
                  <li key={t.id} className="flex items-center justify-between px-3 py-2">
                    <span className="font-mono text-xs text-slate-600">{t.txnNumber}</span>
                    <Money minor={t.netMinor} className="text-slate-900" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {data && dialog === "cancel" && (
        <ReasonDialog
          title={`Cancel ${data.settlementNumber}`}
          description="The reserved amount goes back to the ISP's available balance."
          confirm="Cancel settlement"
          danger
          onClose={() => setDialog(null)}
          onConfirm={(reason) => act.mutateAsync({ path: "cancel", body: { reason } }).then(() => setDialog(null))}
        />
      )}
      {data && dialog === "resolve-settled" && (
        <ReasonDialog
          title={`Mark ${data.settlementNumber} as settled`}
          description="Only after you have confirmed the transfer arrived. The reference is required and kept on the audit trail."
          confirm="Mark settled"
          withReference
          onClose={() => setDialog(null)}
          onConfirm={(notes, reference) => act.mutateAsync({ path: "resolve", body: { outcome: "SETTLED", reference, notes } }).then(() => setDialog(null))}
        />
      )}
      {data && dialog === "resolve-failed" && (
        <ReasonDialog
          title={`Mark ${data.settlementNumber} as failed`}
          description="Only if you have confirmed no money was sent. The amount returns to the ISP's balance and can be retried."
          confirm="Mark failed"
          danger
          onClose={() => setDialog(null)}
          onConfirm={(notes) => act.mutateAsync({ path: "resolve", body: { outcome: "FAILED", notes } }).then(() => setDialog(null))}
        />
      )}
    </Drawer>
  );
}

function Timeline({ settlement: s }: { settlement: SettlementDetail }) {
  const steps: { label: string; at: string | null; state: "done" | "current" | "todo" | "bad" }[] = [
    { label: "Requested", at: s.createdAt, state: "done" },
    ...(s.approvedAt || s.status === "AWAITING_APPROVAL"
      ? [{ label: "Approved", at: s.approvedAt, state: (s.approvedAt ? "done" : "current") as "done" | "current" }]
      : []),
    {
      label: s.provider === "MANUAL" ? "Transfer in progress" : "Sent to provider",
      at: s.processingStartedAt,
      state: s.processingStartedAt ? "done" : s.status === "REQUESTED" ? "current" : "todo",
    },
  ];
  if (s.status === "FAILED") steps.push({ label: "Failed", at: s.failedAt, state: "bad" });
  else if (s.status === "CANCELLED") steps.push({ label: "Cancelled", at: s.cancelledAt, state: "bad" });
  else {
    if (s.provider !== "MANUAL") {
      steps.push({ label: "Provider confirmed", at: s.providerConfirmedAt, state: s.providerConfirmedAt ? "done" : s.status === "PROCESSING" ? "current" : "todo" });
    }
    steps.push({ label: "Settled", at: s.completedAt, state: s.status === "SETTLED" ? "done" : "todo" });
  }

  return (
    <ol className="space-y-3">
      {steps.map((step) => (
        <li key={step.label} className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
              step.state === "done" ? "bg-emerald-500" : step.state === "current" ? "bg-amber-500 ring-4 ring-amber-100" : step.state === "bad" ? "bg-red-500" : "bg-slate-200"
            }`}
          />
          <div className="text-sm">
            <p className={step.state === "todo" ? "text-slate-400" : "font-medium text-slate-900"}>{step.label}</p>
            {step.at && <p className="text-xs text-slate-500">{formatDateTime(step.at)}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function ReasonDialog({
  title,
  description,
  confirm,
  danger,
  withReference,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  confirm: string;
  danger?: boolean;
  withReference?: boolean;
  onClose: () => void;
  onConfirm: (notes: string, reference?: string) => Promise<unknown>;
}) {
  const [notes, setNotes] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ready = notes.trim().length >= 3 && (!withReference || reference.trim().length >= 3);
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <button type="button" className={buttonClass("ghost")} onClick={onClose}>
            Back
          </button>
          <button
            type="button"
            className={buttonClass(danger ? "danger" : "primary")}
            disabled={!ready || busy}
            onClick={() => {
              setBusy(true);
              setErr(null);
              onConfirm(notes.trim(), reference.trim() || undefined)
                .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Something went wrong"))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "Saving…" : confirm}
          </button>
        </>
      }
    >
      <p>{description}</p>
      {withReference && (
        <Field label="M-Pesa or bank reference" htmlFor="settle-ref">
          <input id="settle-ref" className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
      )}
      <Field label={withReference ? "Notes" : "Reason"} htmlFor="settle-notes">
        <textarea id="settle-notes" rows={2} className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {err && <Alert>{err}</Alert>}
    </Dialog>
  );
}
