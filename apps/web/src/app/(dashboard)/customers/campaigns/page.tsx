"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";
import { tr } from "@/lib/tr";
import { useAuth } from "@/lib/auth-context";
import { useBranches } from "@/lib/use-branches";
import { EmptyState, Notice, PageHeader, Panel, Pill, Segmented, TableShell, darkButton, td, th } from "@/components/dashboard/surface";
import { Input, Label } from "@/components/ui";

/**
 * Campaigns: one message by SMS, WhatsApp or both to a group of customers (active, suspended,
 * overdue, gone quiet, or everyone, narrowed by branch or plan), now or at a set time. Each
 * customer's copy has their name and balance filled in, and payments in the days after are
 * counted so the ISP can see which messages brought money in.
 */

type Segment = "ACTIVE" | "SUSPENDED" | "OVERDUE" | "INACTIVE" | "ALL";
type Channel = "SMS" | "WHATSAPP" | "BOTH";

interface CampaignRow {
  id: string;
  name: string;
  channel: Channel;
  status: "SCHEDULED" | "SENDING" | "SENT" | "CANCELLED";
  scheduledAt: string;
  trackDays: number;
  message: string;
  recipients: number;
  sent: number;
  failed: number;
  paid: number;
  paidMinor: number;
  conversionPercent: number | null;
}

interface Preview {
  count: number;
  samples: { name: string; text: string }[];
  smsPartsPerMessage: number;
}

interface Recipient {
  id: string;
  status: "PENDING" | "SENT" | "FAILED";
  error: string | null;
  sentAt: string | null;
  paidMinor: number | null;
  customer: { id: string; fullName: string; customerNumber: string };
}

const SEGMENTS: { value: Segment; label: string }[] = [
  { value: "ACTIVE", label: "Active customers" },
  { value: "SUSPENDED", label: "Suspended for non-payment" },
  { value: "OVERDUE", label: "With an overdue bill" },
  { value: "INACTIVE", label: "Haven't paid recently" },
  { value: "ALL", label: "Everyone" },
];

const STATUS = { SCHEDULED: ["warn", "Scheduled"], SENDING: ["warn", "Sending"], SENT: ["good", "Sent"], CANCELLED: ["neutral", "Stopped"] } as const;
const PLACEHOLDERS = ["{firstName}", "{accountNumber}", "{amountDue}"];
const KES = (m: number) => formatMoney(m, "KES");

export default function CampaignsPage() {
  const { user } = useAuth();
  const canSend = user?.permissions.includes("customers.update") ?? false;
  const { data: campaigns } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => apiFetch<CampaignRow[]>("/api/v1/campaigns"),
    refetchInterval: (q) => (q.state.data?.some((c) => c.status === "SENDING" || c.status === "SCHEDULED") ? 10_000 : 60_000),
  });
  const [open, setOpen] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const totals = (campaigns ?? []).reduce((s, c) => ({ sent: s.sent + c.sent, paid: s.paid + c.paid, paidMinor: s.paidMinor + c.paidMinor }), { sent: 0, paid: 0, paidMinor: 0 });

  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHeader
        title={tr("Campaigns")}
        description={tr("Send one SMS or WhatsApp message to a group of customers, and see who paid in the days after.")}
        actions={
          canSend &&
          !composing && (
            <button type="button" className={darkButton("primary")} onClick={() => setComposing(true)}>
              {tr("New campaign")}
            </button>
          )
        }
      />
      {campaigns && campaigns.length > 0 && (
        <p className="text-sm text-slate-400">
          {totals.sent} {tr("messages sent")} · {totals.paid} {tr("customers paid afterwards")} · {KES(totals.paidMinor)} {tr("brought in")}
        </p>
      )}

      {composing && <Composer onDone={() => setComposing(false)} />}

      <Panel title={tr("All campaigns")} padded={false}>
        {!campaigns?.length ? (
          <EmptyState title={tr("No campaigns yet")}>{tr("Remind suspended customers, announce a new plan, or win back quiet ones.")}</EmptyState>
        ) : (
          <TableShell minWidth={860}>
            <thead>
              <tr>
                <th className={th}>{tr("Campaign")}</th>
                <th className={th}>{tr("Status")}</th>
                <th className={`${th} text-right`}>{tr("Sent")}</th>
                <th className={`${th} text-right`}>{tr("Paid afterwards")}</th>
                <th className={`${th} text-right`}>{tr("Brought in")}</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <CampaignRowView key={c.id} c={c} open={open === c.id} onToggle={() => setOpen(open === c.id ? null : c.id)} canSend={canSend} />
              ))}
            </tbody>
          </TableShell>
        )}
      </Panel>
    </div>
  );
}

