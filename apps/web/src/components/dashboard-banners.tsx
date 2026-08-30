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

function trialCountdown(trialEndsAt: string): { label: string; expired: boolean } {
  const msLeft = new Date(trialEndsAt).getTime() - Date.now();
  if (msLeft <= 0) return { label: "Your free trial has ended", expired: true };
  const days = Math.floor(msLeft / (24 * 60 * 60 * 1000));
  const hours = Math.floor((msLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  return { label: `${days} day${days === 1 ? "" : "s"} ${hours} hour${hours === 1 ? "" : "s"} left in your free trial`, expired: false };
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
    <div className="space-y-2 mb-6">
      {trial && (
        <div
          className={`flex items-center justify-between rounded-xl border px-4 py-2.5 text-sm ${
            trial.expired
              ? "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-900/60 dark:text-rose-200"
              : "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-900/60 dark:text-amber-200"
          }`}
        >
          <span className="font-medium">
            {trial.expired ? "⛔" : "⏳"} {trial.label}
          </span>
        </div>
      )}

      {announcements?.map((a) => (
        <div
          key={a.id}
          className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm ${SEVERITY_STYLES[a.severity]}`}
        >
          <div>
            <span className="font-semibold">{a.title}</span>
            <span className="ml-2">{a.body}</span>
          </div>
          <button
            type="button"
            onClick={() => dismiss.mutate(a.id)}
            className="shrink-0 text-xs font-semibold opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
