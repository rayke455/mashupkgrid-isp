"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";
import { tr } from "@/lib/tr";
import { useAuth } from "@/lib/auth-context";
import { describeAddOn } from "@/lib/addons";
import { EmptyState, Notice, PageHeader, Panel, Pill, Segmented, TableShell, darkButton, td, th } from "@/components/dashboard/surface";
import { Input, Label } from "@/components/ui";

/**
 * Prepaid add-ons PPPoE customers buy in their app with M-Pesa: a speed boost or extra data for
 * some hours. They start as soon as the payment lands and end by themselves.
 */

interface AddOn {
  id: string;
  name: string;
  kind: "SPEED" | "DATA";
  downloadKbps: number | null;
  uploadKbps: number | null;
  dataMb: number | null;
  durationHours: number;
  priceMinor: number;
  currency: string;
  isActive: boolean;
}

interface Purchase {
  id: string;
  name: string;
  status: "AWAITING_PAYMENT" | "ACTIVE" | "EXPIRED" | "CANCELLED";
  priceMinor: number;
  currency: string;
  requestedBy: string;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  customer: { id: string; fullName: string; customerNumber: string };
}


const STATUS_TONE = { ACTIVE: "good", AWAITING_PAYMENT: "warn", EXPIRED: "neutral", CANCELLED: "neutral" } as const;
const STATUS_LABEL = { ACTIVE: "Running", AWAITING_PAYMENT: "Awaiting payment", EXPIRED: "Ended", CANCELLED: "Cancelled" } as const;

