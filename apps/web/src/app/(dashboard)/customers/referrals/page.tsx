"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { formatMoney } from "@/lib/money";
import { tr } from "@/lib/tr";
import { EmptyState, PageHeader, Panel, TableShell, darkButton, td, th } from "@/components/dashboard/surface";

/** Rewards given to customers who brought in a paying neighbour, and how rewards work. */

interface Reward {
  id: string;
  type: "DAYS" | "CREDIT";
  days: number | null;
  amountMinor: number | null;
  createdAt: string;
  referrer: { id: string; fullName: string };
  referred: { id: string; fullName: string };
}

interface Preferences {
  referrals: { enabled: boolean; rewardType: "DAYS" | "CREDIT"; rewardDays: number; rewardCreditMinor: number };
  [key: string]: unknown;
}

export default function ReferralsPage() {
  const { user } = useAuth();
  const canManage = user?.permissions.includes("settings.manage") ?? false;
  const { data, isLoading } = useQuery({ queryKey: ["referral-rewards"], queryFn: () => apiFetch<Reward[]>("/api/v1/referrals") });

  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHeader
        title={tr("Referrals")}
        description={tr("Every customer has a referral code. Enter it when you add a new customer; once the new customer pays for the first time, the one who referred them is rewarded.")}
      />
      <Panel title={tr("Rewards given")} padded={false}>
        {isLoading ? (
          <p className="px-5 py-8 text-sm text-slate-400">{tr("Loading…")}</p>
        ) : !data?.length ? (
          <EmptyState title={tr("No rewards yet")}>{tr("Rewards appear here when a referred customer makes their first payment.")}</EmptyState>
        ) : (
          <TableShell minWidth={640}>
            <thead>
              <tr>
                <th className={th}>{tr("Referred by")}</th>
                <th className={th}>{tr("New customer")}</th>
                <th className={th}>{tr("Reward")}</th>
                <th className={th}>{tr("Date")}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td className={td}>
                    <Link href={`/customers/${r.referrer.id}`} className="font-medium text-white hover:underline">
                      {r.referrer.fullName}
                    </Link>
                  </td>
                  <td className={td}>
                    <Link href={`/customers/${r.referred.id}`} className="hover:underline">
                      {r.referred.fullName}
                    </Link>
                  </td>
                  <td className={td}>{r.type === "DAYS" ? `${r.days} ${tr("free days")}` : formatMoney(r.amountMinor ?? 0)}</td>
                  <td className={`${td} text-slate-400`}>{new Date(r.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Panel>
      {canManage && <ReferralSettings />}
    </div>
  );
}

function ReferralSettings() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["preferences"], queryFn: () => apiFetch<Preferences>("/api/v1/settings/preferences") });
  const [form, setForm] = useState<Preferences["referrals"] | null>(null);
  const [credit, setCredit] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (data && !form) {
      setForm(data.referrals);
      setCredit(String(data.referrals.rewardCreditMinor / 100));
    }
  }, [data, form]);
  const save = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/settings/preferences", {
        method: "PUT",
        body: JSON.stringify({ ...data, referrals: { ...form, rewardCreditMinor: Math.round(Number(credit || 0) * 100) } }),
      }),
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["preferences"] });
    },
  });
  if (!form) return null;
  const input = "w-24 rounded-lg border border-obsidian-700 bg-obsidian-950 px-2 py-1 text-sm text-slate-100";
  return (
    <Panel title={tr("Reward")}>
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
          {tr("Reward customers who refer a neighbour")}
        </label>
        <label className="flex flex-wrap items-center gap-2">
          <input type="radio" name="rewardType" checked={form.rewardType === "DAYS"} onChange={() => setForm({ ...form, rewardType: "DAYS" })} />
          {tr("Free days on their plan:")}
          <input type="number" min={1} max={90} className={input} value={form.rewardDays} onChange={(e) => setForm({ ...form, rewardDays: Number(e.target.value) })} />
        </label>
        <label className="flex flex-wrap items-center gap-2">
          <input type="radio" name="rewardType" checked={form.rewardType === "CREDIT"} onChange={() => setForm({ ...form, rewardType: "CREDIT" })} />
          {tr("Account credit (KES):")}
          <input inputMode="numeric" className={input} value={credit} onChange={(e) => setCredit(e.target.value.replace(/[^\d.]/g, ""))} />
        </label>
        <p className="text-xs text-slate-400">{tr("A referrer with no active plan to extend gets the account credit instead.")}</p>
        <div className="flex items-center gap-3">
          <button type="submit" className={darkButton("primary")} disabled={save.isPending}>
            {save.isPending ? tr("Saving…") : tr("Save")}
          </button>
          {saved && <span className="text-emerald-400">{tr("Saved")}</span>}
        </div>
      </form>
    </Panel>
  );
}
