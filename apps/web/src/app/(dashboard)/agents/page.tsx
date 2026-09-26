"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";
import { tr } from "@/lib/tr";
import { useAuth } from "@/lib/auth-context";
import { EmptyState, Metric, MetricGrid, Notice, PageHeader, Panel, Pill, TableShell, darkButton, td, th } from "@/components/dashboard/surface";
import { Input, Label } from "@/components/ui";

/**
 * Agents: shops that sell the ISP's WiFi vouchers and take customers' bill payments in cash, for
 * a commission. Each has their own app at /agent. This page lists them with this month's
 * takings and what each owes, and adds new ones.
 */

interface AgentRow {
  id: string;
  name: string;
  phone: string;
  location: string | null;
  status: "ACTIVE" | "SUSPENDED";
  email: string | null;
  signedUp: boolean;
  voucherCommissionPercent: number;
  collectionCommissionPercent: number;
  stock: number;
  monthSales: number;
  monthTakenMinor: number;
  monthCommissionMinor: number;
  balanceMinor: number;
}

const KES = (m: number) => formatMoney(m, "KES");

export default function AgentsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canManage = user?.permissions.includes("staff.manage") ?? false;
  const { data: agents } = useQuery({ queryKey: ["agents"], queryFn: () => apiFetch<AgentRow[]>("/api/v1/agents") });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", location: "", voucher: "10", collection: "2" });
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; text: string; link?: string } | null>(null);

  const create = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string; inviteUrl: string; smsSent: boolean }>("/api/v1/agents", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim(),
          location: form.location.trim() || null,
          voucherCommissionPercent: Number(form.voucher),
          collectionCommissionPercent: Number(form.collection),
        }),
      }),
    onSuccess: (r) => {
      setNotice({ tone: "good", text: r.smsSent ? tr("Agent added. Their invite was sent by SMS.") : tr("Agent added. Send them this invite link to set up their login:"), link: r.smsSent ? undefined : r.inviteUrl });
      setAdding(false);
      setForm({ name: "", phone: "", location: "", voucher: "10", collection: "2" });
      void qc.invalidateQueries({ queryKey: ["agents"] });
    },
    onError: (err) => setNotice({ tone: "bad", text: err instanceof ApiRequestError ? err.message : tr("Something went wrong.") }),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  const totals = (agents ?? []).reduce((s, a) => ({ taken: s.taken + a.monthTakenMinor, commission: s.commission + a.monthCommissionMinor, owed: s.owed + Math.max(0, a.balanceMinor), stock: s.stock + a.stock }), { taken: 0, commission: 0, owed: 0, stock: 0 });

  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHeader
        title={tr("Agents")}
        description={tr("Shops that sell your WiFi vouchers and take customers' bill payments in cash, for a commission. Each agent has their own app at /agent.")}
        actions={
          canManage &&
          !adding && (
            <button type="button" className={darkButton("primary")} onClick={() => setAdding(true)}>
              {tr("Add agent")}
            </button>
          )
        }
      />

      {notice && (
        <Notice tone={notice.tone}>
          {notice.text} {notice.link && <span className="break-all font-mono text-xs">{notice.link}</span>}
        </Notice>
      )}

      {agents && agents.length > 0 && (
        <MetricGrid columns={4}>
          <Metric label={tr("Taken this month")} value={KES(totals.taken)} />
          <Metric label={tr("Commission this month")} value={KES(totals.commission)} />
          <Metric label={tr("Agents owe you")} value={KES(totals.owed)} tone={totals.owed > 0 ? "warn" : "good"} />
          <Metric label={tr("Vouchers with agents")} value={String(totals.stock)} />
        </MetricGrid>
      )}

      {adding && (
        <Panel title={tr("New agent")}>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <Label htmlFor="ag-name">{tr("Shop or agent name")}</Label>
              <Input id="ag-name" required maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="ag-phone">{tr("Phone")}</Label>
              <Input id="ag-phone" required inputMode="tel" placeholder="07XX XXX XXX" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="lg:col-span-2">
              <Label htmlFor="ag-loc">{tr("Location")}</Label>
              <Input id="ag-loc" maxLength={120} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="ag-v">{tr("Voucher commission, %")}</Label>
              <Input id="ag-v" type="number" min={0} max={50} required value={form.voucher} onChange={(e) => setForm({ ...form, voucher: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="ag-c">{tr("Bill payment commission, %")}</Label>
              <Input id="ag-c" type="number" min={0} max={20} required value={form.collection} onChange={(e) => setForm({ ...form, collection: e.target.value })} />
            </div>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
              <button type="submit" className={darkButton("primary")} disabled={create.isPending}>
                {create.isPending ? tr("Adding…") : tr("Add and invite")}
              </button>
              <button type="button" className={darkButton("ghost")} onClick={() => setAdding(false)}>
                {tr("Cancel")}
              </button>
            </div>
          </form>
        </Panel>
      )}

      <Panel title={tr("All agents")} padded={false}>
        {!agents?.length ? (
          <EmptyState title={tr("No agents yet")}>{tr("Add a shop to start selling vouchers through it.")}</EmptyState>
        ) : (
          <TableShell minWidth={860}>
            <thead>
              <tr>
                <th className={th}>{tr("Agent")}</th>
                <th className={th}>{tr("Status")}</th>
                <th className={`${th} text-right`}>{tr("Vouchers in stock")}</th>
                <th className={`${th} text-right`}>{tr("Taken this month")}</th>
                <th className={`${th} text-right`}>{tr("Commission")}</th>
                <th className={`${th} text-right`}>{tr("Owes you")}</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id}>
                  <td className={td}>
                    <Link href={`/agents/${a.id}`} className="font-medium text-white hover:underline">
                      {a.name}
                    </Link>
                    <span className="block text-xs text-slate-500">{[a.location, a.phone].filter(Boolean).join(" · ")}</span>
                  </td>
                  <td className={td}>
                    {a.status === "SUSPENDED" ? <Pill tone="bad">{tr("Suspended")}</Pill> : a.signedUp ? <Pill tone="good">{tr("Active")}</Pill> : <Pill tone="warn">{tr("Invited")}</Pill>}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{a.stock}</td>
                  <td className={`${td} text-right tabular-nums`}>
                    {KES(a.monthTakenMinor)}
                    <span className="block text-xs text-slate-500">
                      {a.monthSales} {tr("sales")}
                    </span>
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{KES(a.monthCommissionMinor)}</td>
                  <td className={`${td} text-right tabular-nums`}>{a.balanceMinor > 0 ? <Pill tone="warn">{KES(a.balanceMinor)}</Pill> : KES(a.balanceMinor)}</td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Panel>
    </div>
  );
}
