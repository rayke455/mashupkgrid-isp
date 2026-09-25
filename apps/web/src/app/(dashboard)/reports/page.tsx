"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Card, Input, Badge } from "@/components/ui";

interface BandwidthByDay {
  date: string;
  uploadBytes: number;
  downloadBytes: number;
  sessionCount: number;
}

interface TopConsumer {
  username: string;
  uploadBytes: number;
  downloadBytes: number;
  totalBytes: number;
  sessionCount: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function ReportsPage() {
  const [days, setDays] = useState<7 | 14 | 30>(30);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: byDay, isLoading: byDayLoading } = useQuery({
    queryKey: ["report-bandwidth", days],
    queryFn: () => apiFetch<BandwidthByDay[]>(`/api/v1/reports/bandwidth?days=${days}`),
  });

  const { data: topConsumers, isLoading: topLoading } = useQuery({
    queryKey: ["report-bandwidth-top", days],
    queryFn: () => apiFetch<TopConsumer[]>(`/api/v1/reports/bandwidth/top-consumers?days=${days}`),
  });

  const totalUpload = byDay?.reduce((sum, d) => sum + d.uploadBytes, 0) ?? 0;
  const totalDownload = byDay?.reduce((sum, d) => sum + d.downloadBytes, 0) ?? 0;
  const totalBytes = totalUpload + totalDownload;
  const totalSessions = byDay?.reduce((sum, d) => sum + d.sessionCount, 0) ?? 0;

  const maxDayTotal = Math.max(1, ...(byDay?.map((d) => d.uploadBytes + d.downloadBytes) ?? [0]));

  const filteredConsumers = topConsumers?.filter((c) =>
    c.username.toLowerCase().includes(searchQuery.toLowerCase())
  ) ?? [];

