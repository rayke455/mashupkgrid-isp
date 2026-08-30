"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { formatMoney } from "@/lib/money";
import { Button, Card, ErrorText, HintText, Input, Label, Badge, StatusDot } from "@/components/ui";
import { IconCheck, IconCopy, IconTicket } from "@/components/icons";
import { THEME_CATALOG, type ThemeId } from "@/components/hotspot/themes";
import { PackageAssistantChat } from "@/components/hotspot/package-assistant-chat";
import { CaptivePortalEmbedStudio } from "@/components/hotspot/captive-portal-embed-studio";

interface HotspotPackage {
  id: string;
  name: string;
  description: string | null;
  priceMinor: number;
  currency: string;
  durationMinutes: number;
  dataCapMb: number | null;
  downloadKbps: number | null;
  uploadKbps: number | null;
  isPopular?: boolean;
  badge?: string | null;
  isActive: boolean;
}

interface Voucher {
  id: string;
  code: string;
  hotspotPackageId: string | null;
  hotspotPackage?: HotspotPackage | null;
  status: "UNUSED" | "ACTIVE" | "EXPIRED" | "USED";
  durationMinutes: number | null;
  dataCapMb: number | null;
  downloadKbps: number | null;
  uploadKbps: number | null;
  expiresAt: string | null;
  createdAt: string;
}

type TabMode = "vouchers" | "packages" | "themes" | "customers";

