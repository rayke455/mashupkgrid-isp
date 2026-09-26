"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { tr } from "@/lib/tr";
import { useAuth } from "@/lib/auth-context";
import { EmptyState, Notice, PageHeader, Panel, Pill, Segmented, TableShell, darkButton, td, th } from "@/components/dashboard/surface";

/**
 * Signup requests from the public "get connected" page. Each shows whether the address is in
 * coverage; staff mark who they called, and turn a lead into a customer with an installation or
 * survey job in one click. The coverage radius and the page's link live here too.
 */

type Status = "NEW" | "CONTACTED" | "BOOKED" | "WON" | "LOST";

interface Lead {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  address: string;
  covered: boolean | null;
  distanceKm: number | null;
  nearestSite: string | null;
  packageName: string | null;
  notes: string | null;
  status: Status;
  lostReason: string | null;
  customerId: string | null;
  jobCard: { id: string; number: string; status: string } | null;
  createdAt: string;
}

interface Preferences {
  coverage: { enabled: boolean; radiusKm: number };
  [k: string]: unknown;
}

const STATUS: Record<Status, { tone: "good" | "warn" | "bad" | "neutral"; label: string }> = {
  NEW: { tone: "warn", label: "New" },
  CONTACTED: { tone: "neutral", label: "Called" },
  BOOKED: { tone: "neutral", label: "Booked" },
  WON: { tone: "good", label: "Customer" },
  LOST: { tone: "bad", label: "Lost" },
};

