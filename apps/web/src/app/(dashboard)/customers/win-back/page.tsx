"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";
import { tr } from "@/lib/tr";
import { useAuth } from "@/lib/auth-context";
import { EmptyState, Metric, MetricGrid, Notice, PageHeader, Panel, Pill, TableShell, darkButton, td, th } from "@/components/dashboard/surface";

/**
 * Win-back offers: customers at risk of leaving get a text offering a share of their next
 * payment back as credit if they pay within a few days. Shows who came back and what that
 * recovered, who could get an offer next, and the offer settings.
 */

interface Offer {
  id: string;
  reason: string;
  owedMinor: number;
  discountPercent: number;
  status: "SENT" | "REDEEMED" | "EXPIRED" | "FAILED";
  sentAt: string;
  expiresAt: string;
  paidMinor: number | null;
  creditMinor: number | null;
  sentByUserId: string | null;
  customer: { id: string; fullName: string; customerNumber: string };
}

interface Report {
  days: number;
  sent: number;
  waiting: number;
  redeemed: number;
  failed: number;
  conversionPercent: number | null;
  recoveredMinor: number;
  creditMinor: number;
  offers: Offer[];
}

interface Candidate {
  customerId: string;
  fullName: string;
  customerNumber: string;
  reason: string;
  owedMinor: number;
}

interface Preferences {
  winBack: { enabled: boolean; discountPercent: number; validDays: number; minDaysBetween: number };
  [k: string]: unknown;
}

const TONE = { SENT: "warn", REDEEMED: "good", EXPIRED: "neutral", FAILED: "bad" } as const;
const LABEL = { SENT: "Waiting", REDEEMED: "Came back", EXPIRED: "Expired", FAILED: "SMS failed" } as const;

