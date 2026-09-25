"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { EmptyState, Notice, PageHeader, Panel, Pill, TableShell, darkButton, td, th } from "@/components/dashboard/surface";

interface WalledGardenHost {
  id: string;
  host: string;
  note: string | null;
  createdAt: string;
}

interface WalledGardenResponse {
  hosts: WalledGardenHost[];
  builtIn: string[];
}

/**
 * What a hotspot customer can reach before paying, on every router on the platform. Adding a
 * host here reaches new routers through their setup script and routers already online through
 * the hotspot self-repair pass (within a few minutes).
 */
export default function WalledGardenPage() {
  const queryClient = useQueryClient();
  const [host, setHost] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["platform-walled-garden"],
    queryFn: () => apiFetch<WalledGardenResponse>("/api/v1/platform/walled-garden"),
  });

  const add = useMutation({
    mutationFn: () => apiFetch<WalledGardenHost>("/api/v1/platform/walled-garden", { method: "POST", body: JSON.stringify({ host: host.trim(), note: note.trim() || undefined }) }),
    onSuccess: (row) => {
      setHost("");
      setNote("");
      setError(null);
      setFlash(`${row.host} is now allowed before login. Routers already online pick it up on their next self-check.`);
      queryClient.invalidateQueries({ queryKey: ["platform-walled-garden"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Could not add this host"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<{ note: string }>(`/api/v1/platform/walled-garden/${id}`, { method: "DELETE" }),
    onSuccess: (res) => {
      setFlash(res.note);
      queryClient.invalidateQueries({ queryKey: ["platform-walled-garden"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Could not remove this host"),
  });

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Walled garden"
        description="Websites a hotspot customer can open before they have paid, on every ISP's routers. Keep it to what a customer needs in order to pay or get help — every entry here is a hole in the paywall."
      />

      {flash && <Notice tone="good">{flash}</Notice>}
      {error && <Notice tone="bad">{error}</Notice>}

      <Panel title="Allow a host" description="A hostname, a wildcard under a domain, or an IPv4 address.">
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (host.trim()) add.mutate();
          }}
        >
          <label className="flex-1 text-sm">
            <span className="mb-1.5 block text-slate-300">Host</span>
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="pay.example.com, *.example.com or 203.0.113.5"
              spellCheck={false}
              autoComplete="off"
              className="w-full rounded-lg border border-obsidian-700 bg-obsidian-950 px-3 py-2 font-mono text-sm text-white outline-none placeholder:text-slate-500 focus:border-brand-500"
            />
          </label>
          <label className="flex-1 text-sm">
            <span className="mb-1.5 block text-slate-300">Why (optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. new card gateway"
              maxLength={200}
              className="w-full rounded-lg border border-obsidian-700 bg-obsidian-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-brand-500"
            />
          </label>
          <button type="submit" disabled={add.isPending || !host.trim()} className={darkButton("primary")}>
            {add.isPending ? "Adding…" : "Allow host"}
          </button>
        </form>
      </Panel>

      <Panel title="Allowed by you" description="Applied to every router on the platform." padded={false}>
        {isLoading ? (
          <p className="px-5 py-8 text-sm text-slate-400">Loading…</p>
        ) : !data || data.hosts.length === 0 ? (
          <EmptyState title="Nothing added yet">The built-in hosts below already cover the platform and the payment gateways.</EmptyState>
        ) : (
          <TableShell minWidth={560}>
            <thead>
              <tr>
                <th className={th}>Host</th>
                <th className={th}>Why</th>
                <th className={th}>Added</th>
                <th className={`${th} text-right`}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.hosts.map((row) => (
                <tr key={row.id}>
                  <td className={`${td} font-mono text-[13px] text-white`}>{row.host}</td>
                  <td className={`${td} whitespace-normal text-slate-400`}>{row.note ?? "—"}</td>
                  <td className={`${td} text-slate-400`}>{new Date(row.createdAt).toLocaleDateString()}</td>
                  <td className={`${td} text-right`}>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Stop allowing ${row.host} before login?`)) remove.mutate(row.id);
                      }}
                      disabled={remove.isPending}
                      className={darkButton("ghost", "sm")}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Panel>

      <Panel title="Built in" description="Always allowed: the platform itself, each ISP's own portal domains, and the payment gateways.">
        <div className="flex flex-wrap gap-2">
          {(data?.builtIn ?? []).map((h) => (
            <Pill key={h}>
              <span className="font-mono">{h}</span>
            </Pill>
          ))}
        </div>
      </Panel>
    </div>
  );
}