export default function LeadsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canWrite = user?.permissions.includes("customers.update") ?? false;
  const canConvert = user?.permissions.includes("customers.create") ?? false;
  const canManage = user?.permissions.includes("settings.manage") ?? false;
  const [view, setView] = useState<"OPEN" | "WON" | "LOST">("OPEN");
  const { data } = useQuery({ queryKey: ["leads", view], queryFn: () => apiFetch<{ leads: Lead[]; counts: Partial<Record<Status, number>> }>(`/api/v1/leads?status=${view}`), refetchInterval: 60_000 });
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["leads"] });
  const onError = (err: unknown) => setNotice({ tone: "bad", text: err instanceof ApiRequestError ? err.message : tr("Something went wrong.") });

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; status: Status; lostReason?: string }) => apiFetch(`/api/v1/leads/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: refresh,
    onError,
  });
  const convert = useMutation({
    mutationFn: ({ id, jobType }: { id: string; jobType: "INSTALLATION" | "SURVEY" }) =>
      apiFetch<{ customerId: string; customerNumber: string; jobId: string; jobNumber: string }>(`/api/v1/leads/${id}/convert`, { method: "POST", body: JSON.stringify({ jobType }) }),
    onSuccess: (r) => {
      setNotice({ tone: "good", text: `${tr("Customer")} ${r.customerNumber} ${tr("created with job")} ${r.jobNumber}. ${tr("Assign a technician under Field work.")}` });
      refresh();
    },
    onError,
  });

  const counts = data?.counts ?? {};
  const open = (counts.NEW ?? 0) + (counts.CONTACTED ?? 0) + (counts.BOOKED ?? 0);

  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHeader title={tr("Signup requests")} description={tr("People who asked to be connected on your public signup page. Call them, then turn them into a customer with an installation job.")} />
      <ShareLink slug={user?.tenantSlug ?? null} />
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      <Segmented
        label={tr("Show")}
        value={view}
        onChange={setView}
        options={[
          { value: "OPEN", label: `${tr("Open")} (${open})` },
          { value: "WON", label: `${tr("Became customers")} (${counts.WON ?? 0})` },
          { value: "LOST", label: `${tr("Lost")} (${counts.LOST ?? 0})` },
        ]}
      />

      <Panel padded={false}>
        {!data?.leads.length ? (
          <EmptyState title={view === "OPEN" ? tr("No open requests") : tr("Nothing here")}>{view === "OPEN" ? tr("Share your signup page link to start getting requests.") : null}</EmptyState>
        ) : (
          <TableShell minWidth={960}>
            <thead>
              <tr>
                <th className={th}>{tr("Person")}</th>
                <th className={th}>{tr("Where")}</th>
                <th className={th}>{tr("Plan")}</th>
                <th className={th}>{tr("Status")}</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {data.leads.map((l) => (
                <tr key={l.id}>
                  <td className={td}>
                    <span className="font-medium text-white">{l.fullName}</span>
                    <a href={`tel:${l.phone}`} className="block text-xs text-brand-400 hover:underline">
                      {l.phone}
                    </a>
                    <span className="block text-xs text-slate-500">{new Date(l.createdAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  </td>
                  <td className={td}>
                    <span className="text-slate-200">{l.address}</span>
                    <span className="mt-1 block">
                      {l.covered === true ? (
                        <Pill tone="good">{`${tr("In coverage")}${l.nearestSite ? ` · ${l.nearestSite}` : ""}`}</Pill>
                      ) : l.covered === false ? (
                        <Pill tone="warn">{`${l.distanceKm} km ${tr("from coverage")}`}</Pill>
                      ) : (
                        <Pill tone="neutral">{tr("Location not shared")}</Pill>
                      )}
                    </span>
                    {l.notes && <span className="mt-1 block text-xs text-slate-400">{l.notes}</span>}
                  </td>
                  <td className={td}>{l.packageName ?? "—"}</td>
                  <td className={td}>
                    <Pill tone={STATUS[l.status].tone}>{tr(STATUS[l.status].label)}</Pill>
                    {l.lostReason && <span className="block text-xs text-slate-500">{l.lostReason}</span>}
                    {l.jobCard && (
                      <Link href={`/field/${l.jobCard.id}`} className="block text-xs text-brand-400 hover:underline">
                        {l.jobCard.number}
                      </Link>
                    )}
                  </td>
                  <td className={`${td} text-right`}>
                    {l.status === "WON" && l.customerId ? (
                      <Link href={`/customers/${l.customerId}`} className={darkButton("ghost", "sm")}>
                        {tr("Open customer")}
                      </Link>
                    ) : (
                      l.status !== "LOST" && (
                        <div className="flex flex-wrap justify-end gap-1">
                          {canWrite && l.status === "NEW" && (
                            <button type="button" className={darkButton("ghost", "sm")} disabled={update.isPending} onClick={() => update.mutate({ id: l.id, status: "CONTACTED" })}>
                              {tr("Mark called")}
                            </button>
                          )}
                          {canConvert && (
                            <>
                              <button type="button" className={darkButton("primary", "sm")} disabled={convert.isPending} onClick={() => confirm(`${tr("Make")} ${l.fullName} ${tr("a customer and book the installation?")}`) && convert.mutate({ id: l.id, jobType: "INSTALLATION" })}>
                                {tr("Book installation")}
                              </button>
                              {l.covered !== true && (
                                <button type="button" className={darkButton("secondary", "sm")} disabled={convert.isPending} onClick={() => confirm(`${tr("Make")} ${l.fullName} ${tr("a customer and book a site survey first?")}`) && convert.mutate({ id: l.id, jobType: "SURVEY" })}>
                                  {tr("Book survey")}
                                </button>
                              )}
                            </>
                          )}
                          {canWrite && (
                            <button
                              type="button"
                              className={darkButton("ghost", "sm")}
                              disabled={update.isPending}
                              onClick={() => {
                                const reason = window.prompt(tr("Why was this request lost? (e.g. out of coverage, too expensive, no answer)"), "");
                                if (reason !== null) update.mutate({ id: l.id, status: "LOST", lostReason: reason || undefined });
                              }}
                            >
                              {tr("Lost")}
                            </button>
                          )}
                        </div>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Panel>

      {canManage && <CoverageSettings />}
    </div>
  );
}

function ShareLink({ slug }: { slug: string | null }) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);
  if (!slug || !origin) return null;
  const url = `${origin}/connect/${slug}`;
  return (
    <Panel padded>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-slate-300">
          {tr("Your signup page:")}{" "}
          <a href={url} target="_blank" rel="noreferrer" className="break-all font-mono text-brand-400 hover:underline">
            {url}
          </a>
        </span>
        <button
          type="button"
          className={darkButton("secondary", "sm")}
          onClick={() =>
            navigator.clipboard
              .writeText(url)
              .then(() => setCopied(true))
              .catch(() => window.prompt(tr("Copy this link:"), url))
          }
        >
          {copied ? tr("Copied") : tr("Copy link")}
        </button>
      </div>
    </Panel>
  );
}

function CoverageSettings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["preferences"], queryFn: () => apiFetch<Preferences>("/api/v1/settings/preferences") });
  const [form, setForm] = useState<Preferences["coverage"] | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (data && !form) setForm(data.coverage);
  }, [data, form]);
  const save = useMutation({
    mutationFn: () => apiFetch("/api/v1/settings/preferences", { method: "PUT", body: JSON.stringify({ ...data, coverage: form }) }),
    onSuccess: () => {
      setSaved(true);
      void qc.invalidateQueries({ queryKey: ["preferences"] });
    },
  });
  if (!form) return null;
  return (
    <Panel title={tr("Coverage")} description={tr("A place counts as covered when it is within this distance of one of your routers that has a location. Set router locations on the Routers page.")}>
      <form
        className="flex flex-wrap items-center gap-4 text-sm text-slate-200"
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(false);
          save.mutate();
        }}
      >
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
          {tr("Signup page is on")}
        </label>
        <label className="flex items-center gap-2">
          {tr("Covered within, km")}
          <input type="number" min={0.1} max={50} step={0.1} className="w-20 rounded-lg border border-obsidian-700 bg-obsidian-950 px-2 py-1 text-sm text-slate-100" value={form.radiusKm} onChange={(e) => setForm({ ...form, radiusKm: Number(e.target.value) })} />
        </label>
        <button type="submit" className={darkButton("primary", "sm")} disabled={save.isPending}>
          {save.isPending ? tr("Saving…") : tr("Save")}
        </button>
        {saved && <span className="text-emerald-400">{tr("Saved")}</span>}
      </form>
    </Panel>
  );
}