  return (
    <div className="space-y-6 text-left font-sans">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Bandwidth usage
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            How much data your subscribers use, from RADIUS accounting.
          </p>
        </div>

        {/* Time Period Filter */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-obsidian-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium">
          <button
            type="button"
            onClick={() => setDays(7)}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              days === 7 ? "bg-brand-600 text-white shadow-sm" : "text-slate-500 hover:text-white"
            }`}
          >
            Last 7 Days
          </button>
          <button
            type="button"
            onClick={() => setDays(14)}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              days === 14 ? "bg-brand-600 text-white shadow-sm" : "text-slate-500 hover:text-white"
            }`}
          >
            Last 14 Days
          </button>
          <button
            type="button"
            onClick={() => setDays(30)}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              days === 30 ? "bg-brand-600 text-white shadow-sm" : "text-slate-500 hover:text-white"
            }`}
          >
            Last 30 Days
          </button>
        </div>
      </div>

      {/* 4 KPI SUMMARY CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <Card className="p-4 space-y-1 bg-slate-900/60 border-slate-800">
          <span className="block text-sm text-slate-400">Total data</span>
          <div className="text-xl font-semibold tabular-nums text-white sm:text-2xl">{formatBytes(totalBytes)}</div>
          <span className="text-xs text-slate-500">Download and upload</span>
        </Card>

        <Card className="p-4 space-y-1 bg-slate-900/60 border-slate-800">
          <span className="block text-sm text-slate-400">Downloaded</span>
          <div className="text-xl font-semibold tabular-nums text-white sm:text-2xl">{formatBytes(totalDownload)}</div>
          <span className="text-xs text-slate-500">
            {totalBytes > 0 ? `${Math.round((totalDownload / totalBytes) * 100)}% of total` : "0%"}
          </span>
        </Card>

        <Card className="p-4 space-y-1 bg-slate-900/60 border-slate-800">
          <span className="block text-sm text-slate-400">Uploaded</span>
          <div className="text-xl font-semibold tabular-nums text-white sm:text-2xl">{formatBytes(totalUpload)}</div>
          <span className="text-xs text-slate-500">
            {totalBytes > 0 ? `${Math.round((totalUpload / totalBytes) * 100)}% of total` : "0%"}
          </span>
        </Card>

        <Card className="p-4 space-y-1 bg-slate-900/60 border-slate-800">
          <span className="block text-sm text-slate-400">Sessions</span>
          <div className="text-xl font-semibold tabular-nums text-white sm:text-2xl">{totalSessions.toLocaleString()}</div>
          <span className="text-xs text-slate-500">Recorded by RADIUS</span>
        </Card>
      </div>

      {/* DAILY TRAFFIC HISTOGRAM */}
      <Card className="p-6 space-y-4 border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
              Data used per day
            </h2>
            <p className="text-xs text-slate-400">
              Download and upload across all your routers.
            </p>
          </div>
          <span className="text-xs text-slate-400">
            Average: {formatBytes(totalBytes / (byDay?.length || 1))} / day
          </span>
        </div>

        {byDayLoading && <p className="text-xs text-slate-400 py-4">Loading daily telemetry...</p>}

        {byDay && byDay.length > 0 && (
          <div className="space-y-2.5 pt-2">
            {byDay.map((day) => {
              const total = day.uploadBytes + day.downloadBytes;
              const widthPct = Math.max(3, (total / maxDayTotal) * 100);
              const dlPct = total > 0 ? (day.downloadBytes / total) * 100 : 80;

              return (
                <div key={day.date} className="flex items-center gap-3 text-xs tabular-nums">
                  <span className="w-24 shrink-0 text-slate-400 text-[11px]">{day.date}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded-md bg-slate-900 border border-slate-800 flex">
                    <div
                      className="h-full bg-brand-500"
                      style={{ width: `${widthPct * (dlPct / 100)}%` }}
                      title={`Download: ${formatBytes(day.downloadBytes)}`}
                    />
                    <div
                      className="h-full bg-cyan-400 opacity-90"
                      style={{ width: `${widthPct * ((100 - dlPct) / 100)}%` }}
                      title={`Upload: ${formatBytes(day.uploadBytes)}`}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-slate-300">
                    {formatBytes(total)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {byDay && byDay.length === 0 && !byDayLoading && (
          <div className="py-8 text-center text-xs text-slate-400 space-y-1">
            <p className="font-medium text-slate-300">No RADIUS accounting records received yet.</p>
            <p>Traffic logs automatically populate as FreeRADIUS processes subscriber session packets.</p>
          </div>
        )}
      </Card>

      {/* TOP CONSUMERS TABLE */}
      <Card className="p-6 space-y-4 border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
              Top users (last {days} days)
            </h2>
            <p className="text-xs text-slate-400">
              Subscribers who used the most data, PPPoE and hotspot.
            </p>
          </div>

          <div className="w-full sm:w-64">
            <Input
              placeholder="Search subscriber username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs py-1.5"
            />
          </div>
        </div>

        {topLoading && <p className="text-xs text-slate-400 py-4">Querying top consumers...</p>}

        {filteredConsumers.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">Subscriber Username</th>
                  <th className="px-4 py-3">Download (Rx)</th>
                  <th className="px-4 py-3">Upload (Tx)</th>
                  <th className="px-4 py-3">Total Data</th>
                  <th className="px-4 py-3">Sessions</th>
                  <th className="px-4 py-3">FUP Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredConsumers.map((c) => (
                  <tr key={c.username} className="hover:bg-slate-900/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-white flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      <span>{c.username}</span>
                    </td>
                    <td className="px-4 py-3 text-emerald-400">{formatBytes(c.uploadBytes)}</td>
                    <td className="px-4 py-3 text-cyan-400">{formatBytes(c.downloadBytes)}</td>
                    <td className="px-4 py-3 font-medium text-white">{formatBytes(c.totalBytes)}</td>
                    <td className="px-4 py-3 text-slate-400">{c.sessionCount}</td>
                    <td className="px-4 py-3">
                      <Badge variant={c.totalBytes > 50 * 1024 * 1024 * 1024 ? "warning" : "success"}>
                        {c.totalBytes > 50 * 1024 * 1024 * 1024 ? "Heavy User" : "Normal"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredConsumers.length === 0 && !topLoading && (
          <div className="py-8 text-center text-xs text-slate-400">
            No subscriber usage records found matching &ldquo;{searchQuery}&rdquo;.
          </div>
        )}
      </Card>
    </div>
  );
}
