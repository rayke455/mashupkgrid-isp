"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";
import { Input, Label } from "@/components/ui";
import { EmptyState, Notice, Panel, Pill, Segmented, TableShell, darkButton, td, th } from "@/components/dashboard/surface";
import type { SocialAppPolicy } from "@/components/hotspot/themes";
import {
  APP_POLICY_OPTIONS,
  PACKAGES_QUERY_KEY,
  VOUCHERS_QUERY_KEY,
  VOUCHER_STATUS,
  formatDuration,
  printVouchers,
  type HotspotPackage,
  type Voucher,
} from "./shared";
import { tr } from "@/lib/tr";

const selectClass =
  "w-full rounded-lg border border-slate-300/90 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-slate-100";

type StatusFilter = "ALL" | Voucher["status"];

export function VouchersTab({ brand }: { brand: string }) {
  const queryClient = useQueryClient();
  const { data: packages } = useQuery({
    queryKey: PACKAGES_QUERY_KEY,
    queryFn: () => apiFetch<HotspotPackage[]>("/api/v1/vouchers/packages"),
  });
  const { data: vouchersData, isLoading } = useQuery({
    queryKey: VOUCHERS_QUERY_KEY,
    queryFn: () => apiFetch<{ items: Voucher[] }>("/api/v1/vouchers?limit=100"),
  });

  // Batch form
  const [packageId, setPackageId] = useState<string>("");
  const [count, setCount] = useState("10");
  const [minutes, setMinutes] = useState("60");
  const [dataCap, setDataCap] = useState("");
  const [downMbps, setDownMbps] = useState("");
  const [upMbps, setUpMbps] = useState("");
  const [devices, setDevices] = useState("1");
  const [appPolicy, setAppPolicy] = useState<SocialAppPolicy>("ALL");
  const [error, setError] = useState<string | null>(null);
  const [lastBatch, setLastBatch] = useState<Voucher[] | null>(null);
  const [copied, setCopied] = useState(false);

  const activePackages = (packages ?? []).filter((p) => p.isActive);
  const chosen = activePackages.find((p) => p.id === packageId) ?? null;
  const usingPackage = packageId !== "custom" && chosen !== null;
  // Default the form to the first on-sale package once packages load.
  const firstActiveId = activePackages[0]?.id;
  useEffect(() => {
    if (packageId === "" && firstActiveId) setPackageId(firstActiveId);
  }, [packageId, firstActiveId]);

  const extend = useMutation({
    mutationFn: ({ code, minutes }: { code: string; minutes: number }) =>
      apiFetch<Voucher>(`/api/v1/vouchers/${encodeURIComponent(code)}/extend`, { method: "POST", body: JSON.stringify({ minutes }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: VOUCHERS_QUERY_KEY }),
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Could not extend this voucher"),
  });
  const askExtend = (code: string) => {
    const answer = window.prompt(`Add how many hours to ${code}? (decimals allowed, e.g. 0.5)`, "1");
    if (answer === null) return;
    const hours = Number(answer);
    if (!Number.isFinite(hours) || hours <= 0) {
      setError("Enter a number of hours greater than 0.");
      return;
    }
    extend.mutate({ code, minutes: Math.max(5, Math.round(hours * 60)) });
  };

  const generate = useMutation({
    mutationFn: () =>
      apiFetch<Voucher[]>("/api/v1/vouchers", {
        method: "POST",
        body: JSON.stringify(
          usingPackage
            ? {
                count: Number(count),
                hotspotPackageId: chosen!.id,
                durationMinutes: chosen!.durationMinutes,
                dataCapMb: chosen!.dataCapMb ?? undefined,
                downloadKbps: chosen!.downloadKbps ?? undefined,
                uploadKbps: chosen!.uploadKbps ?? undefined,
                simultaneousUse: chosen!.simultaneousUse ?? 1,
                appPolicy: chosen!.appPolicy || "ALL",
              }
            : {
                count: Number(count),
                durationMinutes: minutes ? Number(minutes) : undefined,
                dataCapMb: dataCap ? Number(dataCap) : undefined,
                downloadKbps: downMbps ? Math.round(Number(downMbps) * 1000) : undefined,
                uploadKbps: upMbps ? Math.round(Number(upMbps) * 1000) : undefined,
                simultaneousUse: devices ? Number(devices) : undefined,
                appPolicy,
              }
        ),
      }),
    onSuccess: (vouchers) => {
      setLastBatch(vouchers);
      queryClient.invalidateQueries({ queryKey: VOUCHERS_QUERY_KEY });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Couldn't create the vouchers."),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const n = Number(count);
    if (!(n >= 1 && n <= 500)) return setError("Make between 1 and 500 vouchers at a time.");
    if (!usingPackage && !(Number(minutes) > 0)) return setError("Enter how many minutes each voucher lasts.");
    generate.mutate();
  };

  // List
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const vouchers = useMemo(() => {
    const q = search.trim().toUpperCase();
    return (vouchersData?.items ?? []).filter((v) => (filter === "ALL" || v.status === filter) && (!q || v.code.includes(q)));
  }, [vouchersData, filter, search]);
  const unused = (vouchersData?.items ?? []).filter((v) => v.status === "UNUSED");

  return (
    <div className="space-y-6">
      <Panel title={tr("Make vouchers")} description={tr("Printable codes you sell for cash. Each one works once, for the time and limits below.")}>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label htmlFor="v-package">{tr("Based on")}</Label>
              <select id="v-package" className={selectClass} value={packageId} onChange={(e) => setPackageId(e.target.value)}>
                {activePackages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {formatMoney(p.priceMinor, p.currency)} · {formatDuration(p.durationMinutes)}
                  </option>
                ))}
                <option value="custom">{tr("Custom limits (no package)")}</option>
              </select>
            </div>
            <div>
              <Label htmlFor="v-count">{tr("How many")}</Label>
              <Input id="v-count" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
            </div>
          </div>

          {!usingPackage && (
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="v-min">{tr("Lasts (minutes)")}</Label>
                <Input id="v-min" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="v-data">{tr("Data limit (MB)")}</Label>
                <Input id="v-data" inputMode="numeric" value={dataCap} onChange={(e) => setDataCap(e.target.value)} placeholder={tr("Unlimited")} />
              </div>
              <div>
                <Label htmlFor="v-dev">{tr("Devices")}</Label>
                <Input id="v-dev" inputMode="numeric" value={devices} onChange={(e) => setDevices(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="v-down">{tr("Download (Mbps)")}</Label>
                <Input id="v-down" inputMode="decimal" value={downMbps} onChange={(e) => setDownMbps(e.target.value)} placeholder={tr("No limit")} />
              </div>
              <div>
                <Label htmlFor="v-up">{tr("Upload (Mbps)")}</Label>
                <Input id="v-up" inputMode="decimal" value={upMbps} onChange={(e) => setUpMbps(e.target.value)} placeholder={tr("No limit")} />
              </div>
              <div>
                <Label htmlFor="v-app">{tr("Unlocks")}</Label>
                <select id="v-app" className={selectClass} value={appPolicy} onChange={(e) => setAppPolicy(e.target.value as SocialAppPolicy)}>
                  {APP_POLICY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {error && <Notice tone="bad">{error}</Notice>}
          <div className="flex justify-end">
            <button type="submit" className={darkButton("primary")} disabled={generate.isPending}>
              {generate.isPending ? "Making vouchers…" : `Make ${Number(count) > 0 ? Number(count) : ""} voucher${Number(count) === 1 ? "" : "s"}`}
            </button>
          </div>
        </form>

        {lastBatch && lastBatch.length > 0 && (
          <div className="mt-5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium text-emerald-200">
                {lastBatch.length} voucher{lastBatch.length === 1 ? "" : "s"} ready
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={darkButton("secondary", "sm")}
                  onClick={() => {
                    void navigator.clipboard.writeText(lastBatch.map((v) => v.code).join("\n"));
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? "Copied" : "Copy codes"}
                </button>
                <button type="button" className={darkButton("primary", "sm")} onClick={() => printVouchers(lastBatch, brand)}>
                  {tr("Print")}
                </button>
              </div>
            </div>
            <p className="mt-2 break-words font-mono text-sm text-emerald-100">{lastBatch.map((v) => v.code).join("  ")}</p>
          </div>
        )}
      </Panel>

      <Panel
        title={tr("All vouchers")}
        description={tr("The latest 100.")}
        padded={false}
        actions={
          unused.length > 0 && (
            <button type="button" className={darkButton("secondary", "sm")} onClick={() => printVouchers(unused, brand)}>
              Print unused ({unused.length})
            </button>
          )
        }
      >
        <div className="flex flex-col gap-3 border-b border-obsidian-800 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <Segmented
            label={tr("Status")}
            value={filter}
            onChange={setFilter}
            options={[
              { value: "ALL", label: "All" },
              { value: "UNUSED", label: "Unused" },
              { value: "ACTIVE", label: "In use" },
              { value: "USED", label: "Used up" },
              { value: "EXPIRED", label: "Expired" },
            ]}
          />
          <input
            type="search"
            placeholder={tr("Find a code")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-obsidian-700 bg-obsidian-950 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-brand-500 focus:outline-none sm:w-56"
          />
        </div>
        {isLoading ? (
          <p className="px-5 py-8 text-sm text-slate-400">{tr("Loading vouchers…")}</p>
        ) : vouchers.length === 0 ? (
          <EmptyState title={vouchersData?.items.length ? "No vouchers match" : "No vouchers yet"}>
            {vouchersData?.items.length ? "Try another filter or code." : "Make a batch above to sell Wi-Fi for cash."}
          </EmptyState>
        ) : (
          <TableShell minWidth={640}>
            <thead>
              <tr>
                <th className={th}>{tr("Code")}</th>
                <th className={th}>{tr("Package")}</th>
                <th className={th}>{tr("Status")}</th>
                <th className={th}>{tr("Expires")}</th>
                <th className={th}>{tr("Made")}</th>
                <th className={`${th} text-right`}>
                  <span className="sr-only">{tr("Actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map((v) => (
                <tr key={v.id}>
                  <td className={`${td} font-mono text-[13px] font-medium tracking-wider text-white`}>{v.code}</td>
                  <td className={td}>{v.hotspotPackage?.name ?? formatDuration(v.durationMinutes)}</td>
                  <td className={td}>
                    <Pill tone={VOUCHER_STATUS[v.status].tone}>{VOUCHER_STATUS[v.status].label}</Pill>
                  </td>
                  <td className={`${td} text-slate-400`}>{v.expiresAt ? new Date(v.expiresAt).toLocaleString() : "—"}</td>
                  <td className={`${td} text-slate-400`}>{new Date(v.createdAt).toLocaleDateString()}</td>
                  <td className={`${td} text-right`}>
                    {v.status !== "USED" && (
                      <button type="button" onClick={() => askExtend(v.code)} disabled={extend.isPending} className={darkButton("ghost", "sm")}>
                        {tr("Add time")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Panel>
    </div>
  );
}
