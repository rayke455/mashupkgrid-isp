"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { formatMoney } from "@/lib/money";
import { tr } from "@/lib/tr";
import { EmptyState, Notice, PageHeader, Panel, Segmented, TableShell, darkButton, td, th } from "@/components/dashboard/surface";

/**
 * Subscribers who keep running into their data cap, with the next plan up. Apply moves them onto
 * it straight away (the router is re-provisioned); Dismiss keeps them where they are.
 */

interface Suggestion {
  id: string;
  fromPackageName: string;
  toPackageName: string;
  toPriceMinor: number;
  currency: string;
  usedMb: number;
  capMb: number;
  status: "PENDING" | "APPLIED" | "DISMISSED";
  smsSentAt: string | null;
  createdAt: string;
  decidedAt: string | null;
  customer: { id: string; fullName: string; phone: string; customerNumber: string };
}

interface Preferences {
  upgrades: { enabled: boolean; smsCustomer: boolean; thresholdPercent: number };
  [key: string]: unknown;
}

const gb = (mb: number) => `${(mb / 1024).toFixed(mb >= 10 * 1024 ? 0 : 1)} GB`;

export default function UpgradesPage() {
  const { user } = useAuth();
  const canApply = user?.permissions.includes("customers.update") ?? false;
  const canManage = user?.permissions.includes("settings.manage") ?? false;
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"PENDING" | "APPLIED" | "DISMISSED">("PENDING");
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["upgrades", status],
    queryFn: () => apiFetch<Suggestion[]>(`/api/v1/upgrades?status=${status}`),
  });

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "apply" | "dismiss" }) =>
      apiFetch<Suggestion>(`/api/v1/upgrades/${id}/${action}`, { method: "POST", body: "{}" }),
    onSuccess: (s, v) => {
      const who = data?.find((row) => row.id === v.id)?.customer.fullName ?? tr("Customer");
      setNotice({ tone: "good", text: v.action === "apply" ? `${who}: ${tr("moved to")} ${s.toPackageName}.` : tr("Dismissed.") });
      queryClient.invalidateQueries({ queryKey: ["upgrades"] });
    },
    onError: (err) => setNotice({ tone: "bad", text: err instanceof ApiRequestError ? err.message : tr("Something went wrong.") }),
  });

  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHeader
        title={tr("Plan upgrades")}
        description={tr("Subscribers who used most of their data cap in the last 30 days, and the next plan up. Apply moves them onto it now.")}
        actions={
          <Segmented
            label={tr("Status")}
            value={status}
            onChange={setStatus}
            options={[
              { value: "PENDING", label: tr("To review") },
              { value: "APPLIED", label: tr("Applied") },
              { value: "DISMISSED", label: tr("Dismissed") },
            ]}
          />
        }
      />

      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      <Panel title={tr("Suggestions")} padded={false}>
        {isLoading ? (
          <p className="px-5 py-8 text-sm text-slate-400">{tr("Loading…")}</p>
        ) : !data?.length ? (
          <EmptyState title={status === "PENDING" ? tr("Nobody needs a bigger plan right now") : tr("None yet")}>
            {tr("The system checks every 6 hours for subscribers near their data cap.")}
          </EmptyState>
        ) : (
          <TableShell minWidth={820}>
            <thead>
              <tr>
                <th className={th}>{tr("Customer")}</th>
                <th className={th}>{tr("Used in 30 days")}</th>
                <th className={th}>{tr("Now")}</th>
                <th className={th}>{tr("Suggested")}</th>
                <th className={th}>{tr("Texted")}</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {data.map((s) => {
                const pct = Math.round((s.usedMb / s.capMb) * 100);
                return (
                  <tr key={s.id}>
                    <td className={td}>
                      <Link href={`/customers/${s.customer.id}`} className="font-medium text-white hover:underline">
                        {s.customer.fullName}
                      </Link>
                      <span className="block text-xs text-slate-500">{s.customer.phone}</span>
                    </td>
                    <td className={`${td} tabular-nums`}>
                      {gb(s.usedMb)} / {gb(s.capMb)} <span className={pct >= 100 ? "text-rose-300" : "text-amber-300"}>({pct}%)</span>
                    </td>
                    <td className={td}>{s.fromPackageName}</td>
                    <td className={td}>
                      <span className="text-white">{s.toPackageName}</span>
                      <span className="block text-xs text-slate-500">{formatMoney(s.toPriceMinor, s.currency)}</span>
                    </td>
                    <td className={`${td} text-slate-400`}>{s.smsSentAt ? new Date(s.smsSentAt).toLocaleDateString() : "—"}</td>
                    <td className={`${td} text-right`}>
                      {s.status === "PENDING" && canApply ? (
                        <div className="flex justify-end gap-2">
                          <button type="button" className={darkButton("primary", "sm")} disabled={act.isPending} onClick={() => act.mutate({ id: s.id, action: "apply" })}>
                            {tr("Apply")}
                          </button>
                          <button type="button" className={darkButton("ghost", "sm")} disabled={act.isPending} onClick={() => act.mutate({ id: s.id, action: "dismiss" })}>
                            {tr("Dismiss")}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">{s.decidedAt ? new Date(s.decidedAt).toLocaleDateString() : ""}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}
      </Panel>

      {canManage && <UpgradeSettings />}
    </div>
  );
}

function UpgradeSettings() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["preferences"], queryFn: () => apiFetch<Preferences>("/api/v1/settings/preferences") });
  const [form, setForm] = useState<Preferences["upgrades"] | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (data && !form) setForm(data.upgrades);
  }, [data, form]);
  const save = useMutation({
    mutationFn: () => apiFetch("/api/v1/settings/preferences", { method: "PUT", body: JSON.stringify({ ...data, upgrades: form }) }),
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["preferences"] });
    },
  });
  if (!form) return null;
  return (
    <Panel title={tr("Settings")}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(false);
          save.mutate();
        }}
      >
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
          {tr("Look for subscribers who need a bigger plan")}
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.smsCustomer} onChange={(e) => setForm({ ...form, smsCustomer: e.target.checked })} />
          {tr("Text the customer about the bigger plan")}
        </label>
        <label className="flex flex-wrap items-center gap-2 text-sm text-slate-200">
          {tr("Suggest when they have used")}
          <input
            type="number"
            min={50}
            max={100}
            value={form.thresholdPercent}
            onChange={(e) => setForm({ ...form, thresholdPercent: Number(e.target.value) })}
            className="w-20 rounded-lg border border-obsidian-700 bg-obsidian-950 px-2 py-1 text-sm text-slate-100"
          />
          {tr("% of their data cap in 30 days")}
        </label>
        <div className="flex items-center gap-3">
          <button type="submit" className={darkButton("primary")} disabled={save.isPending}>
            {save.isPending ? tr("Saving…") : tr("Save")}
          </button>
          {saved && <span className="text-sm text-emerald-400">{tr("Saved")}</span>}
        </div>
      </form>
    </Panel>
  );
}
