"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";
import { HintText, Input, Label } from "@/components/ui";
import { EmptyState, Modal, Notice, Panel, Pill, TableShell, darkButton, td, th } from "@/components/dashboard/surface";
import { PackageAssistantChat } from "@/components/hotspot/package-assistant-chat";
import { getSocialAppMeta, type SocialAppPolicy } from "@/components/hotspot/themes";
import {
  APP_POLICY_OPTIONS,
  DURATION_PRESETS,
  PACKAGES_QUERY_KEY,
  formatData,
  formatDuration,
  formatSpeed,
  type HotspotPackage,
} from "./shared";

const selectClass =
  "w-full rounded-lg border border-slate-300/90 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-slate-100";

interface FormState {
  name: string;
  price: string;
  duration: string;
  customDuration: string;
  dataCap: string;
  downloadMbps: string;
  uploadMbps: string;
  devices: string;
  blockTethering: boolean;
  appPolicy: SocialAppPolicy;
  isPopular: boolean;
  badge: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  price: "",
  duration: "60",
  customDuration: "",
  dataCap: "",
  downloadMbps: "5",
  uploadMbps: "2",
  devices: "1",
  blockTethering: false,
  appPolicy: "ALL",
  isPopular: false,
  badge: "Most popular",
};

function formFromPackage(pkg: HotspotPackage): FormState {
  const preset = DURATION_PRESETS.some((p) => p.minutes === pkg.durationMinutes);
  return {
    name: pkg.name,
    price: String(pkg.priceMinor / 100),
    duration: preset ? String(pkg.durationMinutes) : "custom",
    customDuration: preset ? "" : String(pkg.durationMinutes),
    dataCap: pkg.dataCapMb ? String(pkg.dataCapMb) : "",
    downloadMbps: pkg.downloadKbps ? String(pkg.downloadKbps / 1000) : "",
    uploadMbps: pkg.uploadKbps ? String(pkg.uploadKbps / 1000) : "",
    devices: String(pkg.simultaneousUse ?? 1),
    blockTethering: Boolean(pkg.blockTethering),
    appPolicy: (pkg.appPolicy as SocialAppPolicy) || "ALL",
    isPopular: Boolean(pkg.isPopular),
    badge: pkg.badge || "Most popular",
  };
}

/** The same body the API always took; `null` clears a limit on edit, `undefined` omits it on create. */
function toPayload(f: FormState, forEdit: boolean) {
  const clear = forEdit ? null : undefined;
  const minutes = f.duration === "custom" ? Number(f.customDuration) : Number(f.duration);
  return {
    name: f.name.trim(),
    priceMinor: Math.round(Number(f.price) * 100),
    durationMinutes: minutes,
    dataCapMb: f.dataCap ? Number(f.dataCap) : clear,
    downloadKbps: f.downloadMbps ? Math.round(Number(f.downloadMbps) * 1000) : clear,
    uploadKbps: f.uploadMbps ? Math.round(Number(f.uploadMbps) * 1000) : clear,
    simultaneousUse: Math.max(1, Number(f.devices) || 1),
    blockTethering: f.blockTethering,
    appPolicy: f.appPolicy,
    isPopular: f.isPopular,
    badge: f.isPopular && f.badge.trim() ? f.badge.trim() : clear,
  };
}

