"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { tr } from "@/lib/tr";
import { HintText } from "@/components/ui";
import { EmptyState, Notice, PageHeader, Panel, Pill, TableShell, darkButton, td, th } from "@/components/dashboard/surface";
import {
  IconCircleCheck,
  IconCircleMinus,
  IconCircleX,
  IconCloudDownload,
  IconCpu,
  IconFileCode,
  IconGauge,
  IconHardDriveDownload,
  IconPower,
  IconRefresh,
  IconSearch,
  IconShield,
  IconShieldOff,
  IconSpinner,
  IconUsers,
  IconZap,
  type IconProps,
} from "@/components/icons";

/**
 * Over-the-air updates for the ISP's MikroTik routers: upgrade RouterOS and firmware, push the
 * latest hotspot setup or a feature, reboot, or run your own script, on one router or all of them.
 * The first router is done alone by default, and the rest only follow if it worked.
 */

interface OtaAction {
  key: string;
  label: string;
  description: string;
  group: "updates" | "features" | "maintenance";
  disruptive: boolean;
  needsScript?: boolean;
}

interface FleetRouter {
  id: string;
  name: string;
  status: "UNKNOWN" | "ONLINE" | "WARNING" | "DOWN";
  siteName: string | null;
  routerOsVersion: string | null;
  boardName: string | null;
  firmwareVersion: string | null;
  versionCheckedAt: string | null;
  linked: boolean;
}

type RolloutStatus = "SCHEDULED" | "RUNNING" | "COMPLETED" | "CANCELLED";
type TargetStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED";

interface Rollout {
  id: string;
  action: string;
  status: RolloutStatus;
  canaryFirst: boolean;
  scheduledFor: string | null;
  createdAt: string;
  finishedAt: string | null;
  automatic?: boolean;
  counts: Partial<Record<TargetStatus, number>>;
}

interface RolloutDetail extends Rollout {
  targets: { id: string; routerName: string; status: TargetStatus; message: string | null; finishedAt: string | null }[];
}

const ACTION_ICON: Record<string, ComponentType<IconProps>> = {
  "check-versions": IconSearch,
  "routeros-upgrade": IconCloudDownload,
  "firmware-upgrade": IconHardDriveDownload,
  "reapply-setup": IconRefresh,
  "pcq-fair-queue": IconUsers,
  "safe-dns-on": IconShield,
  "safe-dns-off": IconShieldOff,
  "anti-tunnel-on": IconShield,
  "anti-tunnel-off": IconShieldOff,
  "speedtest-boost": IconGauge,
  reboot: IconPower,
  "custom-script": IconFileCode,
};

const GROUPS: { key: OtaAction["group"]; label: string }[] = [
  { key: "updates", label: "Updates" },
  { key: "features", label: "Features" },
  { key: "maintenance", label: "Maintenance" },
];

const TARGET_META: Record<TargetStatus, { label: string; tone: "neutral" | "warn" | "good" | "bad"; Icon: ComponentType<IconProps> }> = {
  PENDING: { label: "Waiting", tone: "neutral", Icon: IconCircleMinus },
  RUNNING: { label: "Updating", tone: "warn", Icon: IconSpinner },
  SUCCEEDED: { label: "Done", tone: "good", Icon: IconCircleCheck },
  FAILED: { label: "Failed", tone: "bad", Icon: IconCircleX },
  SKIPPED: { label: "Skipped", tone: "neutral", Icon: IconCircleMinus },
};