interface HotspotPurchase {
  method: "MPESA" | "PAYSTACK";
  contact: string | null;
  amountMinor: number;
  currency: string;
  packageName: string | null;
  voucherCode: string | null;
  receiptNumber: string | null;
  paidAt: string;
  voucherStatus: "UNUSED" | "ACTIVE" | "EXPIRED" | "USED" | null;
  dataCapMb: number | null;
  bytesIn: number | null;
  bytesOut: number | null;
  usageUpdatedAt: string | null;
  expiresAt: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} mins`;
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  if (hours < 24) return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours} Hour${hours > 1 ? "s" : ""}`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days} Day${days > 1 ? "s" : ""}`;
}

export default function VouchersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabMode>("vouchers");
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [showPackageForm, setShowPackageForm] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [vouchersToPrint, setVouchersToPrint] = useState<Voucher[]>([]);

  // Batch Generation Form
  const [selectedPackageId, setSelectedPackageId] = useState<string>("custom");
  const [count, setCount] = useState("10");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [dataCapMb, setDataCapMb] = useState("");
  const [downloadSpeed, setDownloadSpeed] = useState("");
  const [uploadSpeed, setUploadSpeed] = useState("");
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [lastBatch, setLastBatch] = useState<Voucher[] | null>(null);

  // Package Creation Form
  const [pkgName, setPkgName] = useState("");
  const [pkgPrice, setPkgPrice] = useState("");
  const [pkgDuration, setPkgDuration] = useState("60");
  const [pkgDataCap, setPkgDataCap] = useState("");
  const [pkgDownload, setPkgDownload] = useState("5000");
  const [pkgUpload, setPkgUpload] = useState("2000");
  const [pkgIsPopular, setPkgIsPopular] = useState(false);
  const [pkgBadge, setPkgBadge] = useState("MOST POPULAR");
  const [packageError, setPackageError] = useState<string | null>(null);

  const [urlCopied, setUrlCopied] = useState(false);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  useEffect(() => {
    if (user?.tenantSlug) setPortalUrl(`${window.location.origin}/hotspot/${user.tenantSlug}`);
  }, [user?.tenantSlug]);

  // Queries
  const { data: vouchersData, isLoading: isLoadingVouchers } = useQuery({
    queryKey: ["vouchers"],
    queryFn: () => apiFetch<{ items: Voucher[] }>("/api/v1/vouchers?limit=100"),
  });

  const { data: packages, isLoading: isLoadingPackages } = useQuery({
    queryKey: ["hotspot-packages-staff"],
    queryFn: () => apiFetch<HotspotPackage[]>("/api/v1/vouchers/packages"),
  });

  const { data: purchases, isLoading: isLoadingPurchases } = useQuery({
    queryKey: ["hotspot-purchases"],
    queryFn: () => apiFetch<HotspotPurchase[]>("/api/v1/vouchers/purchases"),
    enabled: activeTab === "customers",
  });

  // When package dropdown changes in voucher generator
  useEffect(() => {
    if (selectedPackageId !== "custom" && packages) {
      const pkg = packages.find((p) => p.id === selectedPackageId);
      if (pkg) {
        setDurationMinutes(String(pkg.durationMinutes));
        setDataCapMb(pkg.dataCapMb ? String(pkg.dataCapMb) : "");
        setDownloadSpeed(pkg.downloadKbps ? String(pkg.downloadKbps) : "");
        setUploadSpeed(pkg.uploadKbps ? String(pkg.uploadKbps) : "");
      }
    }
  }, [selectedPackageId, packages]);

  // Mutations
  const generate = useMutation({
    mutationFn: () =>
      apiFetch<Voucher[]>("/api/v1/vouchers", {
        method: "POST",
        body: JSON.stringify({
          count: Number(count),
          hotspotPackageId: selectedPackageId === "custom" ? undefined : selectedPackageId,
          durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
          dataCapMb: dataCapMb ? Number(dataCapMb) : undefined,
          downloadKbps: downloadSpeed ? Number(downloadSpeed) : undefined,
          uploadKbps: uploadSpeed ? Number(uploadSpeed) : undefined,
        }),
      }),
    onSuccess: (vouchers) => {
      setLastBatch(vouchers);
      setShowGenerateForm(false);
      queryClient.invalidateQueries({ queryKey: ["vouchers"] });
    },
    onError: (err) =>
      setGenerateError(err instanceof ApiRequestError ? err.message : "Failed to generate vouchers"),
  });

  const createPackage = useMutation({
    mutationFn: () =>
      apiFetch<HotspotPackage>("/api/v1/vouchers/packages", {
        method: "POST",
        body: JSON.stringify({
          name: pkgName,
          priceMinor: Math.round(Number(pkgPrice) * 100),
          durationMinutes: Number(pkgDuration),
          dataCapMb: pkgDataCap ? Number(pkgDataCap) : undefined,
          downloadKbps: pkgDownload ? Number(pkgDownload) : undefined,
          uploadKbps: pkgUpload ? Number(pkgUpload) : undefined,
          isPopular: pkgIsPopular,
          badge: pkgIsPopular && pkgBadge ? pkgBadge : undefined,
        }),
      }),
    onSuccess: () => {
      setPkgName("");
      setPkgPrice("");
      setPkgIsPopular(false);
      setShowPackageForm(false);
      queryClient.invalidateQueries({ queryKey: ["hotspot-packages-staff"] });
    },
    onError: (err) =>
      setPackageError(err instanceof ApiRequestError ? err.message : "Failed to create package"),
  });

  const togglePackage = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiFetch<HotspotPackage>(`/api/v1/vouchers/packages/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hotspot-packages-staff"] }),
  });

  const togglePopular = useMutation({
    mutationFn: ({ id, isPopular, badge }: { id: string; isPopular: boolean; badge?: string }) =>
      apiFetch<HotspotPackage>(`/api/v1/vouchers/packages/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isPopular, badge: isPopular ? (badge || "MOST POPULAR") : null }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hotspot-packages-staff"] }),
  });

  const openPrintModal = (vouchers: Voucher[]) => {
    setVouchersToPrint(vouchers);
    setShowPrintModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400">
              🎫
            </span>
            Hotspot Vouchers, Plans &amp; Themes
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manage captive portal Wi-Fi plans, generate tickets, select themes, and print retail vouchers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === "vouchers" ? (
            <>
              {vouchersData && vouchersData.items.length > 0 && (
                <Button
                  variant="secondary"
                  onClick={() => openPrintModal(vouchersData.items.filter((v) => v.status === "UNUSED"))}
                >
                  Print Unused Vouchers
                </Button>
              )}
              <Button onClick={() => setShowGenerateForm((v) => !v)}>
                {showGenerateForm ? "Cancel" : "+ Generate Batch"}
              </Button>
            </>
          ) : activeTab === "packages" ? (
            <Button onClick={() => setShowPackageForm((v) => !v)}>
              {showPackageForm ? "Cancel" : "+ New Hotspot Plan"}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-obsidian-800">
        <button
          type="button"
          onClick={() => setActiveTab("vouchers")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "vouchers"
              ? "border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400"
          }`}
        >
          Vouchers List ({vouchersData?.items.length ?? 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("packages")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "packages"
              ? "border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400"
          }`}
        >
          Hotspot Plans ({packages?.length ?? 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("customers")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "customers"
              ? "border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400"
          }`}
        >
          Customers Who Paid ({purchases?.length ?? 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("themes")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "themes"
              ? "border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400"
          }`}
        >
          📱 Captive Portal Studio &amp; Ads
        </button>
      </div>

      {/* Captive Portal URL Callout */}
      {portalUrl && (
        <Card className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Your Captive Portal URL
            </p>
            <p className="mt-0.5 font-mono text-sm text-slate-700 dark:text-slate-300">{portalUrl}</p>
            <p className="mt-1 text-xs text-slate-500">
              Customers redirected here can enter codes or buy packages directly with M-Pesa.
            </p>
          </div>
          <Button
            variant="secondary"
            className="shrink-0 gap-1.5 px-3 py-1.5 text-xs"
            onClick={() => {
              navigator.clipboard.writeText(portalUrl);
              setUrlCopied(true);
              setTimeout(() => setUrlCopied(false), 2000);
            }}
          >
            {urlCopied ? <IconCheck size={12} /> : <IconCopy size={12} />}
            <span>{urlCopied ? "Copied!" : "Copy URL"}</span>
          </Button>
        </Card>
      )}

      {/* TAB 1: VOUCHERS LIST */}
      {activeTab === "vouchers" && (
        <div className="space-y-6">
          {/* Generate Form */}
          {showGenerateForm && (
            <Card className="border-purple-500/40 bg-purple-50/20 dark:bg-purple-950/20">
              <h2 className="font-semibold text-slate-900 dark:text-white mb-3">Generate Voucher Batch</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setGenerateError(null);
                  generate.mutate();
                }}
                className="grid grid-cols-1 sm:grid-cols-3 gap-4"
              >
                <div>
                  <Label htmlFor="packageSelect">Link to Hotspot Plan</Label>
                  <select
                    id="packageSelect"
                    value={selectedPackageId}
                    onChange={(e) => setSelectedPackageId(e.target.value)}
                    className="w-full mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-obsidian-700 dark:bg-obsidian-900 dark:text-white"
                  >
                    <option value="custom">Custom Parameters</option>
                    {packages?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({formatMoney(p.priceMinor, p.currency)} - {formatDuration(p.durationMinutes)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label htmlFor="count">Quantity</Label>
                  <Input
                    id="count"
                    type="number"
                    min="1"
                    max="500"
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="durationMinutes">Duration (Minutes)</Label>
                  <Input
                    id="durationMinutes"
                    type="number"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="dataCapMb">Data Cap (MB, Optional)</Label>
                  <Input
                    id="dataCapMb"
                    type="number"
                    placeholder="e.g. 1024"
                    value={dataCapMb}
                    onChange={(e) => setDataCapMb(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="downloadSpeed">Download Speed (Kbps)</Label>
                  <Input
                    id="downloadSpeed"
                    type="number"
                    placeholder="e.g. 5000 for 5Mbps"
                    value={downloadSpeed}
                    onChange={(e) => setDownloadSpeed(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="uploadSpeed">Upload Speed (Kbps)</Label>
                  <Input
                    id="uploadSpeed"
                    type="number"
                    placeholder="e.g. 2000 for 2Mbps"
                    value={uploadSpeed}
                    onChange={(e) => setUploadSpeed(e.target.value)}
                  />
                </div>

                <div className="sm:col-span-3 pt-2 flex items-center justify-between">
                  <Button type="submit" disabled={generate.isPending}>
                    {generate.isPending ? "Generating FreeRADIUS tickets..." : "Generate Voucher Batch"}
                  </Button>
                </div>
              </form>
              {generateError && <ErrorText>{generateError}</ErrorText>}
            </Card>
          )}

          {/* Last Batch Generated Callout */}
          {lastBatch && (
            <Card className="border-purple-500/50 bg-gradient-to-br from-purple-50/60 to-white dark:from-purple-950/40 dark:to-obsidian-900">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="font-semibold text-slate-900 dark:text-white">
                    Generated {lastBatch.length} Vouchers Successfully
                  </h2>
                  <p className="text-xs text-slate-500">Ready for distribution or retail printing.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => openPrintModal(lastBatch)}>
                    🖨️ Print Slips
                  </Button>
                  <Button
                    variant="secondary"
                    className="px-3 py-1.5 text-xs"
                    onClick={() => {
                      navigator.clipboard.writeText(lastBatch.map((v) => v.code).join("\n"));
                      alert("Voucher codes copied!");
                    }}
                  >
                    Copy Codes
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2 font-mono text-sm">
                {lastBatch.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-center rounded-lg border border-purple-200 bg-white px-3 py-2 text-center font-bold tracking-wider text-purple-900 shadow-2xs dark:border-purple-900/60 dark:bg-obsidian-950 dark:text-purple-300"
                  >
                    {v.code}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {isLoadingVouchers && (
            <div className="py-8 text-center text-sm text-slate-500">Loading vouchers...</div>
          )}

          {/* Grid of Vouchers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {vouchersData?.items.map((voucher) => {
              const badgeVariant =
                voucher.status === "ACTIVE"
                  ? "success"
                  : voucher.status === "UNUSED"
                  ? "neutral"
                  : voucher.status === "EXPIRED"
                  ? "danger"
                  : "neutral";

              return (
                <Card key={voucher.id} className="p-4 hover:border-slate-300 dark:hover:border-obsidian-700">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-base font-bold tracking-wider text-slate-900 dark:text-white">
                      {voucher.code}
                    </span>
                    <Badge variant={badgeVariant}>
                      <StatusDot status={voucher.status} pulse={voucher.status === "ACTIVE"} />
                      <span>{voucher.status}</span>
                    </Badge>
                  </div>

                  {voucher.hotspotPackage && (
                    <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 mt-1">
                      {voucher.hotspotPackage.name}
                    </p>
                  )}

                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 dark:border-obsidian-800 pt-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>{voucher.durationMinutes ? formatDuration(voucher.durationMinutes) : "Unlimited"}</span>
                    <span>{voucher.downloadKbps ? `${Math.round(voucher.downloadKbps / 1000)} Mbps` : "Uncapped"}</span>
                    <span>{voucher.dataCapMb ? `${voucher.dataCapMb} MB` : "No limit"}</span>
                  </div>
                </Card>
              );
            })}

            {vouchersData && vouchersData.items.length === 0 && (
              <div className="col-span-full rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-obsidian-800">
                <IconTicket size={32} className="mx-auto text-slate-400 mb-2" />
                <h3 className="font-semibold text-slate-700 dark:text-slate-300">No vouchers generated</h3>
                <p className="text-xs text-slate-500 mt-1">Generate your first batch of hotspot vouchers above.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: HOTSPOT PLANS */}
      {activeTab === "packages" && (
        <div className="space-y-6">
          <PackageAssistantChat />

          {showPackageForm && (
            <Card className="border-purple-500/40 bg-purple-50/20 dark:bg-purple-950/20">
              <h2 className="font-semibold text-slate-900 dark:text-white mb-3">Create Hotspot Plan</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setPackageError(null);
                  createPackage.mutate();
                }}
                className="grid grid-cols-1 sm:grid-cols-3 gap-4"
              >
                <div>
                  <Label htmlFor="pkgName">Plan Name</Label>
                  <Input
                    id="pkgName"
                    placeholder="e.g. 1 Hour Unlimited"
                    value={pkgName}
                    onChange={(e) => setPkgName(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="pkgPrice">Price (KES)</Label>
                  <Input
                    id="pkgPrice"
                    type="number"
                    placeholder="20"
                    value={pkgPrice}
                    onChange={(e) => setPkgPrice(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="pkgDuration">Duration (Minutes)</Label>
                  <Input
                    id="pkgDuration"
                    type="number"
                    placeholder="60"
                    value={pkgDuration}
                    onChange={(e) => setPkgDuration(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="pkgDownload">Download Speed (Kbps)</Label>
                  <Input
                    id="pkgDownload"
                    type="number"
                    placeholder="5000 for 5Mbps"
                    value={pkgDownload}
                    onChange={(e) => setPkgDownload(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="pkgUpload">Upload Speed (Kbps)</Label>
                  <Input
                    id="pkgUpload"
                    type="number"
                    placeholder="2000 for 2Mbps"
                    value={pkgUpload}
                    onChange={(e) => setPkgUpload(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="pkgDataCap">Data Cap (MB, Optional)</Label>
                  <Input
                    id="pkgDataCap"
                    type="number"
                    placeholder="e.g. 1000 for 1GB"
                    value={pkgDataCap}
                    onChange={(e) => setPkgDataCap(e.target.value)}
                  />
                </div>

                <div className="sm:col-span-3 rounded-xl bg-purple-500/10 border border-purple-500/30 p-3.5 space-y-2">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pkgIsPopular}
                      onChange={(e) => setPkgIsPopular(e.target.checked)}
                      className="rounded text-purple-600 focus:ring-purple-500 h-4 w-4"
                    />
                    <span>⭐ Highlight as &quot;Most Popular&quot; / &quot;Best Value&quot; on Portal</span>
                  </label>
                  {pkgIsPopular && (
                    <div className="pt-1">
                      <Label htmlFor="pkgBadge" className="text-[11px] text-slate-500">
                        Custom Badge Text (e.g. MOST POPULAR, BEST VALUE, HOT DEAL)
                      </Label>
                      <Input
                        id="pkgBadge"
                        value={pkgBadge}
                        onChange={(e) => setPkgBadge(e.target.value)}
                        placeholder="MOST POPULAR"
                        className="mt-0.5 max-w-xs text-xs font-bold"
                      />
                    </div>
                  )}
                </div>

                <div className="sm:col-span-3 pt-2">
                  <Button type="submit" disabled={createPackage.isPending}>
                    {createPackage.isPending ? "Creating Plan..." : "Save Hotspot Plan"}
                  </Button>
                </div>
              </form>
              {packageError && <ErrorText>{packageError}</ErrorText>}
            </Card>
          )}

          {isLoadingPackages && (
            <div className="py-8 text-center text-sm text-slate-500">Loading hotspot plans...</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {packages?.map((pkg) => (
              <Card
                key={pkg.id}
                className={`p-5 flex flex-col justify-between relative transition-all ${
                  pkg.isPopular
                    ? "border-amber-400/80 shadow-amber-500/10 ring-1 ring-amber-400/40"
                    : ""
                }`}
              >
                {pkg.isPopular && (
                  <div className="absolute -top-2.5 right-4 z-10 rounded-full bg-gradient-to-r from-red-600 via-orange-500 to-amber-500 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-md">
                    🔥 {pkg.badge || "MOST POPULAR"}
                  </div>
                )}
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-base text-slate-900 dark:text-white">{pkg.name}</h3>
                    <Badge variant={pkg.isActive ? "success" : "neutral"}>
                      {pkg.isActive ? "Active" : "Disabled"}
                    </Badge>
                  </div>

                  <div className="text-2xl font-extrabold text-purple-600 dark:text-purple-400 mt-2">
                    {formatMoney(pkg.priceMinor, pkg.currency)}
                  </div>

                  <div className="mt-3 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Validity:</span>
                      <span className="font-semibold">{formatDuration(pkg.durationMinutes)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Speed:</span>
                      <span className="font-semibold">
                        {pkg.downloadKbps ? `${Math.round(pkg.downloadKbps / 1000)} Mbps` : "Uncapped"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Data Limit:</span>
                      <span className="font-semibold">{pkg.dataCapMb ? `${pkg.dataCapMb} MB` : "Unlimited"}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-obsidian-800 flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="secondary"
                      className="px-2.5 py-1 text-xs"
                      onClick={() => togglePackage.mutate({ id: pkg.id, isActive: !pkg.isActive })}
                    >
                      {pkg.isActive ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      variant={pkg.isPopular ? "secondary" : "ghost"}
                      className={`px-2 py-1 text-[11px] ${
                        pkg.isPopular
                          ? "text-amber-600 dark:text-amber-400 font-bold"
                          : "text-slate-400 hover:text-amber-500"
                      }`}
                      onClick={() =>
                        togglePopular.mutate({
                          id: pkg.id,
                          isPopular: !pkg.isPopular,
                          badge: !pkg.isPopular ? "MOST POPULAR" : undefined,
                        })
                      }
                    >
                      {pkg.isPopular ? "★ Popular" : "☆ Feature"}
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    className="px-2.5 py-1 text-xs"
                    onClick={() => {
                      setSelectedPackageId(pkg.id);
                      setActiveTab("vouchers");
                      setShowGenerateForm(true);
                    }}
                  >
                    + Codes
                  </Button>
                </div>
              </Card>
            ))}

            {packages && packages.length === 0 && (
              <div className="col-span-full rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-obsidian-800">
                <div className="text-3xl mx-auto mb-2">📦</div>
                <h3 className="font-semibold text-slate-700 dark:text-slate-300">No hotspot plans defined</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Create pricing tiers (e.g. 1 Hour @ KES 20, 24 Hours @ KES 50) for your customers.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: CAPTIVE PORTAL STUDIO & AD MONETIZATION */}
      {activeTab === "themes" && (
        <CaptivePortalEmbedStudio
          initialBrandName="Commercial ISP High-Speed Wi-Fi"
          tenantSlug={user?.tenantSlug ?? "demo"}
        />
      )}

      {/* TAB 4: CUSTOMERS WHO PAID */}
      {activeTab === "customers" && (
        <div className="space-y-4">
          {isLoadingPurchases && (
            <div className="py-8 text-center text-sm text-slate-500">Loading purchases...</div>
          )}

          {purchases && purchases.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-obsidian-800">
              <p className="font-semibold text-slate-700 dark:text-slate-300">No completed purchases yet</p>
              <p className="text-xs text-slate-500 mt-1">
                M-Pesa and Paystack purchases show up here once payment completes.
              </p>
            </div>
          )}

          {purchases && purchases.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-obsidian-800">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-obsidian-900 text-left text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Paid</th>
                    <th className="px-4 py-2.5">Contact</th>
                    <th className="px-4 py-2.5">Package</th>
                    <th className="px-4 py-2.5">Amount</th>
                    <th className="px-4 py-2.5">Method</th>
                    <th className="px-4 py-2.5">Voucher</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Data Used / Cap</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-obsidian-800">
                  {purchases.map((p, i) => {
                    const usedBytes = (p.bytesIn ?? 0) + (p.bytesOut ?? 0);
                    const capBytes = p.dataCapMb ? p.dataCapMb * 1024 * 1024 : null;
                    return (
                      <tr key={`${p.receiptNumber ?? i}-${p.voucherCode ?? i}`}>
                        <td className="px-4 py-2.5 whitespace-nowrap text-xs text-slate-500">
                          {new Date(p.paidAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs">{p.contact ?? "—"}</td>
                        <td className="px-4 py-2.5">{p.packageName ?? "—"}</td>
                        <td className="px-4 py-2.5 font-semibold">{formatMoney(p.amountMinor, p.currency)}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant={p.method === "MPESA" ? "success" : "info"}>{p.method}</Badge>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs">{p.voucherCode ?? "—"}</td>
                        <td className="px-4 py-2.5">
                          {p.voucherStatus ? (
                            <Badge
                              variant={
                                p.voucherStatus === "ACTIVE"
                                  ? "success"
                                  : p.voucherStatus === "EXPIRED"
                                    ? "danger"
                                    : "neutral"
                              }
                            >
                              {p.voucherStatus}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          {p.usageUpdatedAt ? (
                            <span className="font-mono">
                              {formatBytes(usedBytes)}
                              {capBytes ? ` / ${formatBytes(capBytes)}` : ""}
                            </span>
                          ) : (
                            <span className="text-slate-400">Not reported yet</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* PRINT MODAL (Supports browser window.print() formatting) */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-obsidian-950">
            <div className="flex items-center justify-between border-b pb-4 dark:border-obsidian-800 print:hidden">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Print Voucher Cards ({vouchersToPrint.length} vouchers)
                </h2>
                <p className="text-xs text-slate-500">Retail printable cards layout.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={() => window.print()} className="bg-purple-600 hover:bg-purple-700">
                  🖨️ Print Now
                </Button>
                <Button variant="secondary" onClick={() => setShowPrintModal(false)}>
                  Close
                </Button>
              </div>
            </div>

            {/* Print Sheet Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-6 print:grid-cols-3 print:gap-3 print:pt-0">
              {vouchersToPrint.map((v) => (
                <div
                  key={v.id}
                  className="rounded-xl border-2 border-dashed border-purple-300 bg-purple-50/30 p-4 text-center dark:border-purple-900/60 dark:bg-obsidian-900 print:border-black print:bg-white print:p-3"
                >
                  <div className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300 print:text-black">
                    {user?.tenantSlug ? `${user.tenantSlug.toUpperCase()} WI-FI` : "HOTSPOT WI-FI"}
                  </div>
                  <div className="mt-2 rounded-lg bg-white py-2 px-1 font-mono text-xl font-extrabold tracking-widest text-slate-900 border border-purple-200 dark:border-purple-900/50 dark:bg-obsidian-950 dark:text-white print:border-black print:text-black">
                    {v.code}
                  </div>
                  <div className="mt-2 text-xs font-semibold text-slate-700 dark:text-slate-200 print:text-black">
                    {v.hotspotPackage?.name ||
                      `${v.durationMinutes ? formatDuration(v.durationMinutes) : "Unlimited"}`}
                  </div>
                  {v.hotspotPackage?.priceMinor && (
                    <div className="text-sm font-bold text-purple-700 dark:text-purple-300 print:text-black">
                      {formatMoney(v.hotspotPackage.priceMinor, v.hotspotPackage.currency)}
                    </div>
                  )}
                  <p className="mt-2 text-[10px] text-slate-400 print:text-slate-600">
                    Connect to WiFi &bull; Enter Code &bull; Enjoy
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

