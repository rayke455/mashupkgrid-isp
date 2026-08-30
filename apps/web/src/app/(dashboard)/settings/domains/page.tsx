"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Button, Card, ErrorText, HintText, Input, Label, Badge, StatusDot } from "@/components/ui";
import { IconGlobe, IconCopy, IconCheck } from "@/components/icons";

type DomainStatus =
  | "PENDING"
  | "CHECKING"
  | "VERIFIED"
  | "DNS_ERROR"
  | "SSL_PENDING"
  | "SSL_ACTIVE"
  | "SUSPENDED"
  | "REMOVED";

interface Domain {
  id: string;
  hostname: string;
  status: DomainStatus;
  isPrimary: boolean;
  lastError: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

interface TenantSettings {
  slug: string;
  platformUrl: string;
}

const STATUS_META: Record<DomainStatus, { label: string; variant: "success" | "warning" | "danger" | "info" | "neutral" }> = {
  PENDING: { label: "Pending", variant: "neutral" },
  CHECKING: { label: "Checking", variant: "info" },
  VERIFIED: { label: "Verified", variant: "success" },
  DNS_ERROR: { label: "DNS Error", variant: "danger" },
  SSL_PENDING: { label: "SSL Pending", variant: "warning" },
  SSL_ACTIVE: { label: "SSL Active", variant: "success" },
  SUSPENDED: { label: "Suspended", variant: "danger" },
  REMOVED: { label: "Removed", variant: "neutral" },
};

function CopyableValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 truncate rounded-lg bg-slate-100 dark:bg-obsidian-900 px-2.5 py-1.5 font-mono text-xs text-slate-700 dark:text-slate-300">
        {value}
      </code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
        title="Copy"
      >
        {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
      </button>
    </div>
  );
}

function DomainCard({ domain, cnameTarget }: { domain: Domain; cnameTarget: string }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const meta = STATUS_META[domain.status];

  const verify = useMutation({
    mutationFn: () => apiFetch<Domain>(`/api/v1/domains/${domain.id}/verify`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["domains"] }),
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Verification failed"),
  });

  const setPrimary = useMutation({
    mutationFn: () => apiFetch(`/api/v1/domains/${domain.id}/set-primary`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["domains"] }),
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to set primary"),
  });

  const remove = useMutation({
    mutationFn: () => apiFetch(`/api/v1/domains/${domain.id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["domains"] }),
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to remove domain"),
  });

  const isVerified = domain.status === "VERIFIED" || domain.status === "SSL_ACTIVE";

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">{domain.hostname}</span>
          {domain.isPrimary && <Badge variant="info">Primary</Badge>}
        </div>
        <Badge variant={meta.variant}>
          <StatusDot status={meta.variant === "success" ? "ONLINE" : meta.variant === "danger" ? "DOWN" : "UNKNOWN"} />
          <span>{meta.label}</span>
        </Badge>
      </div>

      {!isVerified && (
        <div className="rounded-lg border border-slate-200 dark:border-obsidian-800 p-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Configure DNS</p>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs items-center">
            <span className="text-slate-400">Type</span>
            <span className="font-mono">CNAME</span>
            <span className="text-slate-400">Name</span>
            <span className="font-mono">{domain.hostname.split(".")[0]}</span>
            <span className="text-slate-400">Target</span>
            <CopyableValue value={cnameTarget} />
          </div>
          {domain.lastError && <ErrorText>{domain.lastError}</ErrorText>}
        </div>
      )}

      <div className="flex items-center gap-2">
        {!isVerified && (
          <Button variant="secondary" className="text-xs py-1.5" onClick={() => { setError(null); verify.mutate(); }} disabled={verify.isPending}>
            {verify.isPending ? "Checking DNS..." : "Verify DNS"}
          </Button>
        )}
        {isVerified && !domain.isPrimary && (
          <Button variant="secondary" className="text-xs py-1.5" onClick={() => { setError(null); setPrimary.mutate(); }} disabled={setPrimary.isPending}>
            {setPrimary.isPending ? "Setting..." : "Make Primary"}
          </Button>
        )}
        <Button
          variant="danger"
          className="text-xs py-1.5"
          onClick={() => {
            if (confirm(`Remove "${domain.hostname}"?`)) {
              setError(null);
              remove.mutate();
            }
          }}
          disabled={remove.isPending}
        >
          Remove
        </Button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </Card>
  );
}

export default function DomainManagementPage() {
  const queryClient = useQueryClient();
  const [showConnect, setShowConnect] = useState(false);
  const [hostname, setHostname] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiFetch<TenantSettings>("/api/v1/settings"),
  });

  const { data: domains, isLoading } = useQuery({
    queryKey: ["domains"],
    queryFn: () => apiFetch<Domain[]>("/api/v1/domains"),
  });

  const addDomain = useMutation({
    mutationFn: () => apiFetch("/api/v1/domains", { method: "POST", body: JSON.stringify({ hostname: hostname.trim().toLowerCase() }) }),
    onSuccess: () => {
      setHostname("");
      setShowConnect(false);
      queryClient.invalidateQueries({ queryKey: ["domains"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to add domain"),
  });

  const cnameTarget = settings ? settings.platformUrl.replace(/^https?:\/\//, "") : "";

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <IconGlobe size={18} className="text-brand-600 dark:text-brand-400" />
          Domain Management
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Your platform subdomain always works — connect a custom domain if you want your own branded URL.
        </p>
      </div>

      <Card>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Your Platform Domain</p>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-slate-700 dark:text-slate-300">{settings?.platformUrl ?? "..."}</span>
          <Badge variant="success">
            <StatusDot status="ONLINE" />
            <span>Active</span>
          </Badge>
        </div>
      </Card>

      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Custom Domain</p>
          <Button variant="secondary" className="text-xs py-1.5" onClick={() => setShowConnect((v) => !v)}>
            {showConnect ? "Cancel" : "+ Connect Custom Domain"}
          </Button>
        </div>

        {showConnect && (
          <Card className="mb-3 border-brand-500/40 bg-brand-50/20 dark:bg-brand-950/20">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                addDomain.mutate();
              }}
              className="space-y-3"
            >
              <div>
                <Label htmlFor="hostname">Domain</Label>
                <Input
                  id="hostname"
                  placeholder="billing.yourcompany.co.ke"
                  value={hostname}
                  onChange={(e) => setHostname(e.target.value)}
                  className="font-mono text-sm"
                  required
                />
                <HintText>A subdomain of a domain you own — not the bare platform domain.</HintText>
              </div>
              <Button type="submit" disabled={addDomain.isPending}>
                {addDomain.isPending ? "Connecting..." : "Connect Domain"}
              </Button>
              {error && <ErrorText>{error}</ErrorText>}
            </form>
          </Card>
        )}

        {isLoading && <p className="text-sm text-slate-500">Loading domains...</p>}

        {domains && domains.length === 0 && !showConnect && (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-obsidian-800 p-6 text-center">
            <p className="text-sm text-slate-500">No custom domain connected</p>
          </div>
        )}

        <div className="space-y-3">
          {domains?.map((domain) => (
            <DomainCard key={domain.id} domain={domain} cnameTarget={cnameTarget} />
          ))}
        </div>
      </div>
    </div>
  );
}
