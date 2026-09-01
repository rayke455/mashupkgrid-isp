"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Badge, Card, Input } from "@/components/ui";
import { IconShield } from "@/components/icons";

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
      <div>
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/15 text-brand-600 dark:text-brand-400">
            <IconShield size={20} />
          </span>
          Audit Log
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Who did what, and when. Every credential reveal, plan change, refund and router action is
          recorded here.
        </p>
      </div>

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
