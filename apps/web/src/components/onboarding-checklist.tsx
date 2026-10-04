"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Card } from "@/components/ui";
import { IconCheck, IconChevronRight } from "@/components/icons";
import { tr } from "@/lib/tr";

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
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">{tr("Set up your account")}</h2>
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
          className="group mb-3 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 transition-colors hover:border-brand-500/60 dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-white"
        >
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{tr("Next step")}</p>
            <p className="text-sm font-semibold">{nextStep.label}</p>
          </div>
          <IconChevronRight size={18} className="shrink-0 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((step) => (
          <Link
            key={step.key}
            href={step.href}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${step.done ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400" : "border-slate-200 bg-white text-slate-600 hover:border-brand-500/60 dark:border-obsidian-800 dark:bg-obsidian-950 dark:text-slate-300"}`}
          >
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${step.done ? "bg-emerald-500 text-white" : "border border-slate-300 dark:border-obsidian-700"}`}>
              {step.done ? <IconCheck size={11} /> : <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />}
            </span>
            <span className={step.done ? "line-through opacity-75" : "font-medium"}>{step.label}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}
