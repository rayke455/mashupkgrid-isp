"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Button, Card, ErrorText, Badge, StatusDot } from "@/components/ui";
import { IconRouter, IconCopy, IconCheck, IconPulse } from "@/components/icons";

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

interface WinboxAccessData {
  routerId: string;
  routerName: string;
  host: string | null;
  vpnIp: string | null;
  winboxPort: number;
  status: string;
  script: string;
  connectionTargets: {
    direct: string | null;
    vpn: string | null;
    cloudHost: string | null;
  };
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
  const [openSessionsFor, setOpenSessionsFor] = useState<string | null>(null);
  const [openAccessPointsFor, setOpenAccessPointsFor] = useState<string | null>(null);
  const [winboxModalFor, setWinboxModalFor] = useState<RouterRow | null>(null);
  const [powerToolsModalFor, setPowerToolsModalFor] = useState<RouterRow | null>(null);
  const [toolLoading, setToolLoading] = useState<string | null>(null);

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

  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

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

  const { data: winboxAccessData } = useQuery({
    queryKey: ["router-winbox-access", winboxModalFor?.id],
    queryFn: () => apiFetch<WinboxAccessData>(`/api/v1/routers/${winboxModalFor?.id}/winbox-access`),
    enabled: winboxModalFor !== null,
  });

  const { data: firmwareData, isFetching: firmwareLoading, refetch: refetchFirmware } = useQuery({
    queryKey: ["router-firmware", powerToolsModalFor?.id],
    queryFn: () =>
      apiFetch<{ currentVersion: string; latestVersion: string; status: string; upgradeAvailable: boolean }>(
        `/api/v1/routers/${powerToolsModalFor?.id}/firmware`
      ),
    enabled: powerToolsModalFor !== null && Boolean(powerToolsModalFor.host),
  });