function PackageForm({ initial, onClose }: { initial: HotspotPackage | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [f, setF] = useState<FormState>(initial ? formFromPackage(initial) : EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setF((prev) => ({ ...prev, [key]: value }));

  const save = useMutation({
    mutationFn: () =>
      initial
        ? apiFetch<HotspotPackage>(`/api/v1/vouchers/packages/${initial.id}`, { method: "PATCH", body: JSON.stringify(toPayload(f, true)) })
        : apiFetch<HotspotPackage>("/api/v1/vouchers/packages", { method: "POST", body: JSON.stringify(toPayload(f, false)) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PACKAGES_QUERY_KEY });
      onClose();
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Couldn't save the package."),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const minutes = f.duration === "custom" ? Number(f.customDuration) : Number(f.duration);
    if (!f.name.trim()) return setError("Give the package a name.");
    if (!(Number(f.price) > 0)) return setError("Enter a price above zero.");
    if (!(minutes > 0)) return setError("Enter how long the package lasts.");
    save.mutate();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? `Edit ${initial.name}` : "New package"}
      description="What customers can buy on your hotspot portal."
      width="max-w-xl"
    >
      <form id="package-form" onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="pkg-name">Name</Label>
            <Input id="pkg-name" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. 1 hour" autoFocus />
          </div>
          <div>
            <Label htmlFor="pkg-price">Price (KSh)</Label>
            <Input id="pkg-price" inputMode="decimal" value={f.price} onChange={(e) => set("price", e.target.value)} placeholder="20" />
          </div>
          <div>
            <Label htmlFor="pkg-duration">Lasts</Label>
            <select id="pkg-duration" className={selectClass} value={f.duration} onChange={(e) => set("duration", e.target.value)}>
              {DURATION_PRESETS.map((p) => (
                <option key={p.minutes} value={p.minutes}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Custom…</option>
            </select>
          </div>
          {f.duration === "custom" && (
            <div>
              <Label htmlFor="pkg-custom">Minutes</Label>
              <Input id="pkg-custom" inputMode="numeric" value={f.customDuration} onChange={(e) => set("customDuration", e.target.value)} placeholder="1500" />
              <HintText>{f.customDuration ? formatDuration(Number(f.customDuration)) : "e.g. 1500 for 25 hours"}</HintText>
            </div>
          )}
          <div>
            <Label htmlFor="pkg-data">Data limit (MB)</Label>
            <Input id="pkg-data" inputMode="numeric" value={f.dataCap} onChange={(e) => set("dataCap", e.target.value)} placeholder="Unlimited" />
          </div>
          <div>
            <Label htmlFor="pkg-down">Download speed (Mbps)</Label>
            <Input id="pkg-down" inputMode="decimal" value={f.downloadMbps} onChange={(e) => set("downloadMbps", e.target.value)} placeholder="No limit" />
          </div>
          <div>
            <Label htmlFor="pkg-up">Upload speed (Mbps)</Label>
            <Input id="pkg-up" inputMode="decimal" value={f.uploadMbps} onChange={(e) => set("uploadMbps", e.target.value)} placeholder="No limit" />
          </div>
          <div>
            <Label htmlFor="pkg-devices">Devices per voucher</Label>
            <Input id="pkg-devices" inputMode="numeric" value={f.devices} onChange={(e) => set("devices", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pkg-app">What it unlocks</Label>
            <select id="pkg-app" className={selectClass} value={f.appPolicy} onChange={(e) => set("appPolicy", e.target.value as SocialAppPolicy)}>
              {APP_POLICY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-obsidian-800 p-4">
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={f.blockTethering} onChange={(e) => set("blockTethering", e.target.checked)} />
            <span>
              <span className="block text-sm font-medium text-slate-200">Block sharing over a phone hotspot</span>
              <span className="block text-xs text-slate-400">Stops one buyer re-sharing this package to other devices. Can also block legitimate travel routers.</span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={f.isPopular} onChange={(e) => set("isPopular", e.target.checked)} />
            <span className="block text-sm font-medium text-slate-200">Highlight on the portal</span>
          </label>
          {f.isPopular && (
            <div className="pl-7">
              <Label htmlFor="pkg-badge">Label</Label>
              <Input id="pkg-badge" value={f.badge} onChange={(e) => set("badge", e.target.value)} placeholder="Most popular" maxLength={24} />
            </div>
          )}
        </div>

        {error && <Notice tone="bad">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" className={darkButton("ghost")} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={darkButton("primary")} disabled={save.isPending}>
            {save.isPending ? "Saving…" : initial ? "Save changes" : "Add package"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function PackagesTab() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<HotspotPackage | "new" | null>(null);
  const [showAssistant, setShowAssistant] = useState(false);
  const { data: packages, isLoading } = useQuery({
    queryKey: PACKAGES_QUERY_KEY,
    queryFn: () => apiFetch<HotspotPackage[]>("/api/v1/vouchers/packages"),
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiFetch<HotspotPackage>(`/api/v1/vouchers/packages/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PACKAGES_QUERY_KEY }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/vouchers/packages/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PACKAGES_QUERY_KEY }),
  });

  const sorted = [...(packages ?? [])].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.priceMinor - b.priceMinor);

  return (
    <div className="space-y-6">
      <Panel
        title="Packages"
        description="What customers can buy on your hotspot. Switched-off packages stay here but don't show on the portal."
        padded={false}
        actions={
          <>
            <button type="button" className={darkButton("ghost", "sm")} onClick={() => setShowAssistant((v) => !v)}>
              {showAssistant ? "Hide assistant" : "Use the assistant"}
            </button>
            <button type="button" className={darkButton("primary", "sm")} onClick={() => setEditing("new")}>
              Add package
            </button>
          </>
        }
      >
        {(patch.error || remove.error) && (
          <div className="px-5 pt-4">
            <Notice tone="bad">{((patch.error || remove.error) as Error).message}</Notice>
          </div>
        )}
        {isLoading ? (
          <p className="px-5 py-8 text-sm text-slate-400">Loading packages…</p>
        ) : sorted.length === 0 ? (
          <EmptyState
            title="No packages yet"
            action={
              <button type="button" className={darkButton("primary", "sm")} onClick={() => setEditing("new")}>
                Add your first package
              </button>
            }
          >
            Customers see these on the Wi-Fi sign-in page and pay for them with M-Pesa.
          </EmptyState>
        ) : (
          <TableShell minWidth={820}>
            <thead>
              <tr>
                <th className={th}>Package</th>
                <th className={`${th} text-right`}>Price</th>
                <th className={th}>Lasts</th>
                <th className={th}>Speed</th>
                <th className={th}>Data</th>
                <th className={th}>Devices</th>
                <th className={th}>On portal</th>
                <th className={th}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((pkg) => {
                const app = getSocialAppMeta(pkg.appPolicy);
                return (
                  <tr key={pkg.id} className={pkg.isActive ? "" : "opacity-60"}>
                    <td className={td}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-white">{pkg.name}</span>
                        {pkg.isPopular && <Pill tone="good">{pkg.badge || "Popular"}</Pill>}
                      </div>
                      {(app.policy !== "ALL" || pkg.blockTethering) && (
                        <p className="mt-0.5 text-xs text-slate-500">
                          {[app.policy !== "ALL" ? app.name : null, pkg.blockTethering ? "No hotspot sharing" : null].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </td>
                    <td className={`${td} text-right font-medium tabular-nums text-white`}>{formatMoney(pkg.priceMinor, pkg.currency)}</td>
                    <td className={td}>{formatDuration(pkg.durationMinutes)}</td>
                    <td className={td}>
                      {formatSpeed(pkg.downloadKbps)}
                      {pkg.uploadKbps ? <span className="text-slate-500"> / {formatSpeed(pkg.uploadKbps)}</span> : null}
                    </td>
                    <td className={td}>{formatData(pkg.dataCapMb)}</td>
                    <td className={td}>{pkg.simultaneousUse ?? 1}</td>
                    <td className={td}>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={pkg.isActive}
                        aria-label={`Show ${pkg.name} on the portal`}
                        disabled={patch.isPending}
                        onClick={() => patch.mutate({ id: pkg.id, body: { isActive: !pkg.isActive } })}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${pkg.isActive ? "bg-emerald-600" : "bg-obsidian-700"}`}
                      >
                        <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${pkg.isActive ? "translate-x-4" : "translate-x-0.5"}`} />
                      </button>
                    </td>
                    <td className={`${td} text-right`}>
                      <div className="flex justify-end gap-1">
                        <button type="button" className={darkButton("ghost", "sm")} onClick={() => setEditing(pkg)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className={`${darkButton("ghost", "sm")} text-rose-300 hover:bg-rose-500/10 hover:text-rose-200`}
                          disabled={remove.isPending}
                          onClick={() => {
                            if (confirm(`Delete "${pkg.name}"? Vouchers already sold keep working.`)) remove.mutate(pkg.id);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}
      </Panel>

      {showAssistant && (
        <Panel title="Package assistant" description="Describe the packages you want in plain words, and it creates or edits them for you.">
          <PackageAssistantChat />
        </Panel>
      )}

      {editing && <PackageForm initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
