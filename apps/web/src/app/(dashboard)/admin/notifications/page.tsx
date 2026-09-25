"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { HintText, Input, Label } from "@/components/ui";
import { EmptyState, Notice, PageHeader, Panel, Pill, Segmented, TableShell, darkButton, td, th } from "@/components/dashboard/surface";
import { LEVEL_META, timeAgo, type NotificationLevel } from "@/components/notifications";

interface SentNotification {
  id: string;
  title: string;
  body: string;
  severity: NotificationLevel;
  createdAt: string;
  expiresAt: string | null;
  tenant: { id: string; name: string } | null;
  readCount: number;
}

interface TenantOption {
  id: string;
  name: string;
  slug: string;
}

const selectClass =
  "w-full rounded-lg border border-obsidian-700 bg-obsidian-950 px-3.5 py-2 text-sm text-slate-100 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

const EXPIRY_OPTIONS = [
  { value: "", label: "Never" },
  { value: "1", label: "After 1 day" },
  { value: "3", label: "After 3 days" },
  { value: "7", label: "After 1 week" },
  { value: "30", label: "After 30 days" },
];

export default function AdminNotificationsPage() {
  const queryClient = useQueryClient();
  const { data: sent, isLoading } = useQuery({
    queryKey: ["admin-notifications"],
    queryFn: () => apiFetch<SentNotification[]>("/api/v1/announcements"),
  });
  const { data: tenants } = useQuery({
    queryKey: ["admin-notification-tenants"],
    queryFn: () => apiFetch<{ items: TenantOption[] }>("/api/v1/platform/tenants?limit=100"),
  });

  const [audience, setAudience] = useState<"all" | "one">("all");
  const [tenantId, setTenantId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [level, setLevel] = useState<NotificationLevel>("INFO");
  const [expiryDays, setExpiryDays] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentOk, setSentOk] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/announcements", {
        method: "POST",
        body: JSON.stringify({
          tenantId: audience === "all" ? null : tenantId,
          title: title.trim(),
          body: body.trim(),
          severity: level,
          expiresAt: expiryDays ? new Date(Date.now() + Number(expiryDays) * 86_400_000).toISOString() : null,
        }),
      }),
    onSuccess: () => {
      const who = audience === "all" ? "every ISP" : tenants?.items.find((t) => t.id === tenantId)?.name ?? "the ISP";
      setSentOk(`Sent to ${who}.`);
      setTitle("");
      setBody("");
      setLevel("INFO");
      setExpiryDays("");
      queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
      setTimeout(() => setSentOk(null), 4000);
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Couldn't send the notification."),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/announcements/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-notifications"] }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (audience === "one" && !tenantId) return setError("Choose which ISP gets it.");
    if (!title.trim() || !body.trim()) return setError("Add a title and a message.");
    send.mutate();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Send a message to ISP dashboards. It appears under the bell; Warning and Critical also show as a banner on every page until read."
      />

      <Panel title="New notification">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Send to</Label>
            <div className="flex flex-wrap items-center gap-3">
              <Segmented
                label="Audience"
                value={audience}
                onChange={setAudience}
                options={[
                  { value: "all", label: "All ISPs" },
                  { value: "one", label: "One ISP" },
                ]}
              />
              {audience === "one" && (
                <select aria-label="ISP" className={`${selectClass} max-w-xs`} value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
                  <option value="">Choose an ISP…</option>
                  {tenants?.items.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.slug})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="n-title">Title</Label>
            <Input id="n-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Scheduled maintenance on Sunday" />
          </div>
          <div>
            <Label htmlFor="n-body">Message</Label>
            <textarea
              id="n-body"
              value={body}
              maxLength={2000}
              rows={4}
              onChange={(e) => setBody(e.target.value)}
              className={`${selectClass} min-h-[110px] leading-6`}
              placeholder="What's happening, when, and whether they need to do anything."
            />
            <HintText>{body.length}/2000</HintText>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="n-level">Importance</Label>
              <select id="n-level" className={selectClass} value={level} onChange={(e) => setLevel(e.target.value as NotificationLevel)}>
                <option value="INFO">Info: bell only</option>
                <option value="WARNING">Warning: bell and banner</option>
                <option value="CRITICAL">Critical: bell and red banner</option>
              </select>
            </div>
            <div>
              <Label htmlFor="n-expiry">Stop showing it</Label>
              <select id="n-expiry" className={selectClass} value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)}>
                {EXPIRY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && <Notice tone="bad">{error}</Notice>}
          {sentOk && <Notice tone="good">{sentOk}</Notice>}
          <div className="flex justify-end">
            <button type="submit" className={darkButton("primary")} disabled={send.isPending}>
              {send.isPending ? "Sending…" : "Send notification"}
            </button>
          </div>
        </form>
      </Panel>

      <Panel title="Sent" description="The latest 100. Deleting one removes it from every dashboard." padded={false}>
        {isLoading ? (
          <p className="px-5 py-8 text-sm text-slate-400">Loading…</p>
        ) : !sent?.length ? (
          <EmptyState title="Nothing sent yet">Notifications you send appear here.</EmptyState>
        ) : (
          <TableShell minWidth={760}>
            <thead>
              <tr>
                <th className={th}>Notification</th>
                <th className={th}>To</th>
                <th className={th}>Importance</th>
                <th className={`${th} text-right`}>Read by</th>
                <th className={th}>Sent</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {sent.map((n) => {
                const expired = n.expiresAt !== null && new Date(n.expiresAt).getTime() < Date.now();
                return (
                  <tr key={n.id}>
                    <td className={`${td} max-w-[340px] whitespace-normal`}>
                      <p className="font-medium text-white">{n.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{n.body}</p>
                    </td>
                    <td className={td}>{n.tenant ? n.tenant.name : "All ISPs"}</td>
                    <td className={td}>
                      <Pill tone={n.severity === "CRITICAL" ? "bad" : n.severity === "WARNING" ? "warn" : "neutral"}>{LEVEL_META[n.severity].label}</Pill>
                    </td>
                    <td className={`${td} text-right tabular-nums`}>
                      {n.readCount} {n.readCount === 1 ? "person" : "people"}
                    </td>
                    <td className={`${td} text-slate-400`}>
                      {timeAgo(n.createdAt)}
                      {expired && <span className="block text-xs text-slate-500">Expired</span>}
                    </td>
                    <td className={`${td} text-right`}>
                      <button
                        type="button"
                        className={`${darkButton("ghost", "sm")} text-rose-300 hover:text-rose-200`}
                        disabled={remove.isPending}
                        onClick={() => {
                          if (confirm(`Delete "${n.title}" from every dashboard?`)) remove.mutate(n.id);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}
      </Panel>
    </div>
  );
}