/** The next 03:00 in the browser's own time: a quiet hour for disruptive updates. */
function nextThreeAm(): Date {
  const d = new Date();
  d.setHours(3, 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

function routerState(r: FleetRouter): { label: string; tone: "good" | "bad" | "warn" | "neutral" } {
  if (!r.linked) return { label: tr("Not linked"), tone: "neutral" };
  if (r.status === "DOWN") return { label: tr("Offline"), tone: "bad" };
  if (r.status === "WARNING") return { label: tr("Slow"), tone: "warn" };
  if (r.status === "ONLINE") return { label: tr("Online"), tone: "good" };
  return { label: tr("Unknown"), tone: "neutral" };
}

export default function RouterUpdatesPage() {
  const { user } = useAuth();
  const canManage = user?.permissions.includes("routers.manage") ?? false;
  const isOwner = user?.permissions.includes("settings.manage") ?? false;
  const queryClient = useQueryClient();
  const { data: actions } = useQuery({ queryKey: ["ota-actions"], queryFn: () => apiFetch<OtaAction[]>("/api/v1/router-updates/actions") });
  const { data: fleet } = useQuery({ queryKey: ["ota-fleet"], queryFn: () => apiFetch<FleetRouter[]>("/api/v1/router-updates/fleet") });
  const { data: rollouts } = useQuery({
    queryKey: ["ota-rollouts"],
    queryFn: () => apiFetch<Rollout[]>("/api/v1/router-updates"),
    refetchInterval: (q) => ((q.state.data ?? []).some((r) => r.status === "RUNNING" || r.status === "SCHEDULED") ? 5000 : false),
  });

  const [actionKey, setActionKey] = useState("check-versions");
  const [selected, setSelected] = useState<string[]>([]);
  const [script, setScript] = useState("");
  const [canaryFirst, setCanaryFirst] = useState(true);
  const [when, setWhen] = useState<"now" | "tonight" | "custom">("now");
  const [customTime, setCustomTime] = useState("");
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [openRollout, setOpenRollout] = useState<string | null>(null);

  const action = actions?.find((a) => a.key === actionKey);
  const available = useMemo(() => (actions ?? []).filter((a) => !a.needsScript || isOwner), [actions, isOwner]);
  const updatable = (fleet ?? []).filter((r) => r.linked && r.status !== "DOWN");

  const create = useMutation({
    mutationFn: () =>
      apiFetch<Rollout>("/api/v1/router-updates", {
        method: "POST",
        body: JSON.stringify({
          action: actionKey,
          routerIds: selected,
          canaryFirst,
          script: action?.needsScript ? script : undefined,
          scheduledFor: when === "tonight" ? nextThreeAm().toISOString() : when === "custom" && customTime ? new Date(customTime).toISOString() : null,
        }),
      }),
    onSuccess: (r) => {
      setNotice({ tone: "good", text: r.status === "SCHEDULED" ? tr("Scheduled. It starts on its own at the time you chose.") : tr("Started. Results appear below as each router is done.") });
      setOpenRollout(r.id);
      queryClient.invalidateQueries({ queryKey: ["ota-rollouts"] });
    },
    onError: (err) => setNotice({ tone: "bad", text: err instanceof ApiRequestError ? err.message : tr("Something went wrong.") }),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/router-updates/${id}/cancel`, { method: "POST", body: "{}" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ota-rollouts"] }),
  });

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHeader
        title={tr("Router updates")}
        description={tr("Update your MikroTik routers over the air: RouterOS and firmware upgrades, the latest hotspot setup, network features, reboots or your own script, on one router or all of them.")}
      />

      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      <Panel
        title={tr("Your routers")}
        description={tr("Versions come from the last “Check versions”. Offline and unlinked routers are skipped.")}
        padded={false}
        actions={
          canManage && updatable.length > 0 ? (
            <button type="button" className={darkButton("ghost", "sm")} onClick={() => setSelected(selected.length === updatable.length ? [] : updatable.map((r) => r.id))}>
              {selected.length === updatable.length ? tr("Clear selection") : tr("Select all online")}
            </button>
          ) : undefined
        }
      >
        {!fleet?.length ? (
          <EmptyState title={tr("No routers yet")} />
        ) : (
          <TableShell minWidth={760}>
            <thead>
              <tr>
                {canManage && <th className={`${th} w-10`} />}
                <th className={th}>{tr("Router")}</th>
                <th className={th}>{tr("Status")}</th>
                <th className={th}>RouterOS</th>
                <th className={th}>{tr("Model")}</th>
                <th className={th}>{tr("Firmware")}</th>
                <th className={th}>{tr("Checked")}</th>
              </tr>
            </thead>
            <tbody>
              {fleet.map((r) => {
                const state = routerState(r);
                const disabled = !r.linked || r.status === "DOWN";
                return (
                  <tr key={r.id} className={disabled ? "opacity-60" : undefined}>
                    {canManage && (
                      <td className={td}>
                        <input type="checkbox" aria-label={r.name} className="h-4 w-4 accent-brand-600" disabled={disabled} checked={selected.includes(r.id)} onChange={() => toggle(r.id)} />
                      </td>
                    )}
                    <td className={td}>
                      <span className="font-medium text-white">{r.name}</span>
                      {r.siteName && <span className="block text-xs text-slate-500">{r.siteName}</span>}
                    </td>
                    <td className={td}>
                      <Pill tone={state.tone}>{state.label}</Pill>
                    </td>
                    <td className={`${td} font-mono text-xs`}>{r.routerOsVersion ?? "—"}</td>
                    <td className={td}>{r.boardName ?? "—"}</td>
                    <td className={`${td} font-mono text-xs`}>{r.firmwareVersion ?? "—"}</td>
                    <td className={`${td} text-slate-400`}>{r.versionCheckedAt ? new Date(r.versionCheckedAt).toLocaleDateString() : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}
      </Panel>

      {canManage && (
        <Panel title={tr("Push an update")}>
          <div className="space-y-5">
            {GROUPS.map((g) => {
              const items = available.filter((a) => a.group === g.key);
              if (!items.length) return null;
              return (
                <div key={g.key}>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">{tr(g.label)}</p>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {items.map((a) => {
                      const Icon = ACTION_ICON[a.key] ?? IconCpu;
                      const active = a.key === actionKey;
                      return (
                        <button
                          key={a.key}
                          type="button"
                          onClick={() => setActionKey(a.key)}
                          aria-pressed={active}
                          className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                            active ? "border-brand-500 bg-brand-950" : "border-obsidian-800 bg-obsidian-900 hover:border-obsidian-700"
                          }`}
                        >
                          <span className={`mt-0.5 rounded-lg p-1.5 ${active ? "bg-brand-600 text-white" : "bg-obsidian-800 text-slate-300"}`}>
                            <Icon size={18} />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-white">{tr(a.label)}</span>
                            <span className="block text-xs leading-5 text-slate-400">{tr(a.description)}</span>
                            {a.disruptive && (
                              <span className="mt-1 inline-flex items-center gap-1 text-xs text-amber-400">
                                <IconZap size={12} /> {tr("Customers drop for a minute or two")}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {action?.needsScript && (
              <div>
                <label htmlFor="ota-script" className="mb-1 block text-sm font-medium text-slate-200">
                  {tr("RouterOS script")}
                </label>
                <textarea
                  id="ota-script"
                  rows={8}
                  spellCheck={false}
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  placeholder={`/system ntp client set enabled=yes\n/system ntp client servers add address=time.cloudflare.com\n:put "done"`}
                  className="w-full rounded-lg border border-obsidian-700 bg-obsidian-950 px-3 py-2 font-mono text-xs leading-5 text-slate-100"
                />
                <HintText>{tr("Runs exactly as written on every chosen router. Test it on one router first. What the script prints with :put is shown in the results.")}</HintText>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-slate-200">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={canaryFirst} onChange={(e) => setCanaryFirst(e.target.checked)} />
                {tr("Test on the first router, then do the rest")}
              </label>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">{tr("When")}</span>
                <select value={when} onChange={(e) => setWhen(e.target.value as typeof when)} className="rounded-lg border border-obsidian-700 bg-obsidian-950 px-2 py-1 text-sm text-slate-100">
                  <option value="now">{tr("Now")}</option>
                  <option value="tonight">{tr("Tonight at 3:00")}</option>
                  <option value="custom">{tr("Pick a time")}</option>
                </select>
                {when === "custom" && (
                  <input type="datetime-local" value={customTime} onChange={(e) => setCustomTime(e.target.value)} className="rounded-lg border border-obsidian-700 bg-obsidian-950 px-2 py-1 text-sm text-slate-100" />
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-obsidian-800 pt-4">
              <p className="text-sm text-slate-400">
                {selected.length === 0 ? tr("Tick the routers to update above.") : `${selected.length} ${tr("routers selected")}`}
              </p>
              <button
                type="button"
                className={darkButton("primary")}
                disabled={!selected.length || create.isPending || (action?.needsScript && !script.trim()) || (when === "custom" && !customTime)}
                onClick={() => {
                  setNotice(null);
                  if (action?.disruptive && when === "now" && !confirm(tr("This drops customers on these routers for a minute or two. Continue now?"))) return;
                  create.mutate();
                }}
              >
                {create.isPending ? tr("Starting…") : `${tr("Start on")} ${selected.length} ${selected.length === 1 ? tr("router") : tr("routers")}`}
              </button>
            </div>
          </div>
        </Panel>
      )}

      {isOwner && <AutoUpdateSettings />}

      <Panel title={tr("Recent updates")} padded={false}>
        {!rollouts?.length ? (
          <EmptyState title={tr("No updates yet")}>{tr("Updates you push appear here with a result for each router.")}</EmptyState>
        ) : (
          <ul className="divide-y divide-obsidian-800">
            {rollouts.map((r) => {
              const total = Object.values(r.counts).reduce((s, n) => s + (n ?? 0), 0);
              const finished = (r.counts.SUCCEEDED ?? 0) + (r.counts.FAILED ?? 0) + (r.counts.SKIPPED ?? 0);
              const label = actions?.find((a) => a.key === r.action)?.label ?? r.action;
              const Icon = ACTION_ICON[r.action] ?? IconCpu;
              return (
                <li key={r.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={() => setOpenRollout(openRollout === r.id ? null : r.id)} aria-expanded={openRollout === r.id}>
                      <span className="rounded-lg bg-obsidian-800 p-1.5 text-slate-300">
                        <Icon size={18} />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium text-white">
                          {tr(label)}
                          {r.automatic && <span className="ml-2 rounded bg-obsidian-800 px-1.5 py-0.5 text-[11px] font-normal text-slate-300">{tr("Automatic")}</span>}
                        </span>
                        <span className="block text-xs text-slate-400">
                          {r.status === "SCHEDULED" && r.scheduledFor
                            ? `${tr("Starts")} ${new Date(r.scheduledFor).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`
                            : new Date(r.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                          {" · "}
                          {finished}/{total} {tr("routers")}
                          {r.counts.SUCCEEDED ? ` · ${r.counts.SUCCEEDED} ${tr("done")}` : ""}
                          {r.counts.FAILED ? ` · ${r.counts.FAILED} ${tr("failed")}` : ""}
                        </span>
                      </span>
                    </button>
                    <div className="flex items-center gap-2">
                      <Pill tone={r.status === "COMPLETED" ? ((r.counts.FAILED ?? 0) > 0 ? "warn" : "good") : r.status === "CANCELLED" ? "neutral" : "warn"}>
                        {r.status === "COMPLETED" ? tr("Finished") : r.status === "CANCELLED" ? tr("Cancelled") : r.status === "SCHEDULED" ? tr("Scheduled") : tr("Running")}
                      </Pill>
                      {canManage && (r.status === "RUNNING" || r.status === "SCHEDULED") && (
                        <button type="button" className={`${darkButton("ghost", "sm")} text-rose-300`} onClick={() => cancel.mutate(r.id)}>
                          {tr("Stop")}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-obsidian-800" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={finished}>
                    <div className={`h-full ${(r.counts.FAILED ?? 0) > 0 ? "bg-amber-500" : "bg-brand-500"}`} style={{ width: `${total ? (finished / total) * 100 : 0}%` }} />
                  </div>
                  {openRollout === r.id && <RolloutTargets id={r.id} live={r.status === "RUNNING"} />}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

interface Preferences {
  autoUpdate: { enabled: boolean; dayOfMonth: number; hour: number; includeFirmware: boolean };
  [key: string]: unknown;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}

/** The monthly automatic upgrade: which day and hour, and whether firmware follows. */
function AutoUpdateSettings() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["preferences"], queryFn: () => apiFetch<Preferences>("/api/v1/settings/preferences") });
  const [form, setForm] = useState<Preferences["autoUpdate"] | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (data && !form) setForm(data.autoUpdate);
  }, [data, form]);
  const save = useMutation({
    mutationFn: () => apiFetch("/api/v1/settings/preferences", { method: "PUT", body: JSON.stringify({ ...data, autoUpdate: form }) }),
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["preferences"] });
    },
  });
  if (!form) return null;
  const select = "rounded-lg border border-obsidian-700 bg-obsidian-950 px-2 py-1 text-sm text-slate-100";
  return (
    <Panel title={tr("Automatic monthly upgrade")} description={tr("Upgrades RouterOS on every router once a month at a quiet hour: the first router alone, then the rest if it worked. You get an alert when it is done.")}>
      <form
        className="space-y-4 text-sm text-slate-200"
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(false);
          save.mutate();
        }}
      >
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
          {tr("Upgrade my routers automatically every month")}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <span>{tr("On the")}</span>
          <select aria-label={tr("Day of the month")} className={select} value={form.dayOfMonth} onChange={(e) => setForm({ ...form, dayOfMonth: Number(e.target.value) })}>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {ordinal(d)}
              </option>
            ))}
          </select>
          <span>{tr("of each month at")}</span>
          <select aria-label={tr("Hour")} className={select} value={form.hour} onChange={(e) => setForm({ ...form, hour: Number(e.target.value) })}>
            {Array.from({ length: 24 }, (_, h) => h).map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.includeFirmware} onChange={(e) => setForm({ ...form, includeFirmware: e.target.checked })} />
          {tr("Also upgrade RouterBOARD firmware 45 minutes later")}
        </label>
        <p className="text-xs text-slate-400">{tr("Every router is backed up just before it is upgraded, so any router can be put back from Router backups.")}</p>
        <div className="flex items-center gap-3">
          <button type="submit" className={darkButton("primary")} disabled={save.isPending}>
            {save.isPending ? tr("Saving…") : tr("Save")}
          </button>
          {saved && <span className="text-emerald-400">{tr("Saved")}</span>}
        </div>
      </form>
    </Panel>
  );
}

function RolloutTargets({ id, live }: { id: string; live: boolean }) {
  const { data } = useQuery({ queryKey: ["ota-rollout", id], queryFn: () => apiFetch<RolloutDetail>(`/api/v1/router-updates/${id}`), refetchInterval: live ? 4000 : false });
  if (!data) return <p className="mt-3 text-sm text-slate-400">{tr("Loading…")}</p>;
  return (
    <ul className="mt-3 space-y-1.5">
      {data.targets.map((t, i) => {
        const meta = TARGET_META[t.status];
        return (
          <li key={t.id} className="flex items-start gap-2 text-sm">
            <meta.Icon size={16} className={`mt-0.5 shrink-0 ${meta.tone === "good" ? "text-emerald-400" : meta.tone === "bad" ? "text-rose-400" : meta.tone === "warn" ? "animate-spin text-amber-400" : "text-slate-500"}`} />
            <span className="min-w-0">
              <span className="font-medium text-white">{t.routerName}</span>
              {i === 0 && data.canaryFirst && <span className="ml-2 text-xs text-slate-500">({tr("first")})</span>}
              <span className="ml-2 text-slate-400">{tr(meta.label)}</span>
              {t.message && <span className="block break-words text-xs text-slate-400">{t.message}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
