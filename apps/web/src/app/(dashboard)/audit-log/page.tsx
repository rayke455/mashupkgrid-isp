"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Badge, Button, Card, Input } from "@/components/ui";

interface AuditEntry {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorUserId: string | null;
  ipAddress: string | null;
  createdAt: string;
  before: unknown;
  after: unknown;
}

interface Paginated {
  items: AuditEntry[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

/** Actions worth flagging: they either expose a secret or move money, and are the entries someone
 *  reviewing this page is almost always looking for. */
const SENSITIVE = /reveal|password|secret|refund|delete|remove|charge|suspend/i;

function describeAction(action: string): string {
  // "router.provisioning_script_revealed" reads as prose rather than as a database value.
  return action.replace(/[._]/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AuditLogPage() {
  const [resourceType, setResourceType] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canPurge = Boolean(user?.permissions.includes(user?.tenantId === null ? "maintenance.manage" : "settings.manage"));
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  // The server keeps the last 30 days whatever is asked, and records the purge as the newest entry.
  const purge = useMutation({
    mutationFn: (olderThanDays: number) => apiFetch<{ deleted: number; olderThanDays: number }>(`/api/v1/audit-logs?olderThanDays=${olderThanDays}`, { method: "DELETE" }),
    onSuccess: (res) => {
      setNotice({ ok: true, text: `Deleted ${res.deleted} entr${res.deleted === 1 ? "y" : "ies"} older than ${res.olderThanDays} days.` });
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: (err) => setNotice({ ok: false, text: err instanceof ApiRequestError ? err.message : "Purge failed" }),
  });
  const askPurge = () => {
    const answer = window.prompt("Delete audit entries older than how many days? The last 30 days are always kept.", "90");
    if (answer === null) return;
    const daysBack = Number(answer);
    if (!Number.isInteger(daysBack) || daysBack < 30) {
      setNotice({ ok: false, text: "Enter a whole number of days, at least 30." });
      return;
    }
    if (window.confirm(`Permanently delete every audit entry older than ${daysBack} days?`)) purge.mutate(daysBack);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", resourceType, action, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (resourceType.trim()) params.set("resourceType", resourceType.trim());
      if (action.trim()) params.set("action", action.trim());
      return apiFetch<Paginated>(`/api/v1/audit-logs?${params.toString()}`);
    },
  });

  const items = data?.items ?? [];
  const pagination = data?.pagination;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Audit log
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Who did what, and when. Every credential reveal, plan change, refund and router action is
            recorded here.
          </p>
        </div>
        {canPurge && (
          <Button variant="outline" size="sm" onClick={askPurge} disabled={purge.isPending} className="shrink-0">
            {purge.isPending ? "Deleting…" : "Delete old entries"}
          </Button>
        )}
      </div>

      {notice && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            notice.ok
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300"
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Filters sit above the list, not inside it — they govern the whole view. */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1">
          <label htmlFor="resourceType" className="mb-1 block text-xs font-semibold text-slate-500">
            Resource type
          </label>
          <Input
            id="resourceType"
            placeholder="e.g. Router, Invoice"
            value={resourceType}
            onChange={(e) => {
              setResourceType(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="min-w-[180px] flex-1">
          <label htmlFor="action" className="mb-1 block text-xs font-semibold text-slate-500">
            Action
          </label>
          <Input
            id="action"
            placeholder="e.g. router.password_revealed"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading audit entries…</p>}

      {!isLoading && items.length === 0 && (
        <Card className="px-4 py-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No audit entries match these filters.
          </p>
        </Card>
      )}

      <div className="space-y-2">
        {items.map((entry) => {
          const sensitive = SENSITIVE.test(entry.action);
          const hasDetail = entry.before != null || entry.after != null;
          return (
            <Card key={entry.id} className="px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {describeAction(entry.action)}
                    </span>
                    {sensitive && <Badge variant="warning">Sensitive</Badge>}
                    <span className="text-xs text-slate-400">{entry.resourceType}</span>
                  </div>
                  <p className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {entry.actorUserId ? `by ${entry.actorUserId}` : "by the system"}
                    {entry.ipAddress ? ` · ${entry.ipAddress}` : ""}
                  </p>
                  {hasDetail && (
                    <button
                      type="button"
                      onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                      className="mt-1 text-[11px] font-medium text-brand-600 hover:underline dark:text-brand-400"
                    >
                      {expanded === entry.id ? "Hide changes" : "Show changes"}
                    </button>
                  )}
                </div>
                <span className="shrink-0 text-xs text-slate-400">{when(entry.createdAt)}</span>
              </div>

              {expanded === entry.id && (
                <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-[11px] text-slate-300">
                  {JSON.stringify({ before: entry.before, after: entry.after }, null, 2)}
                </pre>
              )}
            </Card>
          );
        })}
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            Page {pagination.page} of {pagination.totalPages} · {pagination.total} entries
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-lg border border-slate-300 px-2.5 py-1 disabled:opacity-40 dark:border-obsidian-700"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-slate-300 px-2.5 py-1 disabled:opacity-40 dark:border-obsidian-700"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