  const triggerPowerTool = async (routerId: string, endpoint: string, body?: unknown, toolName?: string) => {
    setToolLoading(toolName || endpoint);
    setError(null);
    try {
      const res = await apiFetch<{ message?: string }>(`/api/v1/routers/${routerId}/${endpoint}`, {
        method: "POST",
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      setActionSuccess(`⚡ ${res?.message || "Optimization applied successfully!"}`);
      setTimeout(() => setActionSuccess(null), 6000);
      queryClient.invalidateQueries({ queryKey: ["routers"] });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to execute tool");
    } finally {
      setToolLoading(null);
    }
  };

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
                      className="px-3 py-1.5 text-xs bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 font-bold flex items-center gap-1.5 shadow-xs"
                      onClick={() => setWinboxModalFor(router)}
                      title="Access MikroTik with WinBox remotely"
                    >
                      <span>🖥️</span>
                      <span>WinBox Remote</span>
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
                      variant="secondary"
                      className="px-3 py-1.5 text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-bold flex items-center gap-1.5 shadow-xs"
                      onClick={() => setPowerToolsModalFor(router)}
                      title="Optimization, Fair-Share PCQ Shaper, Safe DNS, and Firmware tools"
                      disabled={!router.host}
                    >
                      <span>⚡</span>
                      <span>Power Tools</span>
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



      {/* Remote WinBox Modal */}
      {winboxModalFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-2xl rounded-2xl border border-indigo-500/30 bg-slate-950 p-6 shadow-2xl text-white overflow-hidden max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 text-xl">
                  🖥️
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    WinBox Remote Access
                    <Badge variant={winboxModalFor.status === "ONLINE" ? "success" : "neutral"}>
                      {winboxModalFor.status}
                    </Badge>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Connect directly to <strong className="text-indigo-300">{winboxModalFor.name}</strong> from anywhere using WinBox.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setWinboxModalFor(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="overflow-y-auto space-y-5 py-4 pr-1">
              {/* Primary Connect Box */}
              <div className="rounded-xl bg-gradient-to-br from-indigo-950/60 to-slate-900 border border-indigo-500/40 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-400 font-bold">
                      Target Connect Address
                    </span>
                    <p className="font-mono text-base font-bold text-white tracking-wide mt-0.5">
                      {winboxModalFor.host ? `${winboxModalFor.host}:8291` : winboxModalFor.vpnIp ? `${winboxModalFor.vpnIp}:8291` : "Awaiting Router Check-In"}
                    </p>
                    {winboxModalFor.vpnIp && (
                      <p className="text-[11px] font-mono text-emerald-400 mt-1 flex items-center gap-1">
                        <span>🔒 VPN Tunnel IP:</span>
                        <strong>{winboxModalFor.vpnIp}:8291</strong>
                        <span className="text-[10px] text-slate-400 font-sans">(CGNAT Bypass)</span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {winboxModalFor.host && (
                      <>
                        <Button
                          variant="secondary"
                          className="text-xs py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold border-indigo-500 flex items-center gap-1.5"
                          onClick={() => handleCopy(`${winboxModalFor.host}:8291`, `winbox-addr-${winboxModalFor.id}`)}
                        >
                          {copiedId === `winbox-addr-${winboxModalFor.id}` ? <IconCheck size={14} /> : <IconCopy size={14} />}
                          <span>{copiedId === `winbox-addr-${winboxModalFor.id}` ? "Copied!" : "Copy Address"}</span>
                        </Button>
                        <a
                          href={`winbox://${winboxModalFor.host}:8291`}
                          className="inline-flex items-center gap-1 text-xs py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 font-bold border border-slate-700 transition-colors"
                          title="Open WinBox protocol handler"
                        >
                          <span>Launch</span>
                          <span>↗</span>
                        </a>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* 3 Remote Access Methods */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Choose Connection Mode
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Mode 1: Public WAN IP */}
                  <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-3 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between text-xs font-bold text-indigo-300 mb-1">
                        <span>1. Public WAN IP</span>
                        <span className="text-[10px] text-slate-500">Direct</span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-snug">
                        Use <span className="font-mono text-slate-300">{winboxModalFor.host || "your WAN IP"}:8291</span>. Requires a public IP or port-forwarding from upstream fiber/ISP.
                      </p>
                    </div>
                  </div>

                  {/* Mode 2: MikroTik Cloud DDNS */}
                  <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-3 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between text-xs font-bold text-cyan-300 mb-1">
                        <span>2. Cloud DDNS</span>
                        <span className="text-[10px] text-slate-500">Back-To-Home</span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-snug">
                        Connect using MikroTik&apos;s free dynamic domain (<span className="font-mono text-[10px] text-slate-300">*.sn.mynetname.net</span>) which auto-updates when WAN IP changes.
                      </p>
                    </div>
                  </div>

                  {/* Mode 3: Private WireGuard Tunnel */}
                  <div className="rounded-xl bg-slate-900/90 border border-emerald-500/30 p-3 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between text-xs font-bold text-emerald-400 mb-1">
                        <span>3. WireGuard VPN</span>
                        <span className="text-[10px] text-emerald-500 font-semibold">Bypass CGNAT</span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-snug">
                        For routers on Safaricom / Airtel / Faiba SIMs behind carrier NAT where inbound ports are blocked.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step: 1-Click Terminal Activation Script */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">⚡</span>
                    <h4 className="text-xs font-bold text-white">
                      MikroTik RouterOS WinBox Enable Script
                    </h4>
                  </div>
                  <Button
                    variant="secondary"
                    className="text-xs py-1 px-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold gap-1 border-none shadow-xs"
                    onClick={() => {
                      const script = winboxAccessData?.script || `/ip service set winbox disabled=no port=8291\n/ip firewall filter remove [find comment="MASHUPKGRID WINBOX REMOTE"]\n/ip firewall filter add chain=input protocol=tcp dst-port=8291 action=accept place-before=0 comment="MASHUPKGRID WINBOX REMOTE"\n:do {/ip firewall filter move [find comment="MASHUPKGRID WINBOX REMOTE"] destination=0} on-error={}\n/ip cloud set ddns-enabled=yes update-time=yes\n:delay 2s\n:put "Remote WinBox & Cloud DDNS Enabled Successfully!"`;
                      handleCopy(script, `winbox-full-script-${winboxModalFor.id}`);
                    }}
                  >
                    {copiedId === `winbox-full-script-${winboxModalFor.id}` ? <IconCheck size={12} /> : <IconCopy size={12} />}
                    <span>{copiedId === `winbox-full-script-${winboxModalFor.id}` ? "Copied to Clipboard!" : "Copy Terminal Script"}</span>
                  </Button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Open your MikroTik Terminal (or WebFig) and paste this script to unblock WinBox port 8291 in firewall and activate MikroTik Cloud DDNS:
                </p>
                <pre className="max-h-36 overflow-x-auto rounded-xl bg-slate-900/90 p-3 font-mono text-[11px] text-indigo-300 border border-slate-800 select-all leading-relaxed whitespace-pre-wrap">
                  {winboxAccessData?.script || `# Enabling WinBox on port 8291 and MikroTik Cloud DDNS\n/ip service set winbox disabled=no port=8291\n/ip firewall filter remove [find comment="MASHUPKGRID WINBOX REMOTE"]\n/ip firewall filter add chain=input protocol=tcp dst-port=8291 action=accept place-before=0 comment="MASHUPKGRID WINBOX REMOTE"\n:do {/ip firewall filter move [find comment="MASHUPKGRID WINBOX REMOTE"] destination=0} on-error={}\n/ip cloud set ddns-enabled=yes update-time=yes`}
                </pre>
              </div>

              {/* Download WinBox Section */}
              <div className="rounded-xl bg-slate-900/60 border border-slate-800/80 p-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h5 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <span>📥</span>
                      <span>Download Official MikroTik WinBox Client</span>
                    </h5>
                    <p className="text-[11px] text-slate-400">
                      Standalone portable utility from MikroTik. No installation required.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href="https://mt.lv/winbox64"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold border border-slate-700 transition-colors"
                    >
                      Windows 64-bit ↗
                    </a>
                    <a
                      href="https://mt.lv/winbox"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold border border-slate-700 transition-colors"
                    >
                      Windows 32-bit ↗
                    </a>
                    <a
                      href="https://mikrotik.com/download"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 font-semibold border border-slate-700 transition-colors"
                    >
                      All Downloads ↗
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Default WinBox port is <code className="text-indigo-300 font-mono">8291</code>
              </span>
              <Button
                variant="secondary"
                className="text-xs px-4 py-1.5"
                onClick={() => setWinboxModalFor(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ISP Power Tools & Optimization Modal */}
      {powerToolsModalFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={() => setPowerToolsModalFor(null)}
        >
          <div
            className="w-full max-w-2xl bg-slate-900 border border-amber-500/40 rounded-2xl p-6 text-slate-100 shadow-2xl relative space-y-5 animate-in fade-in zoom-in-95 duration-150 my-8"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xl">⚡</span>
                  <h3 className="text-lg font-bold text-white tracking-tight">
                    ISP Power Tools & Optimization
                  </h3>
                  <Badge variant={powerToolsModalFor.status === "ONLINE" ? "success" : "neutral"}>
                    {powerToolsModalFor.status}
                  </Badge>
                </div>
                <p className="text-xs text-slate-400">
                  Instant network shaping, anti-VPN enforcement, and firmware tools for{" "}
                  <strong className="text-amber-300">{powerToolsModalFor.name}</strong>.
                </p>
              </div>
              <button
                onClick={() => setPowerToolsModalFor(null)}
                className="text-slate-400 hover:text-white rounded-lg p-1 hover:bg-slate-800 transition-colors text-lg"
              >
                ✕
              </button>
            </div>

            {/* Grid of Power Tools */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* Tool 1: Fair-Share PCQ Bandwidth Shaper */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 hover:border-amber-500/30 transition-all flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-base">⚖️</span>
                    <h4 className="text-xs font-bold text-white">Dynamic Fair-Share (PCQ)</h4>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Automatically distributes link bandwidth equally among all active devices so heavy downloaders don&apos;t cause bufferbloat or gaming lag.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  className="w-full text-xs py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold"
                  onClick={() => triggerPowerTool(powerToolsModalFor.id, "enable-pcq-shaper", {}, "PCQ")}
                  disabled={toolLoading === "PCQ" || !powerToolsModalFor.host}
                >
                  {toolLoading === "PCQ" ? "Activating..." : "⚡ Activate Fair-Share Shaper"}
                </Button>
              </div>

              {/* Tool 2: Safe Family DNS Filter */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 hover:border-emerald-500/30 transition-all flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🛡️</span>
                    <h4 className="text-xs font-bold text-white">Safe Family DNS Filter</h4>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Enforces Cloudflare Family Protection (<code className="text-emerald-300 font-mono">1.1.1.3</code>) to block adult content & malware network-wide.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1 text-xs py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold"
                    onClick={() => triggerPowerTool(powerToolsModalFor.id, "apply-family-dns", { familyMode: true }, "FamilyDNS")}
                    disabled={toolLoading === "FamilyDNS" || !powerToolsModalFor.host}
                  >
                    {toolLoading === "FamilyDNS" ? "Applying..." : "Enable Safe DNS"}
                  </Button>
                  <Button
                    variant="secondary"
                    className="text-xs py-1.5 text-slate-400 border border-slate-800 hover:text-white"
                    onClick={() => triggerPowerTool(powerToolsModalFor.id, "apply-family-dns", { familyMode: false }, "StandardDNS")}
                    disabled={toolLoading === "StandardDNS" || !powerToolsModalFor.host}
                    title="Restore Google 8.8.8.8"
                  >
                    Standard
                  </Button>
                </div>
              </div>

              {/* Tool 3: Bulletproof Anti-VPN Shield */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 hover:border-red-500/30 transition-all flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🚫</span>
                    <h4 className="text-xs font-bold text-white">10-Layer Anti-VPN Shield</h4>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Kills Cloudflare WebSocket tunnels (HA Tunnel Plus), HTTP Injector, SlowDNS, UDP tunnels, and persistent bypass leaks.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  className="w-full text-xs py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold"
                  onClick={() => triggerPowerTool(powerToolsModalFor.id, "enable-anti-vpn-shield", {}, "AntiVPN")}
                  disabled={toolLoading === "AntiVPN" || !powerToolsModalFor.host}
                >
                  {toolLoading === "AntiVPN" ? "Deploying..." : "🔒 Deploy Anti-VPN Shield"}
                </Button>
              </div>

              {/* Tool 4: 100M Speedtest Booster */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 hover:border-blue-500/30 transition-all flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🚀</span>
                    <h4 className="text-xs font-bold text-white">Speedtest 100M Boost</h4>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Prioritizes Ookla and Fast.com test packets at 100 Mbps burst to ensure speedtests reflect line speed accurately.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  className="w-full text-xs py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 font-semibold"
                  onClick={() => triggerPowerTool(powerToolsModalFor.id, "apply-speedtest-boost", {}, "Speedtest")}
                  disabled={toolLoading === "Speedtest" || !powerToolsModalFor.host}
                >
                  {toolLoading === "Speedtest" ? "Boosting..." : "🚀 Apply Speedtest Boost"}
                </Button>
              </div>
            </div>

            {/* Firmware Check & Remote Upgrade Section */}
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/80 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">📦</span>
                  <h4 className="text-xs font-bold text-white">RouterOS Firmware Management</h4>
                </div>
                <button
                  onClick={() => refetchFirmware()}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
                >
                  <span>🔄</span>
                  <span>{firmwareLoading ? "Checking..." : "Check Updates"}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-mono">
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-slate-500 block text-[10px] font-sans">Installed Version</span>
                  <span className="text-slate-200 font-bold">{firmwareData?.currentVersion || "Unknown"}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-slate-500 block text-[10px] font-sans">Latest Available</span>
                  <span className="text-emerald-400 font-bold">{firmwareData?.latestVersion || "Up to date"}</span>
                </div>
                <div className="col-span-2 sm:col-span-1 p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between sm:block">
                  <span className="text-slate-500 block text-[10px] font-sans">Status</span>
                  <span className="text-slate-300 font-semibold">{firmwareData?.status || "Ready"}</span>
                </div>
              </div>

              {firmwareData?.upgradeAvailable ? (
                <Button
                  variant="primary"
                  className="w-full text-xs py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold"
                  onClick={() => {
                    if (confirm("The router will download the latest RouterOS package and reboot automatically. Proceed?")) {
                      triggerPowerTool(powerToolsModalFor.id, "upgrade-firmware", {}, "FirmwareUpgrade");
                    }
                  }}
                  disabled={toolLoading === "FirmwareUpgrade" || !powerToolsModalFor.host}
                >
                  {toolLoading === "FirmwareUpgrade" ? "Installing & Rebooting..." : `⚡ Upgrade to v${firmwareData.latestVersion} & Reboot`}
                </Button>
              ) : (
                <p className="text-[11px] text-slate-500 italic text-center pt-1">
                  RouterOS is running the latest stable release.
                </p>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Connected Host: <code className="text-amber-300 font-mono">{powerToolsModalFor.host || powerToolsModalFor.vpnIp || "Awaiting Check-in"}</code>
              </span>
              <Button
                variant="secondary"
                className="text-xs px-4 py-1.5"
                onClick={() => setPowerToolsModalFor(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
