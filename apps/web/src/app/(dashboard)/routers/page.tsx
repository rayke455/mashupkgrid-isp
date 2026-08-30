"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Button, Card, ErrorText, Badge, StatusDot } from "@/components/ui";
import { IconRouter, IconCopy, IconCheck, IconPulse, IconTerminal } from "@/components/icons";

interface RouterRow {
  id: string;
  name: string;
  vendor: string;
  host: string | null;
  apiPort: number;
  useTls: boolean;
  status: "UNKNOWN" | "ONLINE" | "WARNING" | "DOWN";
  lastSeenAt: string | null;
  lastError: string | null;
  cpuLoadPercent: number | null;
  uptimeSeconds: number | null;
  updatedAt: string;
  vpnIp: string | null;
}

interface DeviceSession {
  username: string;
  address?: string;
  uptime?: string;
  callerId?: string;
}

function formatUptime(seconds: number | null): string {
  if (seconds === null) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

function formatLastChecked(iso: string | null): string {
  if (!iso) return "never checked";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return "checked just now";
  if (seconds < 60) return `checked ${seconds}s ago`;
  return `checked ${Math.floor(seconds / 60)}m ago`;
}

export default function RoutersPage() {
  const queryClient = useQueryClient();
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const [error, setError] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [scripts, setScripts] = useState<
    Record<string, { mikrotikScript: string; freeradiusClientSnippet: string }>
  >({});
  const [vpnScripts, setVpnScripts] = useState<Record<string, string>>({});
  const [openSessionsFor, setOpenSessionsFor] = useState<string | null>(null);

  const { data: routers, isLoading } = useQuery({
    queryKey: ["routers"],
    queryFn: () => apiFetch<RouterRow[]>("/api/v1/routers"),
    refetchInterval: 5000,
  });

  const testConnection = useMutation({
    mutationFn: (routerId: string) => {
      setTestingId(routerId);
      return apiFetch(`/api/v1/routers/${routerId}/test-connection`, { method: "POST" });
    },
    onSettled: () => {
      setTestingId(null);
      queryClient.invalidateQueries({ queryKey: ["routers"] });
    },
  });

  const deleteRouter = useMutation({
    mutationFn: (routerId: string) => apiFetch(`/api/v1/routers/${routerId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["routers"] }),
  });

  const [kickingId, setKickingId] = useState<string | null>(null);
  const [boostingId, setBoostingId] = useState<string | null>(null);
  const [enforcingId, setEnforcingId] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const applySpeedtestBoost = useMutation({
    mutationFn: (routerId: string) => {
      setBoostingId(routerId);
      return apiFetch<{ success: boolean; message: string }>(`/api/v1/routers/${routerId}/apply-speedtest-boost`, {
        method: "POST",
      });
    },
    onSuccess: (result) => {
      setActionSuccess(`🚀 ${result.message}`);
      setTimeout(() => setActionSuccess(null), 5000);
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to apply 100M speedtest boost"),
    onSettled: () => setBoostingId(null),
  });

  const enforceStrictTimeout = useMutation({
    mutationFn: (routerId: string) => {
      setEnforcingId(routerId);
      return apiFetch<{ success: boolean; cookiesRemoved: number; message: string }>(
        `/api/v1/routers/${routerId}/enforce-strict-timeout`,
        { method: "POST" }
      );
    },
    onSuccess: (result) => {
      setActionSuccess(`⏱️ ${result.message}`);
      setTimeout(() => setActionSuccess(null), 5000);
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to enforce strict timeout"),
    onSettled: () => setEnforcingId(null),
  });

  const kickAllSessions = useMutation({
    mutationFn: (routerId: string) => {
      setKickingId(routerId);
      return apiFetch<{ removed: number }>(`/api/v1/routers/${routerId}/kick-all-sessions`, { method: "POST" });
    },
    onSuccess: (result) => {
      alert(`Disconnected ${result.removed} session${result.removed === 1 ? "" : "s"}.`);
      queryClient.invalidateQueries({ queryKey: ["router-sessions"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to disconnect sessions"),
    onSettled: () => setKickingId(null),
  });

  const {
    data: liveSessions,
    isFetching: sessionsLoading,
    error: sessionsError,
  } = useQuery({
    queryKey: ["router-sessions", openSessionsFor],
    queryFn: () => apiFetch<DeviceSession[]>(`/api/v1/routers/${openSessionsFor}/sessions`),
    enabled: openSessionsFor !== null,
    refetchInterval: openSessionsFor !== null ? 10_000 : false,
    retry: false,
  });

  const generateScript = useMutation({
    mutationFn: async (routerId: string) => {
      const radiusHost = window.prompt(
        "RADIUS server host — the IP or hostname this router should send Access-Requests to (your FreeRADIUS server):"
      );
      if (!radiusHost) return null;
      const script = await apiFetch<{ mikrotikScript: string; freeradiusClientSnippet: string }>(
        `/api/v1/routers/${routerId}/setup-script?radiusHost=${encodeURIComponent(radiusHost)}`
      );
      return { routerId, script };
    },
    onSuccess: (result) => {
      if (!result) return;
      setScripts((prev) => ({ ...prev, [result.routerId]: result.script }));
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to generate setup script"),
  });

  const startVpn = useMutation({
    mutationFn: (routerId: string) =>
      apiFetch<{ script: string }>(`/api/v1/routers/${routerId}/vpn-start`, { method: "POST" }),
    onSuccess: (result, routerId) => {
      setVpnScripts((prev) => ({ ...prev, [routerId]: result.script }));
      queryClient.invalidateQueries({ queryKey: ["routers"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to start VPN setup"),
  });

  const getVpnCompleteScript = useMutation({
    mutationFn: (routerId: string) =>
      apiFetch<{ script: string }>(`/api/v1/routers/${routerId}/vpn-complete-script`),
    onSuccess: (result, routerId) => setVpnScripts((prev) => ({ ...prev, [routerId]: result.script })),
    onError: (err) =>
      setError(err instanceof ApiRequestError ? err.message : "Failed to generate the VPN completion script"),
  });

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            MikroTik Routers
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            RouterOS API connection, RADIUS authentication, and live telemetry polling.
          </p>
        </div>
        <Link href="/routers/new">
          <Button>+ Link MikroTik</Button>
        </Link>
      </div>

      {error && <ErrorText>{error}</ErrorText>}
      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center justify-between">
          <span>{actionSuccess}</span>
          <button onClick={() => setActionSuccess(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {isLoading && (
        <div className="py-8 text-center text-sm text-slate-500">
          Loading router telemetry...
        </div>
      )}

      <div className="space-y-4">
        {routers?.map((router) => {
          const badgeVariant =
            router.status === "ONLINE"
              ? "success"
              : router.status === "WARNING"
              ? "warning"
              : router.status === "DOWN"
              ? "danger"
              : "neutral";

          return (
            <Card key={router.id} className="transition-all hover:border-slate-300 dark:hover:border-obsidian-700">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 dark:bg-obsidian-800 border border-slate-200/60 dark:border-obsidian-700 text-slate-700 dark:text-slate-300">
                      <IconRouter size={18} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        {router.name}
                        <span className="text-xs font-normal text-slate-500">
                          ({router.vendor})
                        </span>
                      </h3>
                      <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                        {router.host ? (
                          <>
                            {router.host}:{router.apiPort} {router.useTls ? "(TLS Encrypted)" : ""}
                          </>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400">Waiting for router to check in...</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {router.lastError && (
                    <p className="mt-2 text-xs font-mono text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 p-2 rounded border border-rose-200 dark:border-rose-900/60">
                      {router.lastError}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  {/* Status & Stats */}
                  <div className="text-left md:text-right text-xs">
                    <div className="flex items-center md:justify-end gap-2 mb-1">
                      <StatusDot status={router.status} pulse={router.status === "ONLINE"} />
                      <Badge variant={badgeVariant}>{router.status}</Badge>
                    </div>
                    <p className="font-mono text-slate-600 dark:text-slate-400">
                      {router.cpuLoadPercent !== null ? `CPU ${router.cpuLoadPercent}% · ` : ""}
                      {formatUptime(router.uptimeSeconds)}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {formatLastChecked(router.updatedAt)}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* 1-Click Speedtest 100M Boost Button */}
                    <Button
                      variant="secondary"
                      className="px-3 py-1.5 text-xs bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 font-bold"
                      onClick={() => applySpeedtestBoost.mutate(router.id)}
                      disabled={boostingId === router.id || !router.host}
                    >
                      {boostingId === router.id ? "Boosting..." : "⚡ 100M Boost"}
                    </Button>

                    {/* 1-Click Strict 1-Hour Timeout & Clear Cookies Button */}
                    <Button
                      variant="secondary"
                      className="px-3 py-1.5 text-xs bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30 font-bold"
                      onClick={() => enforceStrictTimeout.mutate(router.id)}
                      disabled={enforcingId === router.id || !router.host}
                    >
                      {enforcingId === router.id ? "Enforcing..." : "⏱️ Strict 1hr Timeout"}
                    </Button>

                    <Button
                      variant="secondary"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => testConnection.mutate(router.id)}
                      disabled={testingId === router.id || !router.host}
                    >
                      {testingId === router.id ? "Pinging..." : "Test Connection"}
                    </Button>
                    <Button
                      variant="secondary"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => generateScript.mutate(router.id)}
                      disabled={generateScript.isPending || !router.host}
                    >
                      RADIUS Script
                    </Button>
                    <Button
                      variant="secondary"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => setOpenSessionsFor(openSessionsFor === router.id ? null : router.id)}
                      disabled={!router.host}
                    >
                      {openSessionsFor === router.id ? "Hide Sessions" : "Live Sessions"}
                    </Button>
                    <Button
                      variant="danger"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => {
                        if (confirm(`Disconnect every active session on "${router.name}"? This can't be undone.`)) {
                          kickAllSessions.mutate(router.id);
                        }
                      }}
                      disabled={kickingId === router.id || !router.host}
                    >
                      {kickingId === router.id ? "Kicking..." : "Kick All"}
                    </Button>
                    <Button
                      variant="secondary"
                      className="px-3 py-1.5 text-xs"
                      onClick={() =>
                        router.vpnIp ? getVpnCompleteScript.mutate(router.id) : startVpn.mutate(router.id)
                      }
                      disabled={startVpn.isPending || getVpnCompleteScript.isPending || !router.host}
                    >
                      {router.vpnIp && router.status === "ONLINE"
                        ? "Remote Access ✓"
                        : router.vpnIp
                        ? "Finish Remote Access"
                        : "Enable Remote Access"}
                    </Button>
                    <Button
                      variant="danger"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => {
                        if (confirm(`Remove router "${router.name}"?`)) deleteRouter.mutate(router.id);
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              </div>

              {/* Generated Scripts Section */}
              {scripts[router.id] && (
                <div className="mt-5 space-y-4 border-t border-slate-200 pt-4 dark:border-obsidian-800">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <IconTerminal size={14} className="text-brand-600" />
                        Paste into MikroTik WinBox &quot;New Terminal&quot; or SSH:
                      </p>
                      <Button
                        variant="secondary"
                        className="px-2.5 py-1 text-xs gap-1"
                        onClick={() => handleCopy(scripts[router.id]!.mikrotikScript, `mk-${router.id}`)}
                      >
                        {copiedId === `mk-${router.id}` ? <IconCheck size={12} /> : <IconCopy size={12} />}
                        <span>{copiedId === `mk-${router.id}` ? "Copied!" : "Copy RouterOS Script"}</span>
                      </Button>
                    </div>
                    <pre className="max-h-56 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs text-emerald-400 border border-slate-800">
                      {scripts[router.id]!.mikrotikScript}
                    </pre>
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Add to <code className="text-brand-600 font-mono">raddb/clients.conf</code> on FreeRADIUS server:
                      </p>
                      <Button
                        variant="secondary"
                        className="px-2.5 py-1 text-xs gap-1"
                        onClick={() => handleCopy(scripts[router.id]!.freeradiusClientSnippet, `rad-${router.id}`)}
                      >
                        {copiedId === `rad-${router.id}` ? <IconCheck size={12} /> : <IconCopy size={12} />}
                        <span>{copiedId === `rad-${router.id}` ? "Copied!" : "Copy RADIUS snippet"}</span>
                      </Button>
                    </div>
                    <pre className="overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs text-brand-300 border border-slate-800">
                      {scripts[router.id]!.freeradiusClientSnippet}
                    </pre>
                  </div>
                </div>
              )}

              {/* VPN (Remote Access) Script Section */}
              {vpnScripts[router.id] && (
                <div className="mt-5 border-t border-slate-200 pt-4 dark:border-obsidian-800">
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <IconTerminal size={14} className="text-brand-600" />
                      Paste into MikroTik WinBox &quot;New Terminal&quot; or SSH:
                    </p>
                    <Button
                      variant="secondary"
                      className="px-2.5 py-1 text-xs gap-1"
                      onClick={() => handleCopy(vpnScripts[router.id]!, `vpn-${router.id}`)}
                    >
                      {copiedId === `vpn-${router.id}` ? <IconCheck size={12} /> : <IconCopy size={12} />}
                      <span>{copiedId === `vpn-${router.id}` ? "Copied!" : "Copy script"}</span>
                    </Button>
                  </div>
                  <pre className="max-h-56 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs text-emerald-400 border border-slate-800">
                    {vpnScripts[router.id]}
                  </pre>
                  {router.vpnIp && router.status !== "ONLINE" && (
                    <p className="mt-2 text-xs text-slate-500">
                      Once this runs, click <span className="font-medium">Test Connection</span> above to confirm
                      the tunnel is up.
                    </p>
                  )}
                </div>
              )}

              {/* Live Active Sessions Section */}
              {openSessionsFor === router.id && (
                <div className="mt-5 border-t border-slate-200 pt-4 dark:border-obsidian-800">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                      <IconPulse size={14} className="text-emerald-600" />
                      Active PPPoE sessions
                    </p>
                    {sessionsLoading && <span className="text-xs text-slate-400">refreshing...</span>}
                  </div>
                  {sessionsError ? (
                    <p className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 font-mono text-xs text-rose-600 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-400">
                      {sessionsError instanceof ApiRequestError
                        ? sessionsError.message
                        : "Failed to load active sessions."}
                    </p>
                  ) : liveSessions && liveSessions.length > 0 ? (
                    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-obsidian-800">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 dark:bg-obsidian-900 dark:text-slate-400">
                          <tr>
                            <th className="px-3 py-2 font-medium">Username</th>
                            <th className="px-3 py-2 font-medium">IP Address</th>
                            <th className="px-3 py-2 font-medium">Uptime</th>
                            <th className="px-3 py-2 font-medium">Caller ID</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-obsidian-800">
                          {liveSessions.map((session, i) => (
                            <tr key={`${session.username}-${i}`}>
                              <td className="px-3 py-2 font-mono">{session.username}</td>
                              <td className="px-3 py-2 font-mono">{session.address ?? "—"}</td>
                              <td className="px-3 py-2 font-mono">{session.uptime ?? "—"}</td>
                              <td className="px-3 py-2 font-mono">{session.callerId ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      {sessionsLoading ? "Loading sessions..." : "No active sessions right now."}
                    </p>
                  )}
                </div>
              )}
            </Card>
          );
        })}

        {routers && routers.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-obsidian-800">
            <IconRouter size={32} className="mx-auto text-slate-400 mb-2" />
            <h3 className="font-semibold text-slate-700 dark:text-slate-300">No routers linked yet</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">Link your first MikroTik router to start automated PPPoE or Hotspot provisioning.</p>
            <Link href="/routers/new">
              <Button className="text-sm">Link your first MikroTik</Button>
            </Link>
          </div>
        )}
      </div>

      {/* MikroTik Speedtest 100M Boost & Strict 1-Hour Expiry Optimization Hub */}
      <Card className="space-y-5 border-cyan-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
              <span className="text-[11px] font-black uppercase tracking-wider text-cyan-400">
                MikroTik Performance &amp; Session Optimization
              </span>
            </div>
            <h2 className="text-lg font-bold text-white">
              ⚡ Speedtest 100 Mbps Boost &amp; Strict 1-Hour Expiry Hub
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              1-click scripts to boost Fast.com / Ookla Speedtests to 100 Mbps and enforce strict 1-hour session logouts.
            </p>
          </div>
        </div>

        {/* Feature 1: 100 Mbps Speedtest Booster Script */}
        <div className="space-y-3 rounded-2xl bg-slate-950/80 p-4 border border-cyan-500/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🚀</span>
              <div>
                <h3 className="text-sm font-bold text-white">100 Mbps Speedtest Booster (Ookla &amp; Fast.com Bypass)</h3>
                <p className="text-[11px] text-slate-400">
                  Prioritizes traffic to Speedtest.net &amp; Fast.com with a dedicated 100M Queue Tree, bypassing voucher throttles during tests.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {routers && routers.filter((r) => r.status === "ONLINE").length > 0 && (
                <Button
                  className="text-xs py-1.5 px-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black shadow-lg"
                  onClick={() => {
                    const online = routers.filter((r) => r.status === "ONLINE");
                    online.forEach((r) => applySpeedtestBoost.mutate(r.id));
                  }}
                  disabled={boostingId !== null}
                >
                  {boostingId !== null ? "Applying..." : "⚡ 1-Click Auto Apply"}
                </Button>
              )}
              <Button
                variant="secondary"
                className="text-xs py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold border-slate-700"
                onClick={() =>
                  handleCopy(
                    `/ip firewall address-list\nadd list=SPEEDTEST_SERVERS address=speedtest.net comment="Ookla Speedtest"\nadd list=SPEEDTEST_SERVERS address=fast.com comment="Fast.com Speedtest"\nadd list=SPEEDTEST_SERVERS address=speedtestcustom.com comment="Custom Speedtest"\nadd list=SPEEDTEST_SERVERS address=ookla.com comment="Ookla"\n\n/ip firewall mangle\nadd chain=prerouting dst-address-list=SPEEDTEST_SERVERS action=mark-connection new-connection-mark=speedtest_conn passthrough=yes comment="Speedtest Boost Connection"\nadd chain=prerouting connection-mark=speedtest_conn action=mark-packet new-packet-mark=speedtest_pkt passthrough=no comment="Speedtest Boost Packet"\n\n/queue tree\nadd name="SPEEDTEST_BOOST_DOWNLOAD" parent=global packet-mark=speedtest_pkt max-limit=100M limit-at=100M priority=1 comment="100M Speedtest Boost"\nadd name="SPEEDTEST_BOOST_UPLOAD" parent=global packet-mark=speedtest_pkt max-limit=100M limit-at=100M priority=1 comment="100M Speedtest Boost"`,
                    "speedtest-script"
                  )
                }
              >
                {copiedId === "speedtest-script" ? "✓ Copied Script" : "Copy Script"}
              </Button>
            </div>
          </div>

          <pre className="overflow-x-auto rounded-xl bg-slate-900 p-3 font-mono text-[11px] text-cyan-300 border border-slate-800 leading-relaxed select-all">
{`/ip firewall address-list
add list=SPEEDTEST_SERVERS address=speedtest.net comment="Ookla Speedtest"
add list=SPEEDTEST_SERVERS address=fast.com comment="Fast.com Speedtest"
add list=SPEEDTEST_SERVERS address=speedtestcustom.com comment="Custom Speedtest"
add list=SPEEDTEST_SERVERS address=ookla.com comment="Ookla"

/ip firewall mangle
add chain=prerouting dst-address-list=SPEEDTEST_SERVERS action=mark-connection new-connection-mark=speedtest_conn passthrough=yes comment="Speedtest Boost Connection"
add chain=prerouting connection-mark=speedtest_conn action=mark-packet new-packet-mark=speedtest_pkt passthrough=no comment="Speedtest Boost Packet"

/queue tree
add name="SPEEDTEST_BOOST_DOWNLOAD" parent=global packet-mark=speedtest_pkt max-limit=100M limit-at=100M priority=1 comment="100M Speedtest Boost"
add name="SPEEDTEST_BOOST_UPLOAD" parent=global packet-mark=speedtest_pkt max-limit=100M limit-at=100M priority=1 comment="100M Speedtest Boost"`}
          </pre>
        </div>

        {/* Feature 2: Strict 1-Hour Timeout & Cookie Cleaner */}
        <div className="space-y-3 rounded-2xl bg-slate-950/80 p-4 border border-purple-500/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">⏱️</span>
              <div>
                <h3 className="text-sm font-bold text-white">Strict 1-Hour Timeout &amp; Hotspot Cookie Removal</h3>
                <p className="text-[11px] text-slate-400">
                  Disables silent browser cookie re-authentication and sets 1-minute RADIUS interim accounting to kick expired vouchers on the dot.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {routers && routers.filter((r) => r.status === "ONLINE").length > 0 && (
                <Button
                  className="text-xs py-1.5 px-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black shadow-lg"
                  onClick={() => {
                    const online = routers.filter((r) => r.status === "ONLINE");
                    online.forEach((r) => enforceStrictTimeout.mutate(r.id));
                  }}
                  disabled={enforcingId !== null}
                >
                  {enforcingId !== null ? "Enforcing..." : "⏱️ 1-Click Enforce"}
                </Button>
              )}
              <Button
                variant="secondary"
                className="text-xs py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold border-slate-700"
                onClick={() =>
                  handleCopy(
                    `/ip hotspot profile set [find] login-by=http-chap,http-pap\n/ip hotspot cookie remove [find]\n/radius set [find service=hotspot] interim-update=1m`,
                    "cookie-script"
                  )
                }
              >
                {copiedId === "cookie-script" ? "✓ Copied Script" : "Copy Script"}
              </Button>
            </div>
          </div>

          <pre className="overflow-x-auto rounded-xl bg-slate-900 p-3 font-mono text-[11px] text-purple-300 border border-slate-800 leading-relaxed select-all">
{`# 1. Disable cookie login so expired vouchers cannot silently re-authenticate
/ip hotspot profile set [find] login-by=http-chap,http-pap

# 2. Clear existing cached cookies from router memory
/ip hotspot cookie remove [find]

# 3. Set RADIUS interim accounting updates to 1 minute
/radius set [find service=hotspot] interim-update=1m`}
          </pre>
        </div>
      </Card>
    </div>
  );
}
