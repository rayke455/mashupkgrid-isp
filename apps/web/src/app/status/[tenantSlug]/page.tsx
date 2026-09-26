"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

/**
 * An ISP's public status page: is the network up, and is anything planned. Customers check here
 * before calling. No sign-in, nothing sensitive, refreshes itself every minute.
 */

interface StatusData {
  isp: { name: string; logoUrl: string | null; brandColor: string | null; supportPhone: string | null };
  overall: "OPERATIONAL" | "PARTIAL_OUTAGE" | "MAJOR_OUTAGE" | "UNKNOWN";
  sites: { id: string; name: string; state: "UP" | "DOWN" | "NOT_LINKED"; lastSeenAt: string | null }[];
  maintenance: { message: string | null; endAt: string | null } | null;
  checkedAt: string;
}

const OVERALL: Record<StatusData["overall"], { text: string; tone: string }> = {
  OPERATIONAL: { text: "All systems operational", tone: "border-emerald-200 bg-emerald-50 text-emerald-900" },
  PARTIAL_OUTAGE: { text: "Some sites are down", tone: "border-amber-200 bg-amber-50 text-amber-900" },
  MAJOR_OUTAGE: { text: "Network outage", tone: "border-rose-200 bg-rose-50 text-rose-900" },
  UNKNOWN: { text: "No sites reporting yet", tone: "border-slate-200 bg-slate-50 text-slate-700" },
};

const SITE: Record<StatusData["sites"][number]["state"], { text: string; dot: string }> = {
  UP: { text: "Up", dot: "bg-emerald-500" },
  DOWN: { text: "Down", dot: "bg-rose-500" },
  NOT_LINKED: { text: "Not yet live", dot: "bg-slate-300" },
};

export default function StatusPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { data, error, isLoading } = useQuery({
    queryKey: ["status", tenantSlug],
    queryFn: () => apiFetch<StatusData>(`/api/v1/status/${encodeURIComponent(tenantSlug)}`, { skipAuth: true }),
    refetchInterval: 60_000,
    retry: false,
  });

  return (
    <main className="min-h-screen bg-white text-slate-900 [color-scheme:light]">
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        {error && !data && (
          <div className="rounded-xl border border-slate-200 p-6 text-center">
            <p className="font-semibold">Status page not found</p>
            <p className="mt-1 text-sm text-slate-500">Check the link you were given.</p>
          </div>
        )}
        {data && (
          <>
            <header className="flex items-center gap-3">
              {data.isp.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- tenant logo URL, any host
                <img src={data.isp.logoUrl} alt="" className="h-10 w-10 rounded-lg object-contain" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-base font-semibold text-white">{data.isp.name.charAt(0)}</span>
              )}
              <div>
                <h1 className="text-xl font-semibold">{data.isp.name}</h1>
                <p className="text-sm text-slate-500">Network status</p>
              </div>
            </header>

            <div className={`mt-6 rounded-xl border px-5 py-4 ${OVERALL[data.overall].tone}`}>
              <p className="text-lg font-semibold">{OVERALL[data.overall].text}</p>
              <p className="mt-0.5 text-sm opacity-80">Checked {new Date(data.checkedAt).toLocaleTimeString()}. This page refreshes on its own.</p>
            </div>

            {data.maintenance && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900">
                <p className="font-semibold">Planned maintenance</p>
                <p className="mt-1 text-sm">{data.maintenance.message ?? "Work is in progress on the network."}</p>
                {data.maintenance.endAt && <p className="mt-1 text-sm">Expected to finish {new Date(data.maintenance.endAt).toLocaleString()}.</p>}
              </div>
            )}

            <section className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Sites</h2>
              {data.sites.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">No sites are listed yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {data.sites.map((s) => (
                    <li key={s.id} className="flex items-center justify-between px-4 py-3 text-sm">
                      <span className="font-medium">{s.name}</span>
                      <span className="flex items-center gap-2 text-slate-600">
                        <span className={`h-2.5 w-2.5 rounded-full ${SITE[s.state].dot}`} aria-hidden="true" />
                        {SITE[s.state].text}
                        {s.state === "DOWN" && s.lastSeenAt && <span className="text-xs text-slate-400">since {new Date(s.lastSeenAt).toLocaleString()}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {data.isp.supportPhone && (
              <p className="mt-8 text-sm text-slate-600">
                Still no connection? Call{" "}
                <a href={`tel:${data.isp.supportPhone}`} className="font-medium text-slate-900 underline">
                  {data.isp.supportPhone}
                </a>
                .
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
