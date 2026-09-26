"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";
import { tr } from "@/lib/tr";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { AGENT_STRINGS, StatementView, type AgentStatementData } from "@/components/agent-app";
import { Notice, PageHeader, Panel, darkButton } from "@/components/dashboard/surface";
import { Input, Label } from "@/components/ui";

/**
 * One agent: their monthly statement (what they took, their commission, what they handed over
 * and what they owe), their voucher stock, and the staff actions: give vouchers, record money
 * handed over, suspend, and resend the invite.
 */

interface Detail extends AgentStatementData {
  agent: { id: string; name: string; phone: string; location: string | null; voucherCommissionPercent: number; collectionCommissionPercent: number };
  stock: { package: { id: string; name: string; priceMinor: number }; count: number }[];
}

interface Row {
  id: string;
  status: "ACTIVE" | "SUSPENDED";
  signedUp: boolean;
  email: string | null;
  balanceMinor: number;
}

const KES = (m: number) => formatMoney(m, "KES");

export default function AgentDetailPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { lang } = useLanguage();
  const has = (p: string) => user?.permissions.includes(p) ?? false;
  const now = new Date();
  const [ym, setYm] = useState(`${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`);
  const [year, month] = ym.split("-").map(Number) as [number, number];
  const { data } = useQuery({ queryKey: ["agent", agentId, ym], queryFn: () => apiFetch<Detail>(`/api/v1/agents/${agentId}/statement?year=${year}&month=${month}`) });
  const { data: all } = useQuery({ queryKey: ["agents"], queryFn: () => apiFetch<Row[]>("/api/v1/agents") });
  const { data: packages } = useQuery({ queryKey: ["hotspot-packages"], queryFn: () => apiFetch<{ id: string; name: string; priceMinor: number; isActive: boolean }[]>("/api/v1/vouchers/packages"), enabled: has("radius.manage") });
  const row = all?.find((a) => a.id === agentId);

  const [pkg, setPkg] = useState("");
  const [count, setCount] = useState("20");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"CASH" | "MPESA" | "BANK">("MPESA");
  const [reference, setReference] = useState("");
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["agent", agentId] });
    void qc.invalidateQueries({ queryKey: ["agents"] });
  };
  const onError = (err: unknown) => setNotice({ tone: "bad", text: err instanceof ApiRequestError ? err.message : tr("Something went wrong.") });

  const give = useMutation({
    mutationFn: () => apiFetch<{ issued: number }>(`/api/v1/agents/${agentId}/vouchers`, { method: "POST", body: JSON.stringify({ hotspotPackageId: pkg, count: Number(count) }) }),
    onSuccess: (r) => {
      setNotice({ tone: "good", text: `${r.issued} ${tr("vouchers added to their stock.")}` });
      refresh();
    },
    onError,
  });
  const remit = useMutation({
    mutationFn: () =>
      apiFetch<{ balanceMinor: number }>(`/api/v1/agents/${agentId}/remittances`, {
        method: "POST",
        body: JSON.stringify({ amountMinor: Math.round(Number(amount) * 100), method, reference: reference.trim() || undefined }),
      }),
    onSuccess: (r) => {
      setNotice({ tone: "good", text: `${tr("Recorded. They now owe")} ${KES(r.balanceMinor)}.` });
      setAmount("");
      setReference("");
      refresh();
    },
    onError,
  });
  const setStatus = useMutation({
    mutationFn: (status: "ACTIVE" | "SUSPENDED") => apiFetch(`/api/v1/agents/${agentId}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: refresh,
    onError,
  });
  const reinvite = useMutation({
    mutationFn: () => apiFetch<{ inviteUrl: string; smsSent: boolean }>(`/api/v1/agents/${agentId}/invite`, { method: "POST", body: "{}" }),
    onSuccess: (r) => setNotice({ tone: "good", text: r.smsSent ? tr("New invite sent by SMS.") : `${tr("New invite link:")} ${r.inviteUrl}` }),
    onError,
  });

  function submitGive(e: FormEvent) {
    e.preventDefault();
    give.mutate();
  }
  function submitRemit(e: FormEvent) {
    e.preventDefault();
    remit.mutate();
  }

  if (!data) return null;
  const a = data.agent;

  return (
    <div className="w-full min-w-0 space-y-6">
      <Link href="/agents" className="text-sm text-slate-400 hover:underline">
        ← {tr("Agents")}
      </Link>
      <PageHeader
        title={a.name}
        description={`${[a.location, a.phone, row?.email].filter(Boolean).join(" · ")} · ${tr("Vouchers")} ${a.voucherCommissionPercent}% · ${tr("Bill payments")} ${a.collectionCommissionPercent}%`}
        actions={
          has("staff.manage") &&
          row && (
            <div className="flex gap-2">
              {!row.signedUp && (
                <button type="button" className={darkButton("secondary")} disabled={reinvite.isPending} onClick={() => reinvite.mutate()}>
                  {tr("Resend invite")}
                </button>
              )}
              <button
                type="button"
                className={darkButton(row.status === "ACTIVE" ? "ghost" : "secondary")}
                disabled={setStatus.isPending}
                onClick={() => (row.status === "ACTIVE" ? confirm(tr("Suspend this agent? They can't sell or take payments until you turn them back on.")) && setStatus.mutate("SUSPENDED") : setStatus.mutate("ACTIVE"))}
              >
                {row.status === "ACTIVE" ? tr("Suspend") : tr("Turn back on")}
              </button>
            </div>
          )
        }
      />
      {row?.status === "SUSPENDED" && <Notice tone="bad">{tr("Suspended: this agent can't sell or take payments.")}</Notice>}
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={tr("Voucher stock")}>
          <div className="space-y-4">
            {data.stock.length === 0 ? (
              <p className="text-sm text-slate-400">{tr("No vouchers in stock.")}</p>
            ) : (
              <ul className="divide-y divide-obsidian-800 text-sm">
                {data.stock.map((s) => (
                  <li key={s.package.id} className="flex justify-between py-2">
                    <span className="text-slate-200">{s.package.name}</span>
                    <span className="tabular-nums text-white">{s.count}</span>
                  </li>
                ))}
              </ul>
            )}
            {has("radius.manage") && (
              <form onSubmit={submitGive} className="flex flex-wrap items-end gap-2">
                <div className="min-w-40 flex-1">
                  <Label htmlFor="g-pkg">{tr("Package")}</Label>
                  <select id="g-pkg" required value={pkg} onChange={(e) => setPkg(e.target.value)} className="w-full rounded-lg border border-obsidian-700 bg-obsidian-950 px-2 py-2 text-sm text-slate-100">
                    <option value="">{tr("Choose…")}</option>
                    {(packages ?? [])
                      .filter((p) => p.isActive)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {KES(p.priceMinor)}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="w-24">
                  <Label htmlFor="g-count">{tr("How many")}</Label>
                  <Input id="g-count" type="number" min={1} max={500} required value={count} onChange={(e) => setCount(e.target.value)} />
                </div>
                <button type="submit" className={darkButton("primary")} disabled={give.isPending || !pkg}>
                  {give.isPending ? tr("Adding…") : tr("Give vouchers")}
                </button>
              </form>
            )}
          </div>
        </Panel>

        <Panel title={tr("Money handed over")} description={row ? `${tr("They owe")} ${KES(row.balanceMinor)}` : undefined}>
          {has("payments.create") ? (
            <form onSubmit={submitRemit} className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="r-amt">{tr("Amount")}</Label>
                <Input id="r-amt" type="number" min={1} step="any" required value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="r-method">{tr("How")}</Label>
                <select id="r-method" value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className="w-full rounded-lg border border-obsidian-700 bg-obsidian-950 px-2 py-2 text-sm text-slate-100">
                  <option value="MPESA">M-Pesa</option>
                  <option value="CASH">{tr("Cash")}</option>
                  <option value="BANK">{tr("Bank")}</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="r-ref">{tr("Reference (optional)")}</Label>
                <Input id="r-ref" maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} />
              </div>
              <div>
                <button type="submit" className={darkButton("primary")} disabled={remit.isPending || !(Number(amount) > 0)}>
                  {remit.isPending ? tr("Saving…") : tr("Record hand-over")}
                </button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-slate-400">{tr("You can't record payments.")}</p>
          )}
        </Panel>
      </div>

      <Panel title={tr("Statement")}>
        <StatementView s={data} t={AGENT_STRINGS[lang]} ym={ym} setYm={setYm} />
      </Panel>
    </div>
  );
}
