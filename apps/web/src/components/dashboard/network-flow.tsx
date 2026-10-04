"use client";

import { useQueries } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Panel, Pill } from "@/components/dashboard/surface";

interface FlowRouter {
  id: string;
  name: string;
  status: "UNKNOWN" | "ONLINE" | "WARNING" | "DOWN";
  activeUsers?: number | null;
}

interface FlowSession {
  username: string;
  router: { id: string; name: string } | null;
  downloadBytes: number;
  uploadBytes: number;
  state: "ACTIVE" | "STALE" | "ENDED";
}

interface AccessPoint {
  identity: string;
  macAddress: string;
  detectionSource: "NEIGHBOR" | "WIRELESS" | "DHCP";
}

interface NetworkFlowProps {
  routers: FlowRouter[];
  sessions: FlowSession[];
}

interface PlatformTenantPulse {
  id: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED" | "CANCELLED" | "PENDING_APPROVAL";
  usage?: { routersOnline: number; routerCount: number; activeSessionCount?: number };
}

export function PlatformPulse({ tenants }: { tenants: PlatformTenantPulse[] }) {
  const active = tenants.filter((tenant) => tenant.status === "ACTIVE").length;
  const pending = tenants.filter((tenant) => tenant.status === "PENDING_APPROVAL").length;
  const suspended = tenants.filter((tenant) => tenant.status === "SUSPENDED").length;
  const withRouters = tenants.filter((tenant) => (tenant.usage?.routerCount ?? 0) > 0);
  const onlineRouters = withRouters.reduce((sum, tenant) => sum + (tenant.usage?.routersOnline ?? 0), 0);
  const totalRouters = withRouters.reduce((sum, tenant) => sum + (tenant.usage?.routerCount ?? 0), 0);

  return (
    <Panel title="Platform pulse" description="A quick read on tenant activity and fleet health.">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Active tenants", value: active, detail: `${onlineRouters}/${totalRouters || "—"} routers online`, tone: "good" as const },
          { label: "Needs review", value: pending, detail: pending ? "Applications awaiting approval" : "No approval queue", tone: pending ? "warn" as const : "neutral" as const },
          { label: "Suspended", value: suspended, detail: suspended ? "Tenants need attention" : "No suspended tenants", tone: suspended ? "bad" as const : "neutral" as const },
        ].map((item) => (
          <div key={item.label} className="relative overflow-hidden rounded-xl border border-obsidian-800 bg-obsidian-950/60 p-4">
            <div className={`absolute inset-y-0 left-0 w-1 ${item.tone === "good" ? "bg-emerald-400" : item.tone === "warn" ? "bg-amber-400" : item.tone === "bad" ? "bg-rose-400" : "bg-slate-600"}`} />
            <p className="text-sm text-slate-400">{item.label}</p>
            <p className="mt-1 text-2xl font-semibold text-white">{item.value}</p>
            <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-1" aria-label="Tenant fleet activity indicator">
        {tenants.slice(0, 32).map((tenant, index) => (
          <span
            key={tenant.id}
            title={`${tenant.name}: ${tenant.status.replace("_", " ").toLowerCase()}`}
            className={`h-2 flex-1 rounded-full ${tenant.status === "ACTIVE" ? "bg-emerald-400/80 animate-pulse" : tenant.status === "PENDING_APPROVAL" ? "bg-amber-400/80" : tenant.status === "SUSPENDED" ? "bg-rose-400/80" : "bg-slate-700"}`}
            style={tenant.status === "ACTIVE" ? { animationDelay: `${index * 70}ms` } : undefined}
          />
        ))}
        {tenants.length === 0 && <span className="text-sm text-slate-500">Tenant activity will appear here as ISPs join the platform.</span>}
      </div>
    </Panel>
  );
}

function bytes(value: number): string {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

function statusTone(status: FlowRouter["status"]): "good" | "warn" | "bad" | "neutral" {
  return status === "ONLINE" ? "good" : status === "WARNING" ? "warn" : status === "DOWN" ? "bad" : "neutral";
}

export function NetworkFlow({ routers, sessions }: NetworkFlowProps) {
  const visibleRouters = routers.slice(0, 4);
  const accessPointQueries = useQueries({
    queries: visibleRouters.map((router) => ({
      queryKey: ["router-access-points-flow", router.id],
      queryFn: () => apiFetch<AccessPoint[]>(`/api/v1/routers/${router.id}/access-points`),
      enabled: router.status === "ONLINE",
      staleTime: 20_000,
      refetchInterval: 30_000,
    })),
  });

  const totalDown = sessions.reduce((sum, session) => sum + session.downloadBytes, 0);
  const totalUp = sessions.reduce((sum, session) => sum + session.uploadBytes, 0);
  const activeSessions = sessions.filter((session) => session.state === "ACTIVE");
  const totalAps = accessPointQueries.reduce((sum, query) => sum + (query.data?.length ?? 0), 0);
  const measured = totalDown + totalUp > 0;

  return (
    <Panel
      title="Live network flow"
      description="A real-time view of how customers move through your network."
      actions={<Pill tone={activeSessions.length > 0 ? "good" : "neutral"}>{activeSessions.length} active users</Pill>}
    >
      <div className="relative overflow-hidden rounded-xl border border-obsidian-800 bg-obsidian-950/80 p-4 sm:p-6">
        <style>{`@keyframes mkg-flow { to { stroke-dashoffset: -24; } } .mkg-flow-line { stroke-dasharray: 6 18; animation: mkg-flow 1.4s linear infinite; } @media (prefers-reduced-motion: reduce) { .mkg-flow-line { animation: none; } }`}</style>
        <div className="grid grid-cols-[auto_1fr] items-center gap-4 sm:grid-cols-[120px_1fr] sm:gap-6">
          <div className="flex h-20 flex-col items-center justify-center rounded-xl border border-brand-500/30 bg-brand-500/10 text-center">
            <span className="text-2xl" aria-hidden="true">☁</span>
            <span className="mt-1 text-xs font-medium text-brand-200">Internet</span>
          </div>
          <div className="space-y-3">
            {visibleRouters.length === 0 ? (
              <div className="rounded-lg border border-dashed border-obsidian-700 px-4 py-5 text-sm text-slate-400">Link a router to see traffic flow here.</div>
            ) : (
              visibleRouters.map((router, index) => {
                const routerSessions = activeSessions.filter((session) => session.router?.id === router.id);
                const routerAps = accessPointQueries[index]?.data?.length ?? 0;
                const routerBytes = routerSessions.reduce((sum, session) => sum + session.downloadBytes + session.uploadBytes, 0);
                return (
                  <div key={router.id} className="grid grid-cols-[1fr_auto] items-center gap-3">
                    <div className="relative flex items-center gap-3">
                      <svg className="absolute -left-5 top-1/2 h-1 w-5 -translate-y-1/2 overflow-visible sm:-left-6 sm:w-6" viewBox="0 0 24 2" aria-hidden="true">
                        <path d="M0 1H24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-brand-400 ${router.status === "ONLINE" ? "mkg-flow-line" : "opacity-30"}`} />
                      </svg>
                      <div className="min-w-0 flex-1 rounded-lg border border-obsidian-700 bg-obsidian-900 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-white">{router.name}</span>
                          <Pill tone={statusTone(router.status)}>{router.status === "ONLINE" ? "Online" : router.status === "WARNING" ? "Degraded" : router.status === "DOWN" ? "Offline" : "Unknown"}</Pill>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                          <span>{routerSessions.length || router.activeUsers || 0} users</span>
                          <span>{routerAps} detected APs</span>
                          {routerBytes > 0 && <span>{bytes(routerBytes)} measured</span>}
                        </div>
                      </div>
                    </div>
                    <div className="hidden h-8 w-16 items-center justify-center rounded-md border border-obsidian-700 text-xs text-slate-500 sm:flex" title="Access points are discovered; per-AP byte counters are not reported by this router yet.">
                      AP layer
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-obsidian-800 pt-4 text-xs text-slate-400">
          <span><strong className="font-semibold text-white">{bytes(totalDown)}</strong> download</span>
          <span><strong className="font-semibold text-white">{bytes(totalUp)}</strong> upload</span>
          <span><strong className="font-semibold text-white">{totalAps}</strong> access points detected</span>
          {!measured && <span className="text-slate-500">Traffic totals appear after RADIUS accounting reports arrive.</span>}
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">Animated lines represent live/active paths. User traffic is measured from RADIUS accounting; access points are shown from RouterOS discovery and are not given invented traffic totals.</p>
    </Panel>
  );
}
