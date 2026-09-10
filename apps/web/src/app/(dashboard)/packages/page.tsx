"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";
import { Button, Card, ErrorText, Input, Label, Badge, StatusDot } from "@/components/ui";
import { IconPackage, IconSpeed } from "@/components/icons";

interface Package {
  id: string;
  name: string;
  downloadKbps: number;
  uploadKbps: number;
  billingCycle: string;
  priceMinor: number;
  currency: string;
  isActive: boolean;
}

const BILLING_CYCLES = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const;

export default function PackagesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [downloadKbps, setDownloadKbps] = useState("10000");
  const [uploadKbps, setUploadKbps] = useState("5000");
  const [billingCycle, setBillingCycle] = useState<(typeof BILLING_CYCLES)[number]>("MONTHLY");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Edit Package Modal
  const [editingPackage, setEditingPackage] = useState<Package | null>(null);
  const [editName, setEditName] = useState("");
  const [editDownloadKbps, setEditDownloadKbps] = useState("10000");
  const [editUploadKbps, setEditUploadKbps] = useState("5000");
  const [editPrice, setEditPrice] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["packages"],
    queryFn: () => apiFetch<{ items: Package[] }>("/api/v1/packages?limit=100"),
  });

  const createPackage = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/packages", {
        method: "POST",
        body: JSON.stringify({
          name,
          downloadKbps: Number(downloadKbps),
          uploadKbps: Number(uploadKbps),
          billingCycle,
          priceMinor: Math.round(Number(price) * 100),
        }),
      }),
    onSuccess: () => {
      setName("");
      setPrice("");
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["packages"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to create package"),
  });

  const updatePackage = useMutation({
    mutationFn: () => {
      if (!editingPackage) return Promise.reject(new Error("No package selected"));
      return apiFetch(`/api/v1/packages/${editingPackage.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName.trim(),
          downloadKbps: Number(editDownloadKbps),
          uploadKbps: Number(editUploadKbps),
          priceMinor: Math.round(Number(editPrice) * 100),
        }),
      });
    },
    onSuccess: () => {
      setEditingPackage(null);
      queryClient.invalidateQueries({ queryKey: ["packages"] });
    },
    onError: (err) => setEditError(err instanceof ApiRequestError ? err.message : "Failed to update package"),
  });

  const togglePackageActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => {
      setTogglingId(id);
      return apiFetch(`/api/v1/packages/${id}/${isActive ? "activate" : "archive"}`, { method: "POST" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["packages"] }),
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to update package status"),
    onSettled: () => setTogglingId(null),
  });

  const openEditModal = (pkg: Package) => {
    setEditingPackage(pkg);
    setEditName(pkg.name);
    setEditDownloadKbps(String(pkg.downloadKbps));
    setEditUploadKbps(String(pkg.uploadKbps));
    setEditPrice(String(pkg.priceMinor / 100));
    setEditError(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/15 text-brand-600 dark:text-brand-400">
              <IconPackage size={20} />
            </span>
            Bandwidth Packages &amp; Plans
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Define PPPoE speed tiers, rate limits, and recurring subscription billing cycles.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "+ New Package"}
        </Button>
      </div>

      {showForm && (
        <Card className="border-brand-500/40 bg-brand-50/20 dark:bg-brand-950/20">
          <h2 className="font-semibold text-slate-900 dark:text-white mb-3">Create Broadband Plan</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              createPackage.mutate();
            }}
            className="grid grid-cols-1 sm:grid-cols-3 gap-4"
          >
            <div>
              <Label htmlFor="name">Package Name</Label>
              <Input id="name" placeholder="e.g. Fiber Premium 20Mbps" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="downloadKbps">Download Speed (Kbps)</Label>
              <Input
                id="downloadKbps"
                type="number"
                placeholder="20000"
                value={downloadKbps}
                onChange={(e) => setDownloadKbps(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="uploadKbps">Upload Speed (Kbps)</Label>
              <Input
                id="uploadKbps"
                type="number"
                placeholder="10000"
                value={uploadKbps}
                onChange={(e) => setUploadKbps(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="billingCycle">Billing Frequency</Label>
              <select
                id="billingCycle"
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm outline-none focus:border-brand-500 dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-slate-100"
                value={billingCycle}
                onChange={(e) => setBillingCycle(e.target.value as (typeof BILLING_CYCLES)[number])}
              >
                {BILLING_CYCLES.map((cycle) => (
                  <option key={cycle} value={cycle}>
                    {cycle}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="price">Price (KES, e.g. 2500.00)</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                placeholder="2500.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </div>
            <div className="sm:col-span-3 pt-2">
              <Button type="submit" disabled={createPackage.isPending}>
                {createPackage.isPending ? "Creating package..." : "Publish Package"}
              </Button>
            </div>
          </form>
          {error && <ErrorText>{error}</ErrorText>}
        </Card>
      )}

      {isLoading && <p className="text-sm text-slate-500">Loading packages...</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data?.items.map((pkg) => (
          <Card key={pkg.id} hover={true} className="flex flex-col justify-between p-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  {pkg.name}
                </h3>
                <Badge variant={pkg.isActive ? "success" : "neutral"}>
                  <StatusDot status={pkg.isActive ? "ACTIVE" : "UNKNOWN"} />
                  <span>{pkg.isActive ? "Active" : "Archived"}</span>
                </Badge>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono text-slate-600 dark:text-slate-400 mb-4">
                <IconSpeed size={16} className="text-brand-600" />
                <span>↓ {pkg.downloadKbps / 1000} Mbps · ↑ {pkg.uploadKbps / 1000} Mbps</span>
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-obsidian-800 pt-3 flex items-baseline justify-between">
              <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
                {pkg.billingCycle}
              </span>
              <span className="font-mono text-lg font-bold text-slate-900 dark:text-white">
                {formatMoney(pkg.priceMinor, pkg.currency)}
              </span>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="secondary"
                className="w-1/2 py-1.5 text-xs font-semibold"
                onClick={() => openEditModal(pkg)}
              >
                ✏️ Edit
              </Button>
              <button
                type="button"
                onClick={() => {
                  if (
                    pkg.isActive &&
                    !confirm(
                      `Cancel "${pkg.name}"? It will no longer be offered for new subscriptions. Customers already on it are unaffected until reassigned.`
                    )
                  ) {
                    return;
                  }
                  togglePackageActive.mutate({ id: pkg.id, isActive: !pkg.isActive });
                }}
                disabled={togglingId === pkg.id}
                className={`w-1/2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                  pkg.isActive
                    ? "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/20"
                    : "border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-900/40 dark:text-emerald-400 dark:hover:bg-emerald-950/20"
                }`}
              >
                {togglingId === pkg.id ? "Updating..." : pkg.isActive ? "Cancel" : "Reactivate"}
              </button>
            </div>
          </Card>
        ))}

        {data && data.items.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-obsidian-800">
            <IconPackage size={32} className="mx-auto text-slate-400 mb-2" />
            <h3 className="font-semibold text-slate-700 dark:text-slate-300">No packages defined</h3>
            <p className="text-xs text-slate-500 mt-1">Create your first bandwidth subscription plan above.</p>
          </div>
        )}
      </div>

      {/* EDIT BROADBAND PACKAGE MODAL */}
      {editingPackage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <Card className="w-full max-w-lg bg-white dark:bg-obsidian-900 border-brand-500/40 shadow-2xl p-6 relative">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-obsidian-800 pb-4 mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>✏️</span> Edit Broadband Plan: {editingPackage.name}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Update speed tiers and monthly pricing.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingPackage(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg font-bold p-1 rounded-md"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setEditError(null);
                updatePackage.mutate();
              }}
              className="space-y-4"
            >
              <div>
                <Label htmlFor="editName">Package Name</Label>
                <Input
                  id="editName"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Fiber Premium 20Mbps"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="editDownloadKbps">Download Speed (Kbps)</Label>
                  <Input
                    id="editDownloadKbps"
                    type="number"
                    value={editDownloadKbps}
                    onChange={(e) => setEditDownloadKbps(e.target.value)}
                    placeholder="20000"
                    required
                  />
                  <span className="text-[11px] text-slate-500">
                    {editDownloadKbps ? `${Math.round(Number(editDownloadKbps) / 1000)} Mbps` : ""}
                  </span>
                </div>

                <div>
                  <Label htmlFor="editUploadKbps">Upload Speed (Kbps)</Label>
                  <Input
                    id="editUploadKbps"
                    type="number"
                    value={editUploadKbps}
                    onChange={(e) => setEditUploadKbps(e.target.value)}
                    placeholder="10000"
                    required
                  />
                  <span className="text-[11px] text-slate-500">
                    {editUploadKbps ? `${Math.round(Number(editUploadKbps) / 1000)} Mbps` : ""}
                  </span>
                </div>
              </div>

              <div>
                <Label htmlFor="editPrice">Price (KES)</Label>
                <Input
                  id="editPrice"
                  type="number"
                  step="any"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  placeholder="2500.00"
                  required
                />
              </div>

              {editError && <ErrorText>{editError}</ErrorText>}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-obsidian-800">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditingPackage(null)}
                  disabled={updatePackage.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updatePackage.isPending}>
                  {updatePackage.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
