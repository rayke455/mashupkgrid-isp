"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { useLanguage } from "@/lib/language-context";
import { darkButton } from "@/components/dashboard/surface";

/** Pause or resume one plan from the customer's own account. */

interface Allowance {
  enabled: boolean;
  minDays: number;
  remainingDays: number;
}

const S = {
  en: {
    pause: "Pause my plan",
    pausedUntil: (d: string) => `Paused until ${d}. You are not billed for these days.`,
    resume: "Resume now",
    howLong: "How many days?",
    left: (n: number) => `${n} pause days left this year. Your next bill moves out by the days you pause.`,
    confirm: "Pause",
    cancel: "Cancel",
    none: "No pause days left this year.",
  },
  sw: {
    pause: "Simamisha mpango wangu",
    pausedUntil: (d: string) => `Umesimamishwa hadi ${d}. Hutozwi kwa siku hizi.`,
    resume: "Endelea sasa",
    howLong: "Siku ngapi?",
    left: (n: number) => `Siku ${n} za kusimamisha zimebaki mwaka huu. Ankara yako ijayo husogezwa mbele kwa siku unazosimamisha.`,
    confirm: "Simamisha",
    cancel: "Ghairi",
    none: "Hakuna siku za kusimamisha zilizobaki mwaka huu.",
  },
};

export function PausePlan({ subscriptionId, status, pausedUntil }: { subscriptionId: string; status: string; pausedUntil: string | null }) {
  const { lang } = useLanguage();
  const t = S[lang];
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const { data: allowance } = useQuery({
    queryKey: ["pause-allowance", subscriptionId],
    queryFn: () => apiFetch<Allowance>(`/api/v1/me/subscriptions/${subscriptionId}/pause`),
    enabled: status === "ACTIVE" || Boolean(pausedUntil),
  });
  const done = () => {
    setOpen(false);
    setError(null);
    queryClient.invalidateQueries({ queryKey: ["me-subscriptions"] });
    queryClient.invalidateQueries({ queryKey: ["pause-allowance", subscriptionId] });
  };
  const fail = (err: unknown) => setError(err instanceof ApiRequestError ? err.message : String(err));
  const pause = useMutation({ mutationFn: () => apiFetch(`/api/v1/me/subscriptions/${subscriptionId}/pause`, { method: "POST", body: JSON.stringify({ days }) }), onSuccess: done, onError: fail });
  const resume = useMutation({ mutationFn: () => apiFetch(`/api/v1/me/subscriptions/${subscriptionId}/resume`, { method: "POST", body: "{}" }), onSuccess: done, onError: fail });

  if (pausedUntil) {
    return (
      <div className="mt-3 rounded-lg bg-obsidian-900 p-3 text-xs text-slate-300">
        <p>{t.pausedUntil(new Date(pausedUntil).toLocaleDateString())}</p>
        <button type="button" className={`${darkButton("primary", "sm")} mt-2`} disabled={resume.isPending} onClick={() => resume.mutate()}>
          {t.resume}
        </button>
        {error && <p className="mt-2 text-rose-300">{error}</p>}
      </div>
    );
  }
  if (status !== "ACTIVE" || !allowance?.enabled) return null;
  if (!open) {
    return (
      <button type="button" className={`${darkButton("ghost", "sm")} mt-2`} onClick={() => setOpen(true)} disabled={allowance.remainingDays < allowance.minDays}>
        {allowance.remainingDays < allowance.minDays ? t.none : t.pause}
      </button>
    );
  }
  const options = [3, 7, 14, 21, 30, 60].filter((d) => d >= allowance.minDays && d <= allowance.remainingDays);
  return (
    <div className="mt-3 rounded-lg bg-obsidian-900 p-3 text-xs text-slate-300">
      <label className="flex items-center gap-2">
        {t.howLong}
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded border border-obsidian-700 bg-obsidian-950 px-2 py-1 text-slate-100">
          {options.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-2 text-slate-400">{t.left(allowance.remainingDays)}</p>
      <div className="mt-2 flex gap-2">
        <button type="button" className={darkButton("primary", "sm")} disabled={pause.isPending || !options.includes(days)} onClick={() => pause.mutate()}>
          {t.confirm}
        </button>
        <button type="button" className={darkButton("ghost", "sm")} onClick={() => setOpen(false)}>
          {t.cancel}
        </button>
      </div>
      {error && <p className="mt-2 text-rose-300">{error}</p>}
    </div>
  );
}
