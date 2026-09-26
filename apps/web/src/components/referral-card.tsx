"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { formatMoney } from "@/lib/money";
import { tr } from "@/lib/tr";
import { Button, Card, ErrorText, Input } from "@/components/ui";

interface ReferralSummary {
  code: string;
  referredBy: { id: string; fullName: string } | null;
  referred: { id: string; fullName: string; joinedAt: string; rewarded: boolean }[];
  freeDaysEarned: number;
  creditEarnedMinor: number;
}

/** A customer's referral code, who referred them, and who they have brought in. */
export function ReferralCard({ customerId }: { customerId: string }) {
  const { user } = useAuth();
  const canEdit = user?.permissions.includes("customers.update") ?? false;
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["referral", customerId], queryFn: () => apiFetch<ReferralSummary>(`/api/v1/customers/${customerId}/referral`) });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const setReferrer = useMutation({
    mutationFn: () => apiFetch(`/api/v1/customers/${customerId}/referrer`, { method: "POST", body: JSON.stringify({ code }) }),
    onSuccess: () => {
      setCode("");
      queryClient.invalidateQueries({ queryKey: ["referral", customerId] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : tr("Something went wrong.")),
  });

  if (!data) return null;
  const earned = [data.freeDaysEarned ? `${data.freeDaysEarned} ${tr("free days")}` : null, data.creditEarnedMinor ? formatMoney(data.creditEarnedMinor) : null].filter(Boolean).join(" + ");

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-white">{tr("Refer a neighbour")}</h2>
          <p className="text-xs text-slate-500">{tr("They get a reward when someone they referred makes a first payment.")}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">{tr("Referral code")}</p>
          <p className="font-mono text-xl font-bold tracking-widest text-slate-900 dark:text-white">{data.code}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="text-sm">
          <p className="text-xs text-slate-500">{tr("Referred by")}</p>
          {data.referredBy ? (
            <Link href={`/customers/${data.referredBy.id}`} className="font-medium text-slate-900 hover:underline dark:text-white">
              {data.referredBy.fullName}
            </Link>
          ) : canEdit ? (
            <form
              className="mt-1 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                setReferrer.mutate();
              }}
            >
              <Input aria-label={tr("Referral code")} placeholder={tr("Their code")} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} />
              <Button type="submit" variant="outline" disabled={code.trim().length < 3 || setReferrer.isPending}>
                {tr("Add")}
              </Button>
            </form>
          ) : (
            <p className="text-slate-500">—</p>
          )}
          {error && <ErrorText>{error}</ErrorText>}
        </div>
        <div className="text-sm">
          <p className="text-xs text-slate-500">
            {tr("Has referred")} {data.referred.length} · {tr("earned")} {earned || "—"}
          </p>
          <ul className="mt-1 space-y-1">
            {data.referred.slice(0, 6).map((r) => (
              <li key={r.id} className="flex justify-between gap-2">
                <Link href={`/customers/${r.id}`} className="truncate text-slate-900 hover:underline dark:text-white">
                  {r.fullName}
                </Link>
                <span className={r.rewarded ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500"}>{r.rewarded ? tr("Rewarded") : tr("Waiting for first payment")}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
