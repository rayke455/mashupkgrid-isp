"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Button, Card, ErrorText, HintText, Input, Label, Badge } from "@/components/ui";
import { IconNetworkPool } from "@/components/icons";

interface IpPool {
  id: string;
  name: string;
  version: "IPV4" | "IPV6";
  cidr: string;
  gateway: string | null;
  usage: { total: number; assigned: number; reserved: number; available: number };
}

export default function IpPoolsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [version, setVersion] = useState<"IPV4" | "IPV6">("IPV4");
  const [cidr, setCidr] = useState("");
  const [gateway, setGateway] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: pools, isLoading } = useQuery({
    queryKey: ["ip-pools"],
    queryFn: () => apiFetch<IpPool[]>("/api/v1/ip-pools"),
  });

  const createPool = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/ip-pools", {
        method: "POST",
        body: JSON.stringify({ name, version, cidr, gateway: gateway || undefined }),
      }),
    onSuccess: () => {
      setName("");
      setCidr("");
      setGateway("");
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["ip-pools"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to create pool"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400">
              <IconNetworkPool size={20} />
            </span>
            IPAM &amp; Subnet Pools
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Allocate dual-stack IPv4 address blocks and IPv6 delegated prefixes for PPPoE subscribers.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "+ New IP Pool"}
        </Button>
      </div>

      {showForm && (
        <Card className="border-sky-500/40 bg-sky-50/20 dark:bg-sky-950/20">
          <h2 className="font-semibold text-slate-900 dark:text-white mb-3">Define IP Address Pool</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              createPool.mutate();
            }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            <div>
              <Label htmlFor="name">Pool Name</Label>
              <Input id="name" placeholder="e.g. PPPoE-Pool-Westlands" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="version">Protocol Version</Label>
              <select
                id="version"
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm outline-none focus:border-brand-500 dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-slate-100"
                value={version}
                onChange={(e) => setVersion(e.target.value as "IPV4" | "IPV6")}
              >
                <option value="IPV4">IPv4 Subnet</option>
                <option value="IPV6">IPv6 Prefix</option>
              </select>
            </div>
            <div>
              <Label htmlFor="cidr">CIDR Subnet Block</Label>
              <Input id="cidr" placeholder="10.10.0.0/22" value={cidr} onChange={(e) => setCidr(e.target.value)} required />
              {version === "IPV4" && <HintText>Expands up to 4096 individual host IPs.</HintText>}
              {version === "IPV6" && <HintText>Assigned as delegated prefixes per user.</HintText>}
            </div>
            <div>
              <Label htmlFor="gateway">Gateway IP (Optional)</Label>
              <Input id="gateway" placeholder="10.10.0.1" value={gateway} onChange={(e) => setGateway(e.target.value)} />
            </div>
            <div className="col-span-full pt-2">
              <Button type="submit" disabled={createPool.isPending}>
                {createPool.isPending ? "Generating address space..." : "Initialize Pool"}
              </Button>
            </div>
          </form>
          {error && <ErrorText>{error}</ErrorText>}
        </Card>
      )}

      {isLoading && <p className="text-sm text-slate-500">Loading IP pools...</p>}

      <div className="space-y-3">
        {pools?.map((pool) => {
          const usedPct = pool.usage.total > 0 ? Math.round((pool.usage.assigned / pool.usage.total) * 100) : 0;

          return (
            <Card key={pool.id} hover={true} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    {pool.name}
                  </h3>
                  <Badge variant="info">{pool.version}</Badge>
                </div>
                <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                  {pool.cidr} {pool.gateway ? `· Gateway: ${pool.gateway}` : ""}
                </p>
              </div>

              <div className="text-left sm:text-right">
                {pool.usage.total > 0 ? (
                  <div>
                    <p className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                      {pool.usage.assigned} / {pool.usage.total} assigned ({usedPct}%)
                    </p>
                    <div className="mt-1.5 h-2 w-36 overflow-hidden rounded-full bg-slate-200 dark:bg-obsidian-800">
                      <div
                        className={`h-full ${
                          usedPct > 85 ? "bg-rose-500" : usedPct > 60 ? "bg-amber-500" : "bg-emerald-500"
                        }`}
                        style={{ width: `${usedPct}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 font-mono">Delegated Prefix</p>
                )}
              </div>
            </Card>
          );
        })}

        {pools && pools.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-obsidian-800">
            <IconNetworkPool size={32} className="mx-auto text-slate-400 mb-2" />
            <h3 className="font-semibold text-slate-700 dark:text-slate-300">No IP pools defined</h3>
            <p className="text-xs text-slate-500 mt-1">Add your first IPv4 or IPv6 subnet pool above.</p>
          </div>
        )}
      </div>
    </div>
  );
}
