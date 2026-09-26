"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";
import { timeAgo } from "@/components/notifications";
import { EmptyState, Metric, MetricGrid, PageHeader, Panel, Pill, Segmented, TableShell, td, th } from "@/components/dashboard/surface";

/**
 * Everyone online right now, hotspot and PPPoE together, with who they are and whether they
 * have paid. The row an operator reads when a customer calls saying "my internet is off".
 */

type SessionType = "PPPOE" | "HOTSPOT" | "STATIC_IP" | "IPTV";

interface TrackedSession {
  id: string;
  username: string;
  type: SessionType;
  state: "ACTIVE" | "STALE" | "ENDED";
  customer: { id: string; fullName: string; phone: string; customerNumber: string } | null;
  packageName: string | null;
  voucher: { code: string; expiresAt: string | null; status: string } | null;
  router: { id: string; name: string } | null;
  nasIpAddress: string;
  ipAddress: string | null;
  macAddress: string | null;
  startedAt: string | null;
  lastSeenAt: string | null;
  endedAt: string | null;
  durationSeconds: number;
  downloadBytes: number;
  uploadBytes: number;
  terminateCause: string | null;
  lastPayment: { amountMinor: number; currency: string; method: string; createdAt: string } | null;
}

interface SessionsResponse {
  items: TrackedSession[];
  summary: { activeHotspot: number; activePppoe: number; activeOther: number; activePaid: number };
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const TYPE_LABEL: Record<SessionType, string> = { PPPOE: "PPPoE", HOTSPOT: "Hotspot", STATIC_IP: "Static IP", IPTV: "IPTV" };

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min`;
  const hrs = Math.floor(m / 60);
  if (hrs < 48) return `${hrs} h ${m % 60} min`;
  return `${Math.floor(hrs / 24)} d ${hrs % 24} h`;
}

const STATE: Record<TrackedSession["state"], { tone: "good" | "warn" | "neutral"; label: string }> = {
  ACTIVE: { tone: "good", label: "Online" },
  STALE: { tone: "warn", label: "No update" },
  ENDED: { tone: "neutral", label: "Ended" },
};

export default function OnlineUsersPage() {
  const [scope, setScope] = useState<"active" | "recent">("active");
  const [type, setType] = useState<"ALL" | SessionType>("ALL");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [scope, type, debounced]);

  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ["radius-sessions", scope, type, debounced, page],
    queryFn: () => {
      const params = new URLSearchParams({ scope, page: String(page), limit: "50" });
      if (type !== "ALL") params.set("type", type);
      if (debounced) params.set("search", debounced);
      return apiFetch<SessionsResponse>(`/api/v1/radius/sessions?${params.toString()}`);
    },
    // Routers send interim accounting every minute or so; faster than this shows nothing new.
    refetchInterval: scope === "active" ? 20_000 : false,
  });

  const summary = data?.summary;
  const items = data?.items ?? [];

  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHeader
        title="Online users"
        description="Every hotspot and PPPoE session, with the customer and their last payment behind it. Updates every 20 seconds."
        actions={dataUpdatedAt ? <span className="text-xs text-slate-500">Updated {timeAgo(new Date(dataUpdatedAt).toISOString())}</span> : undefined}
      />

      <MetricGrid columns={4}>
        <Metric label="Hotspot online" value={summary ? summary.activeHotspot : "—"} hint="Voucher and account logins" />
        <Metric label="PPPoE online" value={summary ? summary.activePppoe : "—"} hint="Home and business lines" />
        <Metric
          label="Online and paid"
          value={summary ? summary.activePaid : "—"}
          hint={summary ? `${summary.activeHotspot + summary.activePppoe + summary.activeOther - summary.activePaid} with no payment on record` : undefined}
          tone={summary && summary.activeHotspot + summary.activePppoe + summary.activeOther - summary.activePaid > 0 ? "warn" : undefined}
        />
        <Metric label="Other services" value={summary ? summary.activeOther : "—"} hint="Static IP and IPTV" />
      </MetricGrid>

      <Panel padded={false}>
        <div className="flex flex-col gap-3 border-b border-obsidian-800 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label="Scope"
              value={scope}
              onChange={setScope}
              options={[
                { value: "active", label: "Online now" },
                { value: "recent", label: "Last 7 days" },
              ]}
            />
            <Segmented
              label="Service"
              value={type}
              onChange={setType}
              options={[
                { value: "ALL", label: "All" },
                { value: "HOTSPOT", label: "Hotspot" },
                { value: "PPPOE", label: "PPPoE" },
              ]}
            />
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, phone, voucher, IP or MAC"
            className="w-full rounded-lg border border-obsidian-700 bg-obsidian-950 px-3 py-1.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-brand-500 sm:w-72"
          />
        </div>

        {error ? (
          <p className="px-5 py-8 text-sm text-rose-300">Couldn&rsquo;t load sessions: {error instanceof Error ? error.message : String(error)}</p>
        ) : isLoading && !data ? (
          <p className="px-5 py-8 text-sm text-slate-400">Loading…</p>
        ) : items.length === 0 ? (
          <EmptyState title={scope === "active" ? "Nobody is online right now" : "No sessions in the last 7 days"}>
            Sessions appear here as soon as a router reports them over RADIUS accounting.
          </EmptyState>
        ) : (
          <TableShell minWidth={1080}>
            <thead>
              <tr>
                <th className={th}>Who</th>
                <th className={th}>Service</th>
                <th className={th}>Status</th>
                <th className={th}>Router</th>
                <th className={th}>Address</th>
                <th className={th}>{scope === "active" ? "Online for" : "Duration"}</th>
                <th className={th}>Data</th>
                <th className={th}>Last payment</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => {
                const state = STATE[s.state];
                return (
                  <tr key={s.id}>
                    <td className={`${td} whitespace-normal`}>
                      {s.customer ? (
                        <>
                          <Link href={`/customers/${s.customer.id}`} className="font-medium text-white hover:underline">
                            {s.customer.fullName}
                          </Link>
                          <span className="block text-xs text-slate-500">
                            {s.customer.phone} · {s.username}
                          </span>
                        </>
                      ) : s.voucher ? (
                        <>
                          <span className="font-mono text-[13px] text-white">{s.voucher.code}</span>
                          <span className="block text-xs text-slate-500">
                            Voucher{s.voucher.expiresAt ? ` · expires ${timeAgo(s.voucher.expiresAt).replace(" ago", "")}` : ""}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="font-mono text-[13px] text-slate-200">{s.username}</span>
                          <span className="block text-xs text-slate-500">Not a known customer or voucher</span>
                        </>
                      )}
                    </td>
                    <td className={`${td} text-slate-300`}>
                      {TYPE_LABEL[s.type]}
                      {s.packageName && <span className="block text-xs text-slate-500">{s.packageName}</span>}
                    </td>
                    <td className={td}>
                      <Pill tone={state.tone}>{state.label}</Pill>
                      {s.state === "ENDED" && s.terminateCause && <span className="block pt-1 text-xs text-slate-500">{s.terminateCause}</span>}
                    </td>
                    <td className={`${td} text-slate-300`}>
                      {s.router ? (
                        <Link href="/routers" className="hover:underline">
                          {s.router.name}
                        </Link>
                      ) : (
                        <span className="font-mono text-[13px] text-slate-500">{s.nasIpAddress}</span>
                      )}
                    </td>
                    <td className={`${td} font-mono text-[13px] text-slate-400`}>
                      {s.ipAddress ?? "—"}
                      {s.macAddress && <span className="block text-xs text-slate-500">{s.macAddress}</span>}
                    </td>
                    <td className={`${td} text-slate-300`}>
                      {formatDuration(s.durationSeconds)}
                      {s.lastSeenAt && s.state !== "ENDED" && <span className="block text-xs text-slate-500">seen {timeAgo(s.lastSeenAt)}</span>}
                      {s.endedAt && <span className="block text-xs text-slate-500">ended {timeAgo(s.endedAt)}</span>}
                    </td>
                    <td className={`${td} text-slate-300`}>
                      {formatBytes(s.downloadBytes)} <span className="text-slate-500">↓</span>
                      <span className="block text-xs text-slate-500">{formatBytes(s.uploadBytes)} ↑</span>
                    </td>
                    <td className={td}>
                      {s.lastPayment ? (
                        <>
                          <span className="font-medium tabular-nums text-white">{formatMoney(s.lastPayment.amountMinor, s.lastPayment.currency)}</span>
                          <span className="block text-xs text-slate-500">{timeAgo(s.lastPayment.createdAt)}</span>
                        </>
                      ) : s.voucher ? (
                        <span className="text-xs text-slate-400">Prepaid voucher</span>
                      ) : (
                        <Pill tone="warn">None on record</Pill>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}

        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-obsidian-800 px-5 py-3 text-sm text-slate-400">
            <span>
              Page {data.pagination.page} of {data.pagination.totalPages} · {data.pagination.total} sessions
            </span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-obsidian-700 px-3 py-1 disabled:opacity-40">
                Previous
              </button>
              <button
                type="button"
                disabled={page >= data.pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-obsidian-700 px-3 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
