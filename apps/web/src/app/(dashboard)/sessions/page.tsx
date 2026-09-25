"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { PageHeader, Panel, Pill, darkButton } from "@/components/dashboard/surface";

interface SessionRow {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string;
  isCurrent: boolean;
}

/** "Edge on Windows" from a user-agent string; the raw string is kept as a tooltip. */
function describeDevice(ua: string | null): string {
  if (!ua) return "Unknown device";
  if (/^curl\//i.test(ua)) return "Command line (curl)";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iOS/.test(ua)
        ? "iPhone / iPad"
        : /Mac OS X/.test(ua)
          ? "Mac"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? ua.slice(0, 40);
}

export default function SessionsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => apiFetch<SessionRow[]>("/api/v1/sessions"),
  });

  const revoke = useMutation({
    mutationFn: (sessionId: string) => apiFetch(`/api/v1/sessions/${sessionId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="My sessions" description="Devices signed in to your account. Sign out any you don't recognise." />

      <Panel padded={false}>
        {isLoading ? (
          <p className="px-5 py-8 text-sm text-slate-400">Loading sessions…</p>
        ) : (
          <ul className="divide-y divide-obsidian-800">
            {data?.map((session) => (
              <li key={session.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-white" title={session.userAgent ?? undefined}>
                    {describeDevice(session.userAgent)}
                    {session.isCurrent && <Pill tone="good">This device</Pill>}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {session.ipAddress ?? "Unknown IP"} · last active {new Date(session.lastUsedAt).toLocaleString()}
                  </p>
                </div>
                {!session.isCurrent && (
                  <button
                    type="button"
                    className={`${darkButton("secondary", "sm")} shrink-0`}
                    onClick={() => revoke.mutate(session.id)}
                    disabled={revoke.isPending}
                  >
                    Sign out
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