export default function WinBackPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canSend = user?.permissions.includes("customers.update") ?? false;
  const canManage = user?.permissions.includes("settings.manage") ?? false;
  const { data: report } = useQuery({ queryKey: ["win-back"], queryFn: () => apiFetch<Report>("/api/v1/win-back") });
  const { data: candidates } = useQuery({ queryKey: ["win-back-candidates"], queryFn: () => apiFetch<Candidate[]>("/api/v1/win-back/candidates") });
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  const send = useMutation({
    mutationFn: (c: Candidate) => apiFetch<{ delivered: boolean }>("/api/v1/win-back/send", { method: "POST", body: JSON.stringify({ customerId: c.customerId }) }),
    onSuccess: (res, c) => {
      setNotice(res.delivered ? { tone: "good", text: `${tr("Offer sent to")} ${c.fullName}.` } : { tone: "bad", text: tr("The SMS could not be sent. Check the SMS gateway under Settings.") });
      void qc.invalidateQueries({ queryKey: ["win-back"] });
      void qc.invalidateQueries({ queryKey: ["win-back-candidates"] });
    },
    onError: (err) => setNotice({ tone: "bad", text: err instanceof ApiRequestError ? err.message : tr("Something went wrong.") }),
  });

  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHeader
        title={tr("Win-back offers")}
        description={tr("Customers who are suspended, overdue or have stopped paying get a text: pay within a few days and get part of it back as credit. See who came back.")}
      />

      {report && (
        <MetricGrid columns={4}>
          <Metric label={tr("Offers sent")} value={String(report.sent)} hint={`${tr("Last 90 days")}${report.waiting ? ` · ${report.waiting} ${tr("waiting")}` : ""}`} />
          <Metric label={tr("Came back")} value={String(report.redeemed)} hint={report.conversionPercent !== null ? `${report.conversionPercent}% ${tr("of finished offers")}` : tr("No finished offers yet")} tone={report.redeemed ? "good" : undefined} />
          <Metric label={tr("Recovered")} value={formatMoney(report.recoveredMinor, "KES")} hint={tr("Paid inside the offer window")} />
          <Metric label={tr("Credit given")} value={formatMoney(report.creditMinor, "KES")} hint={tr("The cost of the offers that worked")} />
        </MetricGrid>
      )}

      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      {canManage && <WinBackSettings />}

      <Panel title={tr("Could get an offer")} description={tr("At risk now and no offer in the waiting period. The automatic job texts these in the daytime when offers are on.")} padded={false}>
        {!candidates?.length ? (
          <EmptyState title={tr("Nobody at risk right now")} />
        ) : (
          <TableShell minWidth={640}>
            <thead>
              <tr>
                <th className={th}>{tr("Customer")}</th>
                <th className={th}>{tr("Why")}</th>
                <th className={`${th} text-right`}>{tr("Owes")}</th>
                {canSend && <th className={th} />}
              </tr>
            </thead>
            <tbody>
              {candidates.slice(0, 50).map((c) => (
                <tr key={c.customerId}>
                  <td className={td}>
                    <Link href={`/customers/${c.customerId}`} className="text-white hover:underline">
                      {c.fullName}
                    </Link>
                    <span className="block text-xs text-slate-500">{c.customerNumber}</span>
                  </td>
                  <td className={td}>{tr(c.reason)}</td>
                  <td className={`${td} text-right tabular-nums`}>{c.owedMinor > 0 ? formatMoney(c.owedMinor, "KES") : "—"}</td>
                  {canSend && (
                    <td className={`${td} text-right`}>
                      <button type="button" className={darkButton("secondary", "sm")} disabled={send.isPending} onClick={() => confirm(`${tr("Text an offer to")} ${c.fullName}?`) && send.mutate(c)}>
                        {tr("Send offer")}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Panel>

      <Panel title={tr("Offers")} padded={false}>
        {!report?.offers.length ? (
          <EmptyState title={tr("No offers sent yet")} />
        ) : (
          <TableShell minWidth={760}>
            <thead>
              <tr>
                <th className={th}>{tr("Customer")}</th>
                <th className={th}>{tr("Sent")}</th>
                <th className={th}>{tr("Why")}</th>
                <th className={th}>{tr("Result")}</th>
                <th className={`${th} text-right`}>{tr("Paid")}</th>
                <th className={`${th} text-right`}>{tr("Credit")}</th>
              </tr>
            </thead>
            <tbody>
              {report.offers.map((o) => (
                <tr key={o.id}>
                  <td className={td}>
                    <Link href={`/customers/${o.customer.id}`} className="text-white hover:underline">
                      {o.customer.fullName}
                    </Link>
                    <span className="block text-xs text-slate-500">{o.customer.customerNumber}</span>
                  </td>
                  <td className={`${td} tabular-nums`}>
                    {new Date(o.sentAt).toLocaleDateString([], { day: "numeric", month: "short" })}
                    <span className="block text-xs text-slate-500">{o.sentByUserId ? tr("By staff") : tr("Automatic")}</span>
                  </td>
                  <td className={td}>{tr(o.reason)}</td>
                  <td className={td}>
                    <Pill tone={TONE[o.status]}>{tr(LABEL[o.status])}</Pill>
                    {o.status === "SENT" && <span className="block text-xs text-slate-500">{`${tr("until")} ${new Date(o.expiresAt).toLocaleDateString([], { day: "numeric", month: "short" })}`}</span>}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{o.paidMinor ? formatMoney(o.paidMinor, "KES") : "—"}</td>
                  <td className={`${td} text-right tabular-nums`}>{o.creditMinor ? formatMoney(o.creditMinor, "KES") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Panel>
    </div>
  );
}

function WinBackSettings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["preferences"], queryFn: () => apiFetch<Preferences>("/api/v1/settings/preferences") });
  const [form, setForm] = useState<Preferences["winBack"] | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (data && !form) setForm(data.winBack);
  }, [data, form]);
  const save = useMutation({
    mutationFn: () => apiFetch("/api/v1/settings/preferences", { method: "PUT", body: JSON.stringify({ ...data, winBack: form }) }),
    onSuccess: () => {
      setSaved(true);
      void qc.invalidateQueries({ queryKey: ["preferences"] });
    },
  });
  if (!form) return null;
  const input = "w-20 rounded-lg border border-obsidian-700 bg-obsidian-950 px-2 py-1 text-sm text-slate-100";
  return (
    <Panel title={tr("Offer")} description={tr("Each offer is one SMS, sent between 9am and 6pm.")}>
      <form
        className="space-y-4 text-sm text-slate-200"
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(false);
          save.mutate();
        }}
      >
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
          {tr("Send offers automatically")}
        </label>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <label className="flex items-center gap-2">
            {tr("Credit back, %")}
            <input type="number" min={1} max={100} className={input} value={form.discountPercent} onChange={(e) => setForm({ ...form, discountPercent: Number(e.target.value) })} />
          </label>
          <label className="flex items-center gap-2">
            {tr("Offer lasts, days")}
            <input type="number" min={1} max={30} className={input} value={form.validDays} onChange={(e) => setForm({ ...form, validDays: Number(e.target.value) })} />
          </label>
          <label className="flex items-center gap-2">
            {tr("Days before the same customer can get another")}
            <input type="number" min={7} max={365} className={input} value={form.minDaysBetween} onChange={(e) => setForm({ ...form, minDaysBetween: Number(e.target.value) })} />
          </label>
        </div>
        <p className="text-xs text-slate-400">
          {tr("Example: with 20%, a customer who owes KES 1,500 and pays it in time gets KES 300 credit on their next bill.")}
        </p>
        <div className="flex items-center gap-3">
          <button type="submit" className={darkButton("primary")} disabled={save.isPending}>
            {save.isPending ? tr("Saving…") : tr("Save")}
          </button>
          {saved && <span className="text-emerald-400">{tr("Saved")}</span>}
          {save.isError && <span className="text-rose-400">{save.error instanceof ApiRequestError ? save.error.message : tr("Something went wrong.")}</span>}
        </div>
      </form>
    </Panel>
  );
}
