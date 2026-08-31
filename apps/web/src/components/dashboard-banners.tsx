"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

interface Announcement {
  id: string;
  title: string;
  body: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
}

const SEVERITY_STYLES: Record<Announcement["severity"], string> = {
  INFO: "bg-brand-50 border-brand-200 text-brand-800 dark:bg-brand-950/40 dark:border-brand-900/60 dark:text-brand-200",
  WARNING: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-900/60 dark:text-amber-200",
  CRITICAL: "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-900/60 dark:text-rose-200",
};

function trialCountdown(trialEndsAt: string): { label: string; expired: boolean; days: number; hours: number } {
  const msLeft = new Date(trialEndsAt).getTime() - Date.now();
  if (msLeft <= 0) return { label: "Your free trial has ended", expired: true, days: 0, hours: 0 };
  const days = Math.floor(msLeft / (24 * 60 * 60 * 1000));
  const hours = Math.floor((msLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  return {
    label: `${days} day${days === 1 ? "" : "s"} ${hours} hour${hours === 1 ? "" : "s"} left in your free trial`,
    expired: false,
    days,
    hours,
  };
}

/** Two independent banner sources stacked at the top of every dashboard page: the tenant's own
 *  trial countdown (derived client-side from tenantTrialEndsAt already on the hydrated user, no
 *  extra request) and super-admin announcements (fetched once, dismissible per-user). */
export function DashboardBanners() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: announcements } = useQuery({
    queryKey: ["announcements-mine"],
    queryFn: () => apiFetch<Announcement[]>("/api/v1/announcements/mine"),
    enabled: Boolean(user?.tenantId),
  });

  const dismiss = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/announcements/${id}/dismiss`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["announcements-mine"] }),
  });

  const trial = user?.tenantTrialEndsAt ? trialCountdown(user.tenantTrialEndsAt) : null;

  if (!trial && (!announcements || announcements.length === 0)) return null;

  return (
    <div className="space-y-3 mb-6 w-full min-w-0">
      {trial && (
        <div
          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border p-4 text-xs sm:text-sm shadow-xs transition-all ${
            trial.expired
              ? "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-900/60 dark:text-rose-200"
              : "bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-amber-300 dark:border-amber-500/30 text-amber-900 dark:text-amber-200"
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-base">
              {trial.expired ? "⛔" : "⏳"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-slate-900 dark:text-white tracking-tight break-words">
                {trial.expired ? "Trial Expired" : `${trial.days} Days ${trial.hours} Hours Remaining`}
              </p>
              <p className="text-[11px] text-amber-700 dark:text-amber-300/80 truncate">
                {trial.label}
              </p>
            </div>
          </div>
          <a
            href="/packages"
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-amber-500 hover:bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition-all active:scale-95 text-center"
          >
            Upgrade Plan &rarr;
          </a>
        </div>
      )}

      {announcements?.map((a) => (
        <div
          key={a.id}
          className={`flex flex-col sm:flex-row sm:items-start justify-between gap-3 rounded-2xl border p-3.5 sm:p-4 text-xs sm:text-sm shadow-xs ${SEVERITY_STYLES[a.severity]}`}
        >
          <div className="min-w-0 flex-1">
            <span className="font-bold block sm:inline">{a.title}</span>
            <span className="sm:ml-2 text-slate-600 dark:text-slate-300 block sm:inline mt-1 sm:mt-0 break-words">
              {a.body}
            </span>
          </div>
          <button
            type="button"
            onClick={() => dismiss.mutate(a.id)}
            className="self-end sm:self-auto shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold opacity-80 hover:opacity-100 bg-black/5 dark:bg-white/10 transition-all"
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
