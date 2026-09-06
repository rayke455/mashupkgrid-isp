"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Button, Card, ErrorText, Badge, StatusDot } from "@/components/ui";
import { IconRouter, IconCopy, IconCheck, IconPulse, IconTerminal } from "@/components/icons";
import { useAuth } from "@/lib/auth-context";

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

interface ConnectedAccessPoint {
  identity: string;
  ipAddress?: string;
  macAddress: string;
  interface: string;
  board?: string;
  platform?: string;
  version?: string;
  uptime?: string;
  signal?: string;
  detectionSource: "NEIGHBOR" | "WIRELESS" | "DHCP";
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

  const { user } = useAuth();
  const tenantSlug = user?.tenantSlug || "mash";

  const [error, setError] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [vpnScripts, setVpnScripts] = useState<Record<string, string>>({});
  const [openSessionsFor, setOpenSessionsFor] = useState<string | null>(null);
  const [openAccessPointsFor, setOpenAccessPointsFor] = useState<string | null>(null);
  const [antiVpnScriptFor, setAntiVpnScriptFor] = useState<string | null>(null);
  const [showVpnScriptFor, setShowVpnScriptFor] = useState<string | null>(null);
  const [showSpeedtestScript, setShowSpeedtestScript] = useState(false);
  const [showTimeoutScript, setShowTimeoutScript] = useState(false);
  const [showAntiVpnScript, setShowAntiVpnScript] = useState(false);

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

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deleteRouter = useMutation({
    mutationFn: (routerId: string) => {
      setDeletingId(routerId);
      return apiFetch(`/api/v1/routers/${routerId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      setActionSuccess("🗑️ Router removed successfully.");
      setTimeout(() => setActionSuccess(null), 5000);
      queryClient.invalidateQueries({ queryKey: ["routers"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to remove router"),
    onSettled: () => setDeletingId(null),
  });

  const updateRouterHost = useMutation({
    mutationFn: ({ routerId, host }: { routerId: string; host: string }) =>
      apiFetch(`/api/v1/routers/${routerId}`, {
        method: "PATCH",
        body: JSON.stringify({ host }),
      }),
    onSuccess: () => {
      setActionSuccess("✏️ Router IP updated successfully.");
      setTimeout(() => setActionSuccess(null), 5000);
      queryClient.invalidateQueries({ queryKey: ["routers"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to update router IP"),
  });

  const [kickingId, setKickingId] = useState<string | null>(null);
  const [boostingId, setBoostingId] = useState<string | null>(null);
  const [enforcingId, setEnforcingId] = useState<string | null>(null);
  const [shieldingId, setShieldingId] = useState<string | null>(null);
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

  const enableAntiVpnShield = useMutation({
    mutationFn: (routerId: string) => {
      setShieldingId(routerId);
      return apiFetch<{ success: boolean; message: string }>(
        `/api/v1/routers/${routerId}/enable-anti-vpn-shield`,
        { method: "POST" }
      );
    },
    onSuccess: (result) => {
      setActionSuccess(`🛡️ ${result.message}`);
      setTimeout(() => setActionSuccess(null), 7000);
    },
    onError: (err, routerId) => {
      const msg = err instanceof ApiRequestError ? err.message : "Failed to apply Anti-VPN Shield";
      setError(msg);
      if (msg.includes("timed out") || msg.includes("hasn't checked in")) {
        setAntiVpnScriptFor(routerId);
      }
    },
    onSettled: () => setShieldingId(null),
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

  const {
    data: connectedAps,
    isFetching: apsLoading,
    error: apsError,
    refetch: refetchAps,
  } = useQuery({
    queryKey: ["router-access-points", openAccessPointsFor],
    queryFn: () => apiFetch<ConnectedAccessPoint[]>(`/api/v1/routers/${openAccessPointsFor}/access-points`),
    enabled: openAccessPointsFor !== null,
    refetchInterval: openAccessPointsFor !== null ? 15_000 : false,
    retry: false,
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
                      <p className="font-mono text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        {router.host ? (
                          <>
                            <span>
                              {router.host}:{router.apiPort} {router.useTls ? "(TLS Encrypted)" : ""}
                            </span>
                            <button
                              onClick={() => {
                                const newHost = window.prompt("Update Router IP / Hostname:", router.host || "");
                                if (newHost && newHost.trim() !== router.host) {
                                  updateRouterHost.mutate({ routerId: router.id, host: newHost.trim() });
                                }
                              }}
                              className="text-[11px] text-brand-600 hover:text-brand-500 underline ml-1 cursor-pointer font-sans"
                              title="Edit IP / Host"
                            >
                              Edit IP
                            </button>
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

                    {/* 1-Click Anti-VPN & Tunnel Shield Button */}
                    <Button
                      variant="secondary"
                      className="px-3 py-1.5 text-xs bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 font-bold"
                      onClick={() => enableAntiVpnShield.mutate(router.id)}
                      disabled={shieldingId === router.id || !router.host}
                      title="Block free VPN tunneling (SlowDNS, HA Tunnel, HTTP Injector, SSH tunnels)"
                    >
                      {shieldingId === router.id ? "Applying Shield..." : "🛡️ Block VPN Tunnels"}
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
                      onClick={() => {
                        setOpenAccessPointsFor(null);
                        setOpenSessionsFor(openSessionsFor === router.id ? null : router.id);
                      }}
                      disabled={!router.host}
                    >
                      {openSessionsFor === router.id ? "Hide Sessions" : "Live Sessions"}
                    </Button>
                    <Button
                      variant="secondary"
                      className={`px-3 py-1.5 text-xs font-semibold gap-1.5 transition-all ${
                        openAccessPointsFor === router.id
                          ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 shadow-xs"
                          : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                      }`}
                      onClick={() => {
                        setOpenSessionsFor(null);
                        setOpenAccessPointsFor(openAccessPointsFor === router.id ? null : router.id);
                      }}
                      disabled={!router.host}
                    >
                      <span>📡</span>
                      <span>{openAccessPointsFor === router.id ? "Hide APs" : "Connected APs"}</span>
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
                      disabled={deletingId === router.id}
                    >
                      {deletingId === router.id ? "Removing..." : "Remove"}
                    </Button>
                  </div>
                </div>
              </div>

              {/* VPN (Remote Access) Script Section - Compact Bar */}
              {vpnScripts[router.id] && (
                <div className="mt-5 border-t border-slate-200 pt-3 dark:border-obsidian-800">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                        <IconTerminal size={14} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">Remote Access Terminal Script</p>
                        <p className="text-[11px] text-slate-400">Ready to paste into MikroTik WinBox &quot;New Terminal&quot;</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        className="px-2.5 py-1 text-xs gap-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                        onClick={() => handleCopy(vpnScripts[router.id]!, `vpn-${router.id}`)}
                      >
                        {copiedId === `vpn-${router.id}` ? <IconCheck size={12} /> : <IconCopy size={12} />}
                        <span>{copiedId === `vpn-${router.id}` ? "Copied Script!" : "Copy Script"}</span>
                      </Button>
                      <Button
                        variant="secondary"
                        className="px-2.5 py-1 text-xs text-slate-300"
                        onClick={() => setShowVpnScriptFor(showVpnScriptFor === router.id ? null : router.id)}
                      >
                        {showVpnScriptFor === router.id ? "Hide Code" : "View Code"}
                      </Button>
                    </div>
                  </div>
                  {showVpnScriptFor === router.id && (
                    <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs text-emerald-400 border border-slate-800 select-all">
                      {vpnScripts[router.id]}
                    </pre>
                  )}
                  {router.vpnIp && router.status !== "ONLINE" && (
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      Once this runs on your router, click <span className="font-semibold text-slate-400">Test Connection</span> above to confirm the tunnel.
                    </p>
                  )}
                </div>
              )}

              {/* Anti-VPN & Tunnel Shield Quick-Run - Compact Bar */}
              {antiVpnScriptFor === router.id && (
                <div className="mt-4 border-t border-slate-200 pt-3 dark:border-obsidian-800">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-rose-950/40 border border-rose-900/60">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🛡️</span>
                      <div>
                        <p className="text-xs font-bold text-rose-300">Router Behind NAT? Run Anti-VPN Command</p>
                        <p className="text-[11px] text-rose-400/80">Blocks SlowDNS, HA Tunnel, &amp; HTTP Injector bypasses</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        className="px-2.5 py-1 text-xs gap-1 bg-rose-600 hover:bg-rose-500 text-white font-bold"
                        onClick={() => {
                          const cmd = `/tool fetch url="https://api.mashuphost.tech/api/v1/hotspot/${tenantSlug}/anti-vpn.rsc" dst-path=anti-vpn.rsc; :delay 2s; /import anti-vpn.rsc;`;
                          handleCopy(cmd, `antivpn-${router.id}`);
                        }}
                      >
                        {copiedId === `antivpn-${router.id}` ? <IconCheck size={12} /> : <IconCopy size={12} />}
                        <span>{copiedId === `antivpn-${router.id}` ? "Copied!" : "Copy 1-Line Command"}</span>
                      </Button>
                      <button
                        onClick={() => setAntiVpnScriptFor(null)}
                        className="text-xs text-slate-400 hover:text-white px-1 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Connected Access Points (APs) Section */}
              {openAccessPointsFor === router.id && (
                <div className="mt-5 border-t border-slate-200 pt-4 dark:border-obsidian-800">
                  <div className="mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">📡</span>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                        Connected Access Points &amp; Antennas
                      </h4>
                      {connectedAps && (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          {connectedAps.length} {connectedAps.length === 1 ? "AP" : "APs"} Discovered
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {apsLoading && (
                        <span className="text-xs text-slate-400 flex items-center gap-1.5 font-sans">
                          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                          Scanning neighbors...
                        </span>
                      )}
                      <Button
                        variant="secondary"
                        className="px-2.5 py-1 text-xs font-medium"
                        onClick={() => refetchAps()}
                        disabled={apsLoading}
                      >
                        {apsLoading ? "Scanning..." : "🔄 Rescan APs"}
                      </Button>
                    </div>
                  </div>

                  {apsError ? (
                    <div className="rounded-xl border border-amber-300/80 bg-amber-50/70 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
                      <div className="flex items-start gap-3">
                        <span className="text-xl">⚠️</span>
                        <div className="flex-1 min-w-0">
                          <h5 className="font-bold text-xs text-amber-900 dark:text-amber-300">
                            Cannot Connect to MikroTik API (Port 8728)
                          </h5>
                          <p className="mt-1 font-mono text-[11px] text-amber-800 dark:text-amber-400 break-words">
                            {apsError instanceof ApiRequestError ? apsError.message : "Failed to load connected access points."}
                          </p>
                          <div className="mt-3 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-white/80 dark:bg-obsidian-900/80 p-3 text-xs text-slate-700 dark:text-slate-300 space-y-2">
                            <p className="font-semibold text-[11px] text-slate-900 dark:text-white">
                              💡 How to fix this in 10 seconds on your MikroTik:
                            </p>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400">
                              By default, MikroTik drops outside connections. Paste this into your <strong>MikroTik Winbox Terminal</strong> to allow the MashupHost cloud server to connect:
                            </p>
                            <div className="relative">
                              <pre className="overflow-x-auto rounded bg-slate-950 p-2.5 font-mono text-[11px] text-emerald-400 border border-slate-800">
{`/ip service enable api
/ip service set api port=8728 address=0.0.0.0/0
/ip firewall filter add chain=input protocol=tcp dst-port=8728 action=accept place-before=0 comment="Allow MashupHost API"`}
                              </pre>
                              <Button
                                variant="secondary"
                                className="mt-2 text-xs py-1 px-2.5 flex items-center gap-1.5 font-medium"
                                onClick={() => {
                                  const cmd = `/ip service set api disabled=no port=8728\n/ip firewall filter add chain=input protocol=tcp dst-port=8728 action=accept place-before=0 comment="Allow MashupHost API"`;
                                  handleCopy(cmd, "fix-api-8728");
                                }}
                              >
                                {copiedId === "fix-api-8728" ? <IconCheck size={12} /> : <IconCopy size={12} />}
                                <span>{copiedId === "fix-api-8728" ? "Copied Command!" : "Copy MikroTik Terminal Command"}</span>
                              </Button>
                            </div>

                            <div className="pt-3 border-t border-amber-200/60 dark:border-amber-900/40 mt-3 space-y-2">
                              <p className="font-semibold text-xs text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                                <span>🚀</span> <strong>Locked Modem / No Port Forwarding? Auto-Sync APs Outbound:</strong>
                              </p>
                              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                                If your home modem doesn&apos;t allow port forwarding, paste this command into Winbox. Your MikroTik will push its connected APs directly to MashupHost via outbound HTTPS every 2 minutes:
                              </p>
                              <div className="relative">
                                <pre className="overflow-x-auto rounded bg-slate-950 p-2.5 font-mono text-[11px] text-emerald-400 border border-slate-800">
{`/system scheduler remove [find name=mkg-ap-sync]
/system scheduler add name=mkg-ap-sync interval=2m on-event=":local d \\"\\"; :foreach i in=[/ip neighbor find] do={ :set d (\\$d . [/ip neighbor get \\$i interface] . \\";\\" . [/ip neighbor get \\$i mac-address] . \\";\\" . [/ip neighbor get \\$i identity] . \\";\\" . [/ip neighbor get \\$i address] . \\";\\" . [/ip neighbor get \\$i board] . \\"|\\") }; :do {/tool fetch url=\\"https://api.mashuphost.tech/api/v1/routers/${router.id}/push-aps\\" http-method=post http-header-field=\\"Content-Type: text/plain\\" http-data=\\$d keep-result=no} on-error={}"
:local d ""; :foreach i in=[/ip neighbor find] do={ :set d ($d . [/ip neighbor get $i interface] . ";" . [/ip neighbor get $i mac-address] . ";" . [/ip neighbor get $i identity] . ";" . [/ip neighbor get $i address] . ";" . [/ip neighbor get $i board] . "|") }; :do {/tool fetch url="https://api.mashuphost.tech/api/v1/routers/${router.id}/push-aps" http-method=post http-header-field="Content-Type: text/plain" http-data=$d keep-result=no} on-error={}`}
                                </pre>
                                <div className="mt-2 flex items-center gap-2">
                                  <Button
                                    variant="primary"
                                    className="text-xs py-1 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5"
                                    onClick={() => {
                                      const cmd = `/system scheduler remove [find name=mkg-ap-sync]\n/system scheduler add name=mkg-ap-sync interval=2m on-event=":local d \\"\\"; :foreach i in=[/ip neighbor find] do={ :set d (\\$d . [/ip neighbor get \\$i interface] . \\";\\" . [/ip neighbor get \\$i mac-address] . \\";\\" . [/ip neighbor get \\$i identity] . \\";\\" . [/ip neighbor get \\$i address] . \\";\\" . [/ip neighbor get \\$i board] . \\"|\\") }; :do {/tool fetch url=\\"https://api.mashuphost.tech/api/v1/routers/${router.id}/push-aps\\" http-method=post http-header-field=\\"Content-Type: text/plain\\" http-data=\\$d keep-result=no} on-error={}"\n:local d ""; :foreach i in=[/ip neighbor find] do={ :set d ($d . [/ip neighbor get $i interface] . ";" . [/ip neighbor get $i mac-address] . ";" . [/ip neighbor get $i identity] . ";" . [/ip neighbor get $i address] . ";" . [/ip neighbor get $i board] . "|") }; :do {/tool fetch url="https://api.mashuphost.tech/api/v1/routers/${router.id}/push-aps" http-method=post http-header-field="Content-Type: text/plain" http-data=$d keep-result=no} on-error={}`;
                                      handleCopy(cmd, `apsync-${router.id}`);
                                      setTimeout(() => refetchAps(), 2500);
                                    }}
                                  >
                                    {copiedId === `apsync-${router.id}` ? <IconCheck size={12} /> : <IconCopy size={12} />}
                                    <span>{copiedId === `apsync-${router.id}` ? "Copied Auto-Sync Script!" : "📋 Copy Auto-Sync AP Script"}</span>
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    className="text-xs py-1 px-2.5 font-medium"
                                    onClick={() => refetchAps()}
                                  >
                                    🔄 Refresh AP List
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : connectedAps && connectedAps.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {connectedAps.map((ap, idx) => {
                        const nameLower = (ap.identity || "").toLowerCase();
                        const boardLower = (ap.board || ap.platform || "").toLowerCase();

                        const isUbnt = nameLower.includes("ubnt") || boardLower.includes("ubnt") || nameLower.includes("nanostation") || nameLower.includes("litebeam") || nameLower.includes("unifi") || nameLower.includes("rocket") || nameLower.includes("airmax");
                        const isTplink = nameLower.includes("tp-link") || nameLower.includes("eap") || boardLower.includes("eap") || boardLower.includes("omada") || nameLower.includes("cpe");
                        const isRuijie = nameLower.includes("ruijie") || nameLower.includes("reyee") || boardLower.includes("rg-") || boardLower.includes("reyee");
                        const isMikrotik = nameLower.includes("mikrotik") || boardLower.includes("routerboard") || boardLower.includes("cap") || boardLower.includes("wap");

                        const vendorBadge = isUbnt
                          ? "Ubiquiti"
                          : isTplink
                          ? "TP-Link Omada"
                          : isRuijie
                          ? "Ruijie Reyee"
                          : isMikrotik
                          ? "MikroTik cAP"
                          : ap.board || ap.platform || "Access Point";

                        return (
                          <div
                            key={`${ap.macAddress}-${idx}`}
                            className="rounded-xl border border-slate-200/80 dark:border-obsidian-700/80 bg-white dark:bg-obsidian-900/90 p-3.5 shadow-xs transition-all hover:border-emerald-500/40 hover:shadow-md"
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm">📶</span>
                                  <h5 className="font-bold text-xs text-slate-900 dark:text-white truncate" title={ap.identity}>
                                    {ap.identity || "Unnamed Access Point"}
                                  </h5>
                                </div>
                                <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 block truncate mt-0.5">
                                  {vendorBadge} {ap.version ? `· ${ap.version}` : ""}
                                </span>
                              </div>
                              <div className="shrink-0 text-right">
                                <span className="inline-flex items-center gap-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 font-mono text-[11px] font-bold text-cyan-700 dark:text-cyan-300">
                                  <span>🔌</span>
                                  <span>{ap.interface || "LAN"}</span>
                                </span>
                              </div>
                            </div>

                            <div className="space-y-1.5 text-[11px] font-mono text-slate-600 dark:text-slate-300 py-2 border-y border-slate-100 dark:border-obsidian-800/80">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400 font-sans">MikroTik Port:</span>
                                <span className="font-bold text-cyan-600 dark:text-cyan-400 flex items-center gap-1">
                                  <span>Port {ap.interface}</span>
                                </span>
                              </div>
                              {ap.ipAddress && (
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400 font-sans">IP Address:</span>
                                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{ap.ipAddress}</span>
                                </div>
                              )}
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400 font-sans">MAC:</span>
                                <span className="text-slate-500 dark:text-slate-400 truncate max-w-[150px]">{ap.macAddress}</span>
                              </div>
                              {ap.uptime && (
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400 font-sans">Uptime:</span>
                                  <span>{ap.uptime}</span>
                                </div>
                              )}
                              {ap.signal && (
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400 font-sans">Signal:</span>
                                  <span className="text-emerald-500 font-bold">{ap.signal}</span>
                                </div>
                              )}
                            </div>

                            <div className="mt-2.5 flex items-center justify-between pt-0.5 text-[11px]">
                              <span className="text-[10px] text-slate-400">
                                {ap.detectionSource === "NEIGHBOR"
                                  ? "MNDP/LLDP Neighbor"
                                  : ap.detectionSource === "WIRELESS"
                                  ? "Wireless Table"
                                  : "DHCP Lease"}
                              </span>
                              {ap.ipAddress ? (
                                <a
                                  href={`http://${ap.ipAddress}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 font-bold text-brand-600 hover:text-brand-500 dark:text-brand-400 hover:underline"
                                >
                                  <span>Open Admin UI</span>
                                  <span>↗</span>
                                </a>
                              ) : (
                                <span className="text-[10px] text-slate-400">Bridged L2</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 dark:border-obsidian-800 p-6 text-center bg-slate-50/50 dark:bg-obsidian-900/40">
                      <span className="text-2xl mb-1 block">📡</span>
                      <h5 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        No Access Points Discovered on this Router
                      </h5>
                      <p className="text-[11px] text-slate-500 max-w-md mx-auto mt-1 mb-3">
                        When APs (Ubiquiti NanoStation/Rocket/UniFi, TP-Link Omada EAP, Ruijie Reyee, MikroTik cAP) are connected to your router&apos;s LAN ports, MikroTik automatically discovers them via MNDP/LLDP discovery and DHCP leases.
                      </p>
                      <Button
                        variant="secondary"
                        className="text-xs px-3 py-1"
                        onClick={() => refetchAps()}
                        disabled={apsLoading}
                      >
                        Rescan Neighbors
                      </Button>
                    </div>
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

      {/* MikroTik Network Performance & Session Optimization Hub */}
      <Card className="space-y-5 border-cyan-500/20 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 text-white shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
              <span className="text-[11px] font-black uppercase tracking-wider text-cyan-400">
                MikroTik Performance &amp; Session Optimization
              </span>
            </div>
            <h2 className="text-lg font-bold text-white">
              ⚡ Network Performance, Speedtest &amp; Security Tools
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              1-click tools to boost speedtests to 100 Mbps, enforce strict voucher timeouts, and block VPN tunnel bypasses.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: 100 Mbps Speedtest Booster */}
          <div className="flex flex-col justify-between rounded-2xl bg-slate-950/80 p-4 border border-cyan-500/20 shadow-xs transition-all hover:border-cyan-500/40">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-2xl">🚀</span>
                <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold text-cyan-400 border border-cyan-500/30 uppercase">
                  Bandwidth Boost
                </span>
              </div>
              <h3 className="text-sm font-bold text-white">100 Mbps Speedtest Booster</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Prioritizes Ookla (Speedtest.net) &amp; Fast.com in a dedicated 100M Queue Tree, bypassing customer voucher caps during speed tests.
              </p>
            </div>

            <div className="pt-4 mt-3 border-t border-slate-800/80 space-y-2">
              <div className="flex items-center gap-2">
                {routers && routers.filter((r) => r.status === "ONLINE").length > 0 && (
                  <Button
                    className="text-xs py-1.5 px-3 flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black shadow-md"
                    onClick={() => {
                      const online = routers.filter((r) => r.status === "ONLINE");
                      online.forEach((r) => applySpeedtestBoost.mutate(r.id));
                    }}
                    disabled={boostingId !== null}
                  >
                    {boostingId !== null ? "Applying..." : "⚡ 1-Click Apply"}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  className="text-xs py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold border-slate-700"
                  onClick={() =>
                    handleCopy(
                      `/ip firewall address-list\nadd list=SPEEDTEST_SERVERS address=speedtest.net comment="Ookla Speedtest"\nadd list=SPEEDTEST_SERVERS address=fast.com comment="Fast.com Speedtest"\nadd list=SPEEDTEST_SERVERS address=speedtestcustom.com comment="Custom Speedtest"\nadd list=SPEEDTEST_SERVERS address=ookla.com comment="Ookla"\n\n/ip firewall mangle\nadd chain=prerouting dst-address-list=SPEEDTEST_SERVERS action=mark-connection new-connection-mark=speedtest_conn passthrough=yes comment="Speedtest Boost Connection"\nadd chain=prerouting connection-mark=speedtest_conn action=mark-packet new-packet-mark=speedtest_pkt passthrough=no comment="Speedtest Boost Packet"\n\n/queue tree\nadd name="SPEEDTEST_BOOST_DOWNLOAD" parent=global packet-mark=speedtest_pkt max-limit=100M limit-at=100M priority=1 comment="100M Speedtest Boost"\nadd name="SPEEDTEST_BOOST_UPLOAD" parent=global packet-mark=speedtest_pkt max-limit=100M limit-at=100M priority=1 comment="100M Speedtest Boost"`,
                      "speedtest-script"
                    )
                  }
                >
                  {copiedId === "speedtest-script" ? "✓ Copied" : "Copy"}
                </Button>
                <button
                  type="button"
                  onClick={() => setShowSpeedtestScript(!showSpeedtestScript)}
                  className="text-[11px] text-slate-400 hover:text-white px-1.5 py-1"
                >
                  {showSpeedtestScript ? "Hide" : "Script"}
                </button>
              </div>

              {showSpeedtestScript && (
                <pre className="mt-2 max-h-48 overflow-x-auto rounded-xl bg-slate-900 p-2.5 font-mono text-[10px] text-cyan-300 border border-slate-800 select-all leading-relaxed">
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
              )}
            </div>
          </div>

          {/* Card 2: Strict 1-Hour Timeout & Cookie Cleaner */}
          <div className="flex flex-col justify-between rounded-2xl bg-slate-950/80 p-4 border border-purple-500/20 shadow-xs transition-all hover:border-purple-500/40">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-2xl">⏱️</span>
                <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold text-purple-400 border border-purple-500/30 uppercase">
                  Session Expiry
                </span>
              </div>
              <h3 className="text-sm font-bold text-white">Strict 1-Hour Timeout &amp; Cookie Flush</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Disables silent browser cookie auto-reconnects, flushes cached hotspot cookies, and sets 1-minute RADIUS interim accounting.
              </p>
            </div>

            <div className="pt-4 mt-3 border-t border-slate-800/80 space-y-2">
              <div className="flex items-center gap-2">
                {routers && routers.filter((r) => r.status === "ONLINE").length > 0 && (
                  <Button
                    className="text-xs py-1.5 px-3 flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black shadow-md"
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
                  className="text-xs py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold border-slate-700"
                  onClick={() =>
                    handleCopy(
                      `/ip hotspot profile set [find] login-by=http-chap,http-pap\n/ip hotspot cookie remove [find]\n/radius set [find service=hotspot] interim-update=1m`,
                      "cookie-script"
                    )
                  }
                >
                  {copiedId === "cookie-script" ? "✓ Copied" : "Copy"}
                </Button>
                <button
                  type="button"
                  onClick={() => setShowTimeoutScript(!showTimeoutScript)}
                  className="text-[11px] text-slate-400 hover:text-white px-1.5 py-1"
                >
                  {showTimeoutScript ? "Hide" : "Script"}
                </button>
              </div>

              {showTimeoutScript && (
                <pre className="mt-2 max-h-48 overflow-x-auto rounded-xl bg-slate-900 p-2.5 font-mono text-[10px] text-purple-300 border border-slate-800 select-all leading-relaxed">
{`# 1. Disable cookie login so expired vouchers cannot silently re-authenticate
/ip hotspot profile set [find] login-by=http-chap,http-pap

# 2. Clear existing cached cookies from router memory
/ip hotspot cookie remove [find]

# 3. Set RADIUS interim accounting updates to 1 minute
/radius set [find service=hotspot] interim-update=1m`}
                </pre>
              )}
            </div>
          </div>

          {/* Card 3: Anti-VPN & Tunnel Shield */}
          <div className="flex flex-col justify-between rounded-2xl bg-slate-950/80 p-4 border border-rose-500/20 shadow-xs transition-all hover:border-rose-500/40">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-2xl">🛡️</span>
                <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-400 border border-rose-500/30 uppercase">
                  Tunnel Defense
                </span>
              </div>
              <h3 className="text-sm font-bold text-white">Anti-VPN &amp; Tunnel Protection</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Blocks free internet tunnel apps (SlowDNS, HA Tunnel, HTTP Injector, and DNS port 53 evasion) on captive portal.
              </p>
            </div>

            <div className="pt-4 mt-3 border-t border-slate-800/80 space-y-2">
              <div className="flex items-center gap-2">
                {routers && routers.filter((r) => r.status === "ONLINE").length > 0 && (
                  <Button
                    className="text-xs py-1.5 px-3 flex-1 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-black shadow-md"
                    onClick={() => {
                      const online = routers.filter((r) => r.status === "ONLINE");
                      online.forEach((r) => enableAntiVpnShield.mutate(r.id));
                    }}
                    disabled={shieldingId !== null}
                  >
                    {shieldingId !== null ? "Applying..." : "🛡️ 1-Click Shield"}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  className="text-xs py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold border-slate-700"
                  onClick={() => {
                    const cmd = `/tool fetch url="https://api.mashuphost.tech/api/v1/hotspot/${tenantSlug}/anti-vpn.rsc" dst-path=anti-vpn.rsc; :delay 2s; /import anti-vpn.rsc;`;
                    handleCopy(cmd, "antivpn-hub");
                  }}
                >
                  {copiedId === "antivpn-hub" ? "✓ Copied" : "Copy"}
                </Button>
                <button
                  type="button"
                  onClick={() => setShowAntiVpnScript(!showAntiVpnScript)}
                  className="text-[11px] text-slate-400 hover:text-white px-1.5 py-1"
                >
                  {showAntiVpnScript ? "Hide" : "Script"}
                </button>
              </div>

              {showAntiVpnScript && (
                <pre className="mt-2 max-h-48 overflow-x-auto rounded-xl bg-slate-900 p-2.5 font-mono text-[10px] text-rose-300 border border-slate-800 select-all leading-relaxed whitespace-pre-wrap">
{`/tool fetch url="https://api.mashuphost.tech/api/v1/hotspot/${tenantSlug}/anti-vpn.rsc" dst-path=anti-vpn.rsc; :delay 2s; /import anti-vpn.rsc;`}
                </pre>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