export default function AddOnsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canManage = user?.permissions.includes("packages.manage") ?? false;
  const { data: addOns } = useQuery({ queryKey: ["addons"], queryFn: () => apiFetch<AddOn[]>("/api/v1/addons") });
  const { data: purchases } = useQuery({ queryKey: ["addon-purchases"], queryFn: () => apiFetch<Purchase[]>("/api/v1/addons/purchases"), refetchInterval: 60_000 });

  const [kind, setKind] = useState<"SPEED" | "DATA">("SPEED");
  const [name, setName] = useState("");
  const [down, setDown] = useState("20");
  const [up, setUp] = useState("10");
  const [gb, setGb] = useState("10");
  const [hours, setHours] = useState("24");
  const [price, setPrice] = useState("100");
  const [error, setError] = useState<string | null>(null);

  const onError = (err: unknown) => setError(err instanceof ApiRequestError ? err.message : tr("Something went wrong."));
  const refresh = () => {
    setError(null);
    void qc.invalidateQueries({ queryKey: ["addons"] });
  };

  const create = useMutation({
    mutationFn: () =>
      apiFetch<AddOn>("/api/v1/addons", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          kind,
          downloadKbps: kind === "SPEED" ? Math.round(Number(down) * 1000) : null,
          uploadKbps: kind === "SPEED" ? Math.round(Number(up) * 1000) : null,
          dataMb: kind === "DATA" ? Math.round(Number(gb) * 1024) : null,
          durationHours: Number(hours),
          priceMinor: Math.round(Number(price) * 100),
        }),
      }),
    onSuccess: () => {
      setName("");
      refresh();
    },
    onError,
  });
  const toggle = useMutation({
    mutationFn: (a: AddOn) => apiFetch(`/api/v1/addons/${a.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !a.isActive }) }),
    onSuccess: refresh,
    onError,
  });
  const remove = useMutation({
    mutationFn: (a: AddOn) => apiFetch(`/api/v1/addons/${a.id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  const sold = purchases?.filter((p) => p.status !== "AWAITING_PAYMENT" && p.priceMinor > 0) ?? [];
  const revenue = sold.reduce((s, p) => s + p.priceMinor, 0);

  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHeader
        title={tr("Add-ons")}
        description={tr("Speed boosts and extra data your PPPoE customers buy in their app with M-Pesa. Each one starts as soon as it is paid and ends by itself.")}
      />
      {error && <Notice tone="bad">{error}</Notice>}

      {canManage && (
        <Panel title={tr("New add-on")}>
          <form onSubmit={submit} className="space-y-4">
            <Segmented
              label={tr("Type")}
              value={kind}
              onChange={setKind}
              options={[
                { value: "SPEED", label: tr("Speed boost") },
                { value: "DATA", label: tr("Extra data") },
              ]}
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <Label htmlFor="ao-name">{tr("Name")}</Label>
                <Input id="ao-name" required maxLength={80} placeholder={kind === "SPEED" ? tr("Weekend boost 20 Mbps") : tr("10 GB top-up")} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              {kind === "SPEED" ? (
                <>
                  <div>
                    <Label htmlFor="ao-down">{tr("Download, Mbps")}</Label>
                    <Input id="ao-down" type="number" min={1} step="any" required value={down} onChange={(e) => setDown(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="ao-up">{tr("Upload, Mbps")}</Label>
                    <Input id="ao-up" type="number" min={1} step="any" required value={up} onChange={(e) => setUp(e.target.value)} />
                  </div>
                </>
              ) : (
                <div>
                  <Label htmlFor="ao-gb">{tr("Extra data, GB")}</Label>
                  <Input id="ao-gb" type="number" min={0.1} step="any" required value={gb} onChange={(e) => setGb(e.target.value)} />
                </div>
              )}
              <div>
                <Label htmlFor="ao-hours">{tr("Lasts, hours")}</Label>
                <Input id="ao-hours" type="number" min={1} max={744} required value={hours} onChange={(e) => setHours(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ao-price">{tr("Price")}</Label>
                <Input id="ao-price" type="number" min={0} step="any" required value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
            </div>
            {kind === "DATA" && <p className="text-xs text-slate-400">{tr("Extra data raises the plan's data cap while it runs, so the customer is not asked to upgrade.")}</p>}
            <button type="submit" className={darkButton("primary", "sm")} disabled={create.isPending || !name.trim()}>
              {create.isPending ? tr("Saving…") : tr("Add")}
            </button>
          </form>
        </Panel>
      )}

      <Panel title={tr("On offer")} padded={false}>
        {!addOns?.length ? (
          <EmptyState title={tr("No add-ons yet")}>{tr("Create a speed boost or data top-up above. Customers see active ones in their app.")}</EmptyState>
        ) : (
          <TableShell minWidth={640}>
            <thead>
              <tr>
                <th className={th}>{tr("Name")}</th>
                <th className={th}>{tr("What they get")}</th>
                <th className={`${th} text-right`}>{tr("Price")}</th>
                <th className={th}>{tr("Status")}</th>
                {canManage && <th className={th} />}
              </tr>
            </thead>
            <tbody>
              {addOns.map((a) => (
                <tr key={a.id}>
                  <td className={`${td} font-medium text-white`}>{a.name}</td>
                  <td className={td}>{describeAddOn(a)}</td>
                  <td className={`${td} text-right tabular-nums`}>{formatMoney(a.priceMinor, a.currency)}</td>
                  <td className={td}>
                    <Pill tone={a.isActive ? "good" : "neutral"}>{a.isActive ? tr("On sale") : tr("Hidden")}</Pill>
                  </td>
                  {canManage && (
                    <td className={`${td} text-right`}>
                      <button type="button" className={darkButton("ghost", "sm")} disabled={toggle.isPending} onClick={() => toggle.mutate(a)}>
                        {a.isActive ? tr("Hide") : tr("Put on sale")}
                      </button>
                      <button type="button" className={darkButton("ghost", "sm")} disabled={remove.isPending} onClick={() => confirm(`${tr("Delete")} ${a.name}?`) && remove.mutate(a)}>
                        {tr("Delete")}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Panel>

      <Panel title={tr("Recent purchases")} description={sold.length ? `${sold.length} ${tr("paid")} · ${formatMoney(revenue, sold[0]!.currency)}` : undefined} padded={false}>
        {!purchases?.length ? (
          <EmptyState title={tr("Nothing bought yet")} />
        ) : (
          <TableShell minWidth={720}>
            <thead>
              <tr>
                <th className={th}>{tr("Customer")}</th>
                <th className={th}>{tr("Add-on")}</th>
                <th className={th}>{tr("Status")}</th>
                <th className={th}>{tr("Ends")}</th>
                <th className={`${th} text-right`}>{tr("Price")}</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id}>
                  <td className={td}>
                    <a href={`/customers/${p.customer.id}`} className="text-white hover:underline">
                      {p.customer.fullName}
                    </a>
                    <span className="block text-xs text-slate-500">{p.customer.customerNumber}</span>
                  </td>
                  <td className={td}>{p.name}</td>
                  <td className={td}>
                    <Pill tone={STATUS_TONE[p.status]}>{tr(STATUS_LABEL[p.status])}</Pill>
                  </td>
                  <td className={`${td} tabular-nums`}>{p.endsAt ? new Date(p.endsAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                  <td className={`${td} text-right tabular-nums`}>{p.priceMinor > 0 ? formatMoney(p.priceMinor, p.currency) : tr("Free")}</td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Panel>
    </div>
  );
}