function CampaignRowView({ c, open, onToggle, canSend }: { c: CampaignRow; open: boolean; onToggle: () => void; canSend: boolean }) {
  const qc = useQueryClient();
  const [tone, label] = STATUS[c.status];
  const cancel = useMutation({
    mutationFn: () => apiFetch(`/api/v1/campaigns/${c.id}/cancel`, { method: "POST", body: "{}" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });
  const { data: recipients } = useQuery({ queryKey: ["campaign-recipients", c.id], queryFn: () => apiFetch<Recipient[]>(`/api/v1/campaigns/${c.id}/recipients`), enabled: open });
  const channel = c.channel === "BOTH" ? "SMS + WhatsApp" : c.channel === "SMS" ? "SMS" : "WhatsApp";
  return (
    <>
      <tr>
        <td className={td}>
          <button type="button" onClick={onToggle} className="text-left font-medium text-white hover:underline" aria-expanded={open}>
            {c.name}
          </button>
          <span className="block text-xs text-slate-500">
            {channel} · {new Date(c.scheduledAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
        </td>
        <td className={td}>
          <Pill tone={tone}>{tr(label)}</Pill>
        </td>
        <td className={`${td} text-right tabular-nums`}>
          {c.sent}
          {c.recipients > 0 && <span className="text-slate-500"> / {c.recipients}</span>}
          {c.failed > 0 && <span className="block text-xs text-rose-400">{c.failed} {tr("failed")}</span>}
        </td>
        <td className={`${td} text-right tabular-nums`}>
          {c.paid}
          {c.conversionPercent !== null && <span className="block text-xs text-slate-500">{c.conversionPercent}%</span>}
        </td>
        <td className={`${td} text-right tabular-nums`}>{KES(c.paidMinor)}</td>
        <td className={`${td} text-right`}>
          {canSend && (c.status === "SCHEDULED" || c.status === "SENDING") && (
            <button type="button" className={darkButton("ghost", "sm")} disabled={cancel.isPending} onClick={() => confirm(tr("Stop this campaign? Messages already sent stay sent.")) && cancel.mutate()}>
              {tr("Stop")}
            </button>
          )}
        </td>
      </tr>
      {open && (
        <tr>
          <td className={td} colSpan={6}>
            <p className="mb-3 whitespace-pre-wrap rounded-lg bg-obsidian-900 p-3 text-sm text-slate-200">{c.message}</p>
            {!recipients?.length ? (
              <p className="text-sm text-slate-400">{c.status === "SCHEDULED" ? tr("The list of customers is made when sending starts.") : tr("Nobody matched.")}</p>
            ) : (
              <ul className="max-h-80 divide-y divide-obsidian-800 overflow-y-auto text-sm">
                {recipients.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <Link href={`/customers/${r.customer.id}`} className="text-slate-200 hover:underline">
                        {r.customer.fullName}
                      </Link>
                      <span className="ml-2 text-xs text-slate-500">{r.customer.customerNumber}</span>
                      {r.status === "FAILED" && r.error && <span className="block text-xs text-rose-400">{r.error}</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {r.paidMinor ? <Pill tone="good">{`${tr("Paid")} ${KES(r.paidMinor)}`}</Pill> : null}
                      <Pill tone={r.status === "SENT" ? "neutral" : r.status === "FAILED" ? "bad" : "warn"}>{tr(r.status === "SENT" ? "Sent" : r.status === "FAILED" ? "Failed" : "Waiting")}</Pill>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function Composer({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const { branches } = useBranches();
  const { data: packages } = useQuery({ queryKey: ["packages-active"], queryFn: () => apiFetch<{ items: { id: string; name: string }[] }>("/api/v1/packages?activeOnly=true&limit=100") });
  const [name, setName] = useState("");
  const [segment, setSegment] = useState<Segment>("SUSPENDED");
  const [branchId, setBranchId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [inactiveDays, setInactiveDays] = useState(30);
  const [channel, setChannel] = useState<Channel>("SMS");
  const [message, setMessage] = useState("Hi {firstName}, your internet is off because of an unpaid bill of {amountDue}. Pay by M-Pesa to account {accountNumber} and we'll reconnect you right away.");
  const [when, setWhen] = useState("");
  const [trackDays, setTrackDays] = useState(7);
  const [error, setError] = useState<string | null>(null);

  const audience = { segment, branchId: branchId || null, packageId: packageId || null, inactiveDays };
  const [preview, setPreview] = useState<Preview | null>(null);
  const audienceKey = JSON.stringify(audience);
  useEffect(() => {
    const t = setTimeout(() => {
      apiFetch<Preview>("/api/v1/campaigns/preview", { method: "POST", body: JSON.stringify({ audience: JSON.parse(audienceKey), message }) })
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 400);
    return () => clearTimeout(t);
  }, [audienceKey, message]);

  const create = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/campaigns", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), message: message.trim(), channel, audience, trackDays, scheduledAt: when ? new Date(when).toISOString() : undefined }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
      onDone();
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : tr("Something went wrong.")),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const count = preview?.count ?? 0;
    if (!confirm(`${when ? tr("Schedule this message for") : tr("Send this message now to")} ${count} ${tr("customers")}?`)) return;
    create.mutate();
  }

  const select = "w-full rounded-lg border border-obsidian-700 bg-obsidian-950 px-2 py-2 text-sm text-slate-100";

  return (
    <Panel title={tr("New campaign")}>
      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <Label htmlFor="cp-name">{tr("Name (only you see this)")}</Label>
            <Input id="cp-name" required maxLength={100} placeholder={tr("October reconnect reminder")} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cp-seg">{tr("Send to")}</Label>
            <select id="cp-seg" className={select} value={segment} onChange={(e) => setSegment(e.target.value as Segment)}>
              {SEGMENTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {tr(s.label)}
                </option>
              ))}
            </select>
          </div>
          {segment === "INACTIVE" && (
            <div>
              <Label htmlFor="cp-days">{tr("No payment in this many days")}</Label>
              <Input id="cp-days" type="number" min={7} max={365} value={inactiveDays} onChange={(e) => setInactiveDays(Number(e.target.value) || 30)} />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="cp-branch">{tr("Branch")}</Label>
              <select id="cp-branch" className={select} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">{tr("All branches")}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="cp-pkg">{tr("Plan")}</Label>
              <select id="cp-pkg" className={select} value={packageId} onChange={(e) => setPackageId(e.target.value)}>
                <option value="">{tr("All plans")}</option>
                {(packages?.items ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Segmented
            label={tr("Send by")}
            value={channel}
            onChange={setChannel}
            options={[
              { value: "SMS", label: "SMS" },
              { value: "WHATSAPP", label: "WhatsApp" },
              { value: "BOTH", label: tr("Both") },
            ]}
          />
          <div>
            <Label htmlFor="cp-msg">{tr("Message")}</Label>
            <textarea id="cp-msg" required maxLength={1000} rows={5} className={`${select} leading-6`} value={message} onChange={(e) => setMessage(e.target.value)} />
            <p className="mt-1 flex flex-wrap gap-1 text-xs text-slate-400">
              {tr("Add:")}
              {PLACEHOLDERS.map((p) => (
                <button key={p} type="button" className="rounded bg-obsidian-800 px-1.5 font-mono text-slate-200" onClick={() => setMessage((m) => `${m}${m.endsWith(" ") ? "" : " "}${p}`)}>
                  {p}
                </button>
              ))}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="cp-when">{tr("When (leave empty to send now)")}</Label>
              <input id="cp-when" type="datetime-local" className={select} value={when} onChange={(e) => setWhen(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="cp-track">{tr("Count payments for, days")}</Label>
              <Input id="cp-track" type="number" min={1} max={30} value={trackDays} onChange={(e) => setTrackDays(Number(e.target.value) || 7)} />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-white">{tr("Preview")}</p>
          {preview ? (
            <>
              <p className="text-sm text-slate-300">
                <strong className="text-white">{preview.count}</strong> {tr("customers match right now.")}
                {channel !== "WHATSAPP" && ` ${tr("Up to")} ${preview.smsPartsPerMessage} ${tr("SMS each")} (${preview.count * preview.smsPartsPerMessage} ${tr("in total")}).`}
              </p>
              {preview.samples.map((s) => (
                <div key={s.name} className="rounded-lg bg-obsidian-900 p-3 text-sm">
                  <p className="mb-1 text-xs text-slate-500">{s.name}</p>
                  <p className="whitespace-pre-wrap text-slate-200">{s.text}</p>
                </div>
              ))}
            </>
          ) : (
            <p className="text-sm text-slate-400">…</p>
          )}
          {error && <Notice tone="bad">{error}</Notice>}
          <div className="flex gap-2 pt-2">
            <button type="submit" className={darkButton("primary")} disabled={create.isPending || !name.trim() || !message.trim() || !preview?.count}>
              {create.isPending ? tr("Saving…") : when ? tr("Schedule") : tr("Send now")}
            </button>
            <button type="button" className={darkButton("ghost")} onClick={onDone}>
              {tr("Cancel")}
            </button>
          </div>
        </div>
      </form>
    </Panel>
  );
}
