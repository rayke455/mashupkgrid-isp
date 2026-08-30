"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Card } from "@/components/ui";
import { IconCheck, IconChevronRight } from "@/components/icons";

interface OnboardingStep {
  key: string;
  label: string;
  href: string;
  done: boolean;
}

/** Every step reflects real, persisted setup state (see apps/api/src/routes/onboarding.ts) —
 *  there is no client-side "mark as done" a tenant could game; each box only checks itself once
 *  the underlying thing (a branding color, an active SMS config, a linked router...) exists. */
export function OnboardingChecklist() {
  const { data } = useQuery({
    queryKey: ["onboarding-progress"],
    queryFn: () => apiFetch<{ steps: OnboardingStep[] }>("/api/v1/onboarding"),
  });

  if (!data) return null;
  const { steps } = data;
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null; // fully set up — nothing left to nudge toward

  const nextStep = steps.find((s) => !s.done);
  const percent = Math.round((doneCount / steps.length) * 100);

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Set up your account
        </h2>
        <span className="text-xs font-medium text-slate-400">
          {doneCount} of {steps.length} done · {steps.length - doneCount} steps left
        </span>
      </div>

      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-obsidian-800">
        <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${percent}%` }} />
      </div>

      {nextStep && (
        <Link
          href={nextStep.href}
          className="group mb-3 flex items-center justify-between rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-3 text-white shadow-sm transition-transform hover:scale-[1.01]"
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">Next step</p>
            <p className="text-sm font-semibold">{nextStep.label}</p>
          </div>
          <IconChevronRight size={18} className="shrink-0 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}

      {doneCount > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[11px] font-medium text-slate-400">Already done:</span>
          {steps
            .filter((s) => s.done)
            .map((s) => (
              <span
                key={s.key}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
              >
                <IconCheck size={10} /> {s.label}
              </span>
            ))}
        </div>
      )}
    </Card>
  );
}
