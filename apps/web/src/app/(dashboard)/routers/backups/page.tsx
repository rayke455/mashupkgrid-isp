"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { downloadFromApi } from "@/lib/download";
import { tr } from "@/lib/tr";
import { EmptyState, Notice, PageHeader, Panel, TableShell, darkButton, td, th } from "@/components/dashboard/surface";
import { IconDownload, IconHardDriveDownload, IconRefresh, IconSearch } from "@/components/icons";

/**
 * Every router's saved configurations: taken daily, before each over-the-air change, or by hand.
 * The owner can download one, see what changed since the one before, or put it back on the router.
 */

interface FleetRouter {
  id: string;
  name: string;
  status: string;
  linked: boolean;
}

interface Backup {
  id: string;
  routerId: string;
  reason: string;
  sizeBytes: number;
  routerOsVersion: string | null;
  createdAt: string;
  restoredAt: string | null;
}

interface Diff {
  previousId: string | null;
  added: string[];
  removed: string[];
}

function kb(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

export default function RouterBackupsPage() {
  const { user } = useAuth();
  const canManage = user?.permissions.includes("routers.manage") ?? false;
  const isOwner = canManage && (user?.permissions.includes("settings.manage") ?? false);
  const queryClient = useQueryClient();
  const { data: fleet } = useQuery({ queryKey: ["ota-fleet"], queryFn: () => apiFetch<FleetRouter[]>("/api/v1/router-updates/fleet") });
  const [routerId, setRouterId] = useState("");
  useEffect(() => {
    if (!routerId && fleet?.length) setRouterId(fleet[0]!.id);
  }, [fleet, routerId]);
  const { data: backups, isLoading } = useQuery({
    queryKey: ["router-backups", routerId],
    queryFn: () => apiFetch<Backup[]>(`/api/v1/router-backups?routerId=${routerId}`),
    enabled: Boolean(routerId),
  });
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [diffFor, setDiffFor] = useState<string | null>(null);
  const router = fleet?.find((r) => r.id === routerId);

  const takeNow = useMutation({
    mutationFn: () => apiFetch<Backup>("/api/v1/router-backups", { method: "POST", body: JSON.stringify({ routerId }) }),
    onSuccess: (b) => {
      setNotice({ tone: "good", text: `${tr("Backup saved")} (${kb(b.sizeBytes)}).` });
      queryClient.invalidateQueries({ queryKey: ["router-backups", routerId] });
    },
    onError: (err) => setNotice({ tone: "bad", text: err instanceof ApiRequestError ? err.message : tr("Something went wrong.") }),
  });

  const restore = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/router-backups/${id}/restore`, { method: "POST", body: "{}" }),
    onSuccess: () => {
      setNotice({ tone: "good", text: tr("Restoring. The router downloads the backup, resets and reboots with it. Give it two or three minutes.") });
      queryClient.invalidateQueries({ queryKey: ["router-backups", routerId] });
    },
    onError: (err) => setNotice({ tone: "bad", text: err instanceof ApiRequestError ? err.message : tr("Something went wrong.") }),
  });

  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHeader
        title={tr("Router backups")}
        description={tr("Each router's full configuration, saved every day and before every over-the-air change. Download one, see what changed, or put it back.")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label={tr("Router")}
              value={routerId}
              onChange={(e) => {
                setRouterId(e.target.value);
                setDiffFor(null);
              }}
              className="rounded-lg border border-obsidian-700 bg-obsidian-950 px-2.5 py-1.5 text-sm text-slate-100"
            >
              {fleet?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            {canManage && (
              <button type="button" className={darkButton("primary")} disabled={!routerId || takeNow.isPending || !router?.linked} onClick={() => takeNow.mutate()}>
                <IconHardDriveDownload size={16} /> {takeNow.isPending ? tr("Saving…") : tr("Back up now")}
              </button>
            )}
          </div>
        }
      />

      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      {canManage && !isOwner && <Notice tone="neutral">{tr("Backups hold every password on the router, so only the account owner can download, compare or restore them.")}</Notice>}

      <Panel title={router ? router.name : tr("Backups")} padded={false}>
        {!fleet?.length ? (
          <EmptyState title={tr("No routers yet")} />
        ) : isLoading ? (
          <p className="px-5 py-8 text-sm text-slate-400">{tr("Loading…")}</p>
        ) : !backups?.length ? (
          <EmptyState title={tr("No backups yet")}>{tr("The first one is taken within a day of the router coming online, or press Back up now.")}</EmptyState>
        ) : (
          <TableShell minWidth={720}>
            <thead>
              <tr>
                <th className={th}>{tr("Saved")}</th>
                <th className={th}>{tr("Why")}</th>
                <th className={th}>RouterOS</th>
                <th className={`${th} text-right`}>{tr("Size")}</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {backups.map((b, i) => (
                <tr key={b.id}>
                  <td className={td}>
                    {new Date(b.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                    {b.restoredAt && <span className="block text-xs text-emerald-400">{tr("Restored")} {new Date(b.restoredAt).toLocaleDateString()}</span>}
                  </td>
                  <td className={td}>{tr(b.reason)}</td>
                  <td className={`${td} font-mono text-xs`}>{b.routerOsVersion ?? "—"}</td>
                  <td className={`${td} text-right tabular-nums`}>{kb(b.sizeBytes)}</td>
                  <td className={`${td} text-right`}>
                    {isOwner && (
                      <div className="flex justify-end gap-1">
                        {i < backups.length - 1 && (
                          <button type="button" className={darkButton("ghost", "sm")} onClick={() => setDiffFor(diffFor === b.id ? null : b.id)} aria-expanded={diffFor === b.id}>
                            <IconSearch size={14} /> {tr("Changes")}
                          </button>
                        )}
                        <button
                          type="button"
                          className={darkButton("ghost", "sm")}
                          onClick={() => downloadFromApi(`/api/v1/router-backups/${b.id}/download`, "router-backup.rsc").catch((e: Error) => setNotice({ tone: "bad", text: e.message }))}
                        >
                          <IconDownload size={14} /> {tr("Download")}
                        </button>
                        <button
                          type="button"
                          className={`${darkButton("ghost", "sm")} text-amber-300`}
                          disabled={restore.isPending}
                          onClick={() => {
                            const typed = prompt(`${tr("This replaces the whole configuration on the router and reboots it. Customers drop for a few minutes. Type the router's name to confirm:")} ${router?.name ?? ""}`);
                            if (typed !== null && typed.trim() === router?.name) restore.mutate(b.id);
                            else if (typed !== null) setNotice({ tone: "bad", text: tr("The name did not match, so nothing was restored.") });
                          }}
                        >
                          <IconRefresh size={14} /> {tr("Restore")}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
        {diffFor && <BackupDiff id={diffFor} />}
      </Panel>
    </div>
  );
}

function BackupDiff({ id }: { id: string }) {
  const { data, error } = useQuery({ queryKey: ["router-backup-diff", id], queryFn: () => apiFetch<Diff>(`/api/v1/router-backups/${id}/diff`) });
  if (error) return <p className="px-5 py-4 text-sm text-rose-300">{error instanceof Error ? error.message : String(error)}</p>;
  if (!data) return <p className="px-5 py-4 text-sm text-slate-400">{tr("Loading…")}</p>;
  if (!data.added.length && !data.removed.length) return <p className="px-5 py-4 text-sm text-slate-400">{tr("No changes since the backup before this one.")}</p>;
  return (
    <div className="border-t border-obsidian-800 px-5 py-4">
      <p className="mb-2 text-xs text-slate-400">
        {tr("Since the backup before this one")}: {data.added.length} {tr("added")}, {data.removed.length} {tr("removed")}
      </p>
      <pre className="max-h-80 overflow-auto rounded-lg bg-obsidian-950 p-3 font-mono text-xs leading-5">
        {data.removed.map((l, i) => (
          <div key={`r${i}`} className="text-rose-300">
            - {l}
          </div>
        ))}
        {data.added.map((l, i) => (
          <div key={`a${i}`} className="text-emerald-300">
            + {l}
          </div>
        ))}
      </pre>
    </div>
  );
}
