"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useBranches } from "@/lib/use-branches";
import { tr } from "@/lib/tr";
import { HintText, Input, Label } from "@/components/ui";
import { EmptyState, Notice, PageHeader, Panel, Pill, Segmented, TableShell, darkButton, td, th } from "@/components/dashboard/surface";

/**
 * Planned work on the network. Customers on the chosen routers or branch get an SMS before it
 * starts and another when it is over; cancelling one that was already announced tells them too.
 */

interface Maintenance {
  id: string;
  title: string;
  message: string | null;
  startsAt: string;
  endsAt: string;
  scope: "ALL" | "ROUTERS" | "BRANCH";
  routerIds: string[];
  branchId: string | null;
  notifyHoursBefore: number;
  status: "SCHEDULED" | "CANCELLED";
  beforeSentAt: string | null;
  afterSentAt: string | null;
  recipientCount: number;
}

interface RouterRow {
  id: string;
  name: string;
}

const selectClass = "w-full rounded-lg border border-obsidian-700 bg-obsidian-950 px-3 py-2 text-sm text-slate-100";

/** A datetime-local value (the browser's own time) for an hour from now, on the hour. */
function localInput(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3_600_000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

function stateOf(m: Maintenance): { label: string; tone: "neutral" | "good" | "warn" | "bad" } {
  const now = Date.now();
  if (m.status === "CANCELLED") return { label: tr("Cancelled"), tone: "bad" };
  if (new Date(m.endsAt).getTime() <= now) return { label: tr("Finished"), tone: "good" };
  if (new Date(m.startsAt).getTime() <= now) return { label: tr("In progress"), tone: "warn" };
  return { label: m.beforeSentAt ? tr("Customers told") : tr("Scheduled"), tone: "neutral" };
}

export default function NetworkMaintenancePage() {
  const { user } = useAuth();
  const canManage = user?.permissions.includes("routers.manage") ?? false;
  const queryClient = useQueryClient();
  const { branches, nameOf } = useBranches();
  const { data: routers } = useQuery({ queryKey: ["routers"], queryFn: () => apiFetch<RouterRow[]>("/api/v1/routers") });
  const { data: rows, isLoading } = useQuery({ queryKey: ["network-maintenance"], queryFn: () => apiFetch<Maintenance[]>("/api/v1/network-maintenance") });

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [startsAt, setStartsAt] = useState(localInput(26));
  const [endsAt, setEndsAt] = useState(localInput(28));
  const [scope, setScope] = useState<"ALL" | "ROUTERS" | "BRANCH">("ROUTERS");
  const [routerIds, setRouterIds] = useState<string[]>([]);
  const [branchId, setBranchId] = useState("");
  const [notifyHoursBefore, setNotifyHoursBefore] = useState(24);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reach, setReach] = useState<number | null>(null);

  const audience = { scope, routerIds: scope === "ROUTERS" ? routerIds : [], branchId: scope === "BRANCH" ? branchId || null : null };
  const audienceKey = JSON.stringify(audience);
  const audienceReady = scope === "ALL" || (scope === "ROUTERS" && routerIds.length > 0) || (scope === "BRANCH" && Boolean(branchId));

  useEffect(() => {
    setReach(null);
    if (!audienceReady) return;
    const t = setTimeout(() => {
      apiFetch<{ customers: number }>("/api/v1/network-maintenance/preview", { method: "POST", body: audienceKey })
        .then((r) => setReach(r.customers))
        .catch(() => setReach(null));
    }, 300);
    return () => clearTimeout(t);
  }, [audienceKey, audienceReady]);

  const create = useMutation({
    mutationFn: () =>
      apiFetch<Maintenance>("/api/v1/network-maintenance", {
        method: "POST",
        body: JSON.stringify({
          ...audience,
          title: title.trim(),
          message: message.trim() || null,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          notifyHoursBefore,
        }),
      }),
    onSuccess: () => {
      setNotice(tr("Scheduled. Customers are texted before it starts and again when it is over."));
      setTitle("");
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["network-maintenance"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : tr("Something went wrong.")),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => apiFetch<Maintenance & { texted: number }>(`/api/v1/network-maintenance/${id}/cancel`, { method: "POST", body: "{}" }),
    onSuccess: (r) => {
      setNotice(r.texted > 0 ? `${tr("Cancelled. Customers told:")} ${r.texted}` : tr("Cancelled."));
      queryClient.invalidateQueries({ queryKey: ["network-maintenance"] });
    },
    onError: (err) => setNotice(err instanceof ApiRequestError ? err.message : tr("Something went wrong.")),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!audienceReady) return setError(scope === "ROUTERS" ? tr("Choose at least one router.") : tr("Choose a branch."));
    create.mutate();
  };

  const routerName = (id: string) => routers?.find((r) => r.id === id)?.name ?? tr("Removed router");
  const who = (m: Maintenance) => (m.scope === "ALL" ? tr("All customers") : m.scope === "BRANCH" ? nameOf(m.branchId) ?? tr("Branch") : m.routerIds.map(routerName).join(", "));

  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHeader
        title={tr("Planned maintenance")}
        description={tr("Tell customers before you work on the network. They get an SMS before it starts and another when it is over.")}
      />

      {notice && <Notice tone="good">{notice}</Notice>}

      {canManage && (
        <Panel title={tr("Schedule maintenance")}>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="m-title">{tr("What is happening")}</Label>
              <Input id="m-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={tr("e.g. Replacing the Kasarani tower radio")} required minLength={3} />
              <HintText>{tr("For your team. Customers see the time and the extra line below.")}</HintText>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="m-start">{tr("Starts")}</Label>
                <Input id="m-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="m-end">{tr("Ends")}</Label>
                <Input id="m-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="m-notify">{tr("Text customers")}</Label>
                <select id="m-notify" className={selectClass} value={notifyHoursBefore} onChange={(e) => setNotifyHoursBefore(Number(e.target.value))}>
                  <option value={2}>{tr("2 hours before")}</option>
                  <option value={12}>{tr("12 hours before")}</option>
                  <option value={24}>{tr("1 day before")}</option>
                  <option value={48}>{tr("2 days before")}</option>
                </select>
              </div>
            </div>
            <div>
              <Label>{tr("Who is affected")}</Label>
              <Segmented
                label={tr("Who is affected")}
                value={scope}
                onChange={setScope}
                options={[
                  { value: "ROUTERS", label: tr("Routers") },
                  { value: "BRANCH", label: tr("Branch") },
                  { value: "ALL", label: tr("Everyone") },
                ]}
              />
              {scope === "ROUTERS" && (
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                  {(routers ?? []).map((r) => (
                    <label key={r.id} className="flex items-center gap-2 text-sm text-slate-200">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand-600"
                        checked={routerIds.includes(r.id)}
                        onChange={(e) => setRouterIds(e.target.checked ? [...routerIds, r.id] : routerIds.filter((x) => x !== r.id))}
                      />
                      {r.name}
                    </label>
                  ))}
                  {routers?.length === 0 && <p className="text-sm text-slate-400">{tr("No routers yet")}</p>}
                </div>
              )}
              {scope === "BRANCH" && (
                <select aria-label={tr("Branch")} className={`${selectClass} mt-3 max-w-xs`} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  <option value="">{tr("Choose a branch…")}</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}
              <HintText>
                {reach === null ? tr("Customers on a router are those whose plan runs on it or who connected through it in the last 30 days.") : `${tr("Customers who will be texted:")} ${reach}`}
              </HintText>
            </div>
            <div>
              <Label htmlFor="m-message">{tr("Extra line for customers (optional)")}</Label>
              <Input id="m-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={200} placeholder={tr("e.g. We are upgrading to faster fibre.")} />
            </div>
            {error && <Notice tone="bad">{error}</Notice>}
            <div className="flex justify-end">
              <button type="submit" className={darkButton("primary")} disabled={create.isPending}>
                {create.isPending ? tr("Saving…") : tr("Schedule and notify")}
              </button>
            </div>
          </form>
        </Panel>
      )}

      <Panel title={tr("Scheduled and past")} padded={false}>
        {isLoading ? (
          <p className="px-5 py-8 text-sm text-slate-400">{tr("Loading…")}</p>
        ) : !rows?.length ? (
          <EmptyState title={tr("Nothing planned")}>{tr("Maintenance you schedule appears here.")}</EmptyState>
        ) : (
          <TableShell minWidth={760}>
            <thead>
              <tr>
                <th className={th}>{tr("Maintenance")}</th>
                <th className={th}>{tr("When")}</th>
                <th className={th}>{tr("Who")}</th>
                <th className={th}>{tr("Status")}</th>
                <th className={`${th} text-right`}>{tr("Texted")}</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const state = stateOf(m);
                const upcoming = m.status === "SCHEDULED" && new Date(m.startsAt).getTime() > Date.now();
                return (
                  <tr key={m.id}>
                    <td className={`${td} max-w-[280px] whitespace-normal`}>
                      <p className="font-medium text-white">{m.title}</p>
                      {m.message && <p className="text-xs text-slate-400">{m.message}</p>}
                    </td>
                    <td className={`${td} text-slate-300`}>
                      {new Date(m.startsAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                      <span className="block text-xs text-slate-500">
                        {tr("to")} {new Date(m.endsAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                    </td>
                    <td className={`${td} max-w-[220px] whitespace-normal`}>{who(m)}</td>
                    <td className={td}>
                      <Pill tone={state.tone}>{state.label}</Pill>
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{m.beforeSentAt || m.afterSentAt ? m.recipientCount : "—"}</td>
                    <td className={`${td} text-right`}>
                      {canManage && upcoming && (
                        <button
                          type="button"
                          className={`${darkButton("ghost", "sm")} text-rose-300`}
                          disabled={cancel.isPending}
                          onClick={() => {
                            if (confirm(tr("Cancel this maintenance? Customers already told will get a text saying it is off."))) cancel.mutate(m.id);
                          }}
                        >
                          {tr("Cancel")}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}
      </Panel>
    </div>
  );
}
