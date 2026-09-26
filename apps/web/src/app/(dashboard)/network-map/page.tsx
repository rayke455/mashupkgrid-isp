"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { EmptyState, Metric, MetricGrid, Notice, PageHeader, Panel, Pill, darkButton } from "@/components/dashboard/surface";

/**
 * Every router on a map, coloured by whether it is reporting. Routers without coordinates are
 * listed beside the map with a way to place them. The map itself is Leaflet with OpenStreetMap
 * tiles, loaded from a CDN only on this page.
 */

interface RouterRow {
  id: string;
  name: string;
  siteName: string | null;
  latitude: number | null;
  longitude: number | null;
  status: "ONLINE" | "WARNING" | "DOWN" | "UNKNOWN";
  lastSeenAt: string | null;
}

const LEAFLET_CSS = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.css";
const LEAFLET_JS = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.js";
const NAIROBI: [number, number] = [-1.2921, 36.8219];

type LeafletMarker = { addTo: (m: LeafletMap) => LeafletMarker; bindPopup: (html: string) => LeafletMarker };
type LeafletMap = { remove: () => void; fitBounds: (b: unknown, o?: unknown) => void; setView: (c: [number, number], z: number) => void };
type LeafletModule = {
  map: (el: HTMLElement) => LeafletMap & { on: (ev: string, fn: (e: { latlng: { lat: number; lng: number } }) => void) => void };
  tileLayer: (url: string, opts: Record<string, unknown>) => { addTo: (m: LeafletMap) => void };
  circleMarker: (c: [number, number], opts: Record<string, unknown>) => LeafletMarker;
  latLngBounds: (pts: [number, number][]) => unknown;
};

function loadLeaflet(): Promise<LeafletModule> {
  const w = window as unknown as { L?: LeafletModule };
  if (w.L) return Promise.resolve(w.L);
  return new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.onload = () => (w.L ? resolve(w.L) : reject(new Error("Leaflet did not load")));
    script.onerror = () => reject(new Error("Could not load the map library"));
    document.head.appendChild(script);
  });
}

const STATUS_COLOR: Record<RouterRow["status"], string> = { ONLINE: "#10b981", WARNING: "#f59e0b", DOWN: "#f43f5e", UNKNOWN: "#64748b" };
const STATUS_LABEL: Record<RouterRow["status"], { tone: "good" | "warn" | "bad" | "neutral"; label: string }> = {
  ONLINE: { tone: "good", label: "Online" },
  WARNING: { tone: "warn", label: "Degraded" },
  DOWN: { tone: "bad", label: "Offline" },
  UNKNOWN: { tone: "neutral", label: "Not checked" },
};

export default function NetworkMapPage() {
  const queryClient = useQueryClient();
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const [placing, setPlacing] = useState<RouterRow | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: routers, isLoading } = useQuery({ queryKey: ["routers"], queryFn: () => apiFetch<RouterRow[]>("/api/v1/routers"), refetchInterval: 30_000 });
  const place = useMutation({
    mutationFn: ({ id, latitude, longitude, siteName }: { id: string; latitude: number | null; longitude: number | null; siteName?: string | null }) =>
      apiFetch(`/api/v1/routers/${id}`, { method: "PATCH", body: JSON.stringify({ latitude, longitude, ...(siteName !== undefined ? { siteName } : {}) }) }),
    onSuccess: () => {
      setPlacing(null);
      queryClient.invalidateQueries({ queryKey: ["routers"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Could not save the location"),
  });

  const placed = (routers ?? []).filter((r) => r.latitude !== null && r.longitude !== null);
  const unplaced = (routers ?? []).filter((r) => r.latitude === null || r.longitude === null);

  useEffect(() => {
    if (!mapEl.current || !routers) return;
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !mapEl.current) return;
        mapRef.current?.remove();
        const map = L.map(mapEl.current);
        mapRef.current = map;
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap contributors" }).addTo(map);
        const points: [number, number][] = [];
        for (const r of placed) {
          const c: [number, number] = [r.latitude!, r.longitude!];
          points.push(c);
          L.circleMarker(c, { radius: 9, color: "#0f172a", weight: 1.5, fillColor: STATUS_COLOR[r.status], fillOpacity: 0.95 })
            .bindPopup(`<strong>${r.name}</strong>${r.siteName ? `<br>${r.siteName}` : ""}<br>${STATUS_LABEL[r.status].label}${r.lastSeenAt ? `<br><small>seen ${new Date(r.lastSeenAt).toLocaleString()}</small>` : ""}`)
            .addTo(map);
        }
        if (points.length > 0) map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 14 });
        else map.setView(NAIROBI, 11);
        map.on("click", (e) => {
          setPlacing((current) => {
            if (current) place.mutate({ id: current.id, latitude: Number(e.latlng.lat.toFixed(6)), longitude: Number(e.latlng.lng.toFixed(6)) });
            return current;
          });
        });
      })
      .catch((err) => setMapError(err instanceof Error ? err.message : "Map unavailable"));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routers]);

  const online = placed.filter((r) => r.status === "ONLINE").length + unplaced.filter((r) => r.status === "ONLINE").length;
  const down = (routers ?? []).filter((r) => r.status === "DOWN").length;

  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHeader title="Network map" description="Where your routers are and which ones are reporting. Click a router in the list, then click the map to place it." />
      {error && <Notice tone="bad">{error}</Notice>}
      {placing && (
        <Notice tone="warn">
          Click the map where <strong>{placing.name}</strong> is installed.{" "}
          <button type="button" className="underline" onClick={() => setPlacing(null)}>
            Cancel
          </button>
        </Notice>
      )}

      <MetricGrid columns={3}>
        <Metric label="Routers" value={routers ? routers.length : "—"} hint={routers ? `${placed.length} placed on the map` : undefined} />
        <Metric label="Online" value={routers ? online : "—"} tone={routers && routers.length > 0 && online === routers.length ? "good" : undefined} />
        <Metric label="Offline" value={routers ? down : "—"} tone={down > 0 ? "bad" : undefined} />
      </MetricGrid>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Panel padded={false}>
          {mapError ? (
            <p className="px-5 py-8 text-sm text-slate-400">{mapError}. The map needs internet access to load its tiles.</p>
          ) : (
            <div ref={mapEl} className="h-[520px] w-full rounded-xl" aria-label="Router map" />
          )}
        </Panel>
        <Panel title="Routers" padded={false}>
          {isLoading ? (
            <p className="px-5 py-6 text-sm text-slate-400">Loading…</p>
          ) : !routers || routers.length === 0 ? (
            <EmptyState title="No routers yet" action={<Link href="/routers/new" className={darkButton("primary")}>Link a router</Link>} />
          ) : (
            <ul className="divide-y divide-obsidian-800">
              {routers.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white">{r.name}</p>
                    <p className="truncate text-xs text-slate-500">{r.siteName ?? "No site name"}{r.latitude !== null ? "" : " · not on the map"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Pill tone={STATUS_LABEL[r.status].tone}>{STATUS_LABEL[r.status].label}</Pill>
                    <button type="button" className={darkButton("ghost", "sm")} onClick={() => setPlacing(r)}>
                      {r.latitude !== null ? "Move" : "Place"}
                    </button>
                    <button
                      type="button"
                      className={darkButton("ghost", "sm")}
                      onClick={() => {
                        const name = window.prompt("Site or branch name for this router:", r.siteName ?? "");
                        if (name !== null) place.mutate({ id: r.id, latitude: r.latitude, longitude: r.longitude, siteName: name.trim() || null });
                      }}
                    >
                      Site
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
