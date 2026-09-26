"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { downloadFromApi } from "@/lib/download";
import { tr } from "@/lib/tr";
import { useAuth } from "@/lib/auth-context";
import { Notice, PageHeader, Panel, Segmented, darkButton } from "@/components/dashboard/surface";
import { Input, Label } from "@/components/ui";
import { IconDownload } from "@/components/icons";

/**
 * Accounting export: invoices, payments and customers for a period, as the import files Xero or
 * QuickBooks Online expect, so the ISP's accountant doesn't retype anything. The account and tax
 * codes the files use are set here once.
 */

type System = "xero" | "quickbooks";
type Kind = "contacts" | "invoices" | "payments";

interface Codes {
  salesAccountCode: string;
  taxType: string;
  noTaxType: string;
  itemName: string;
  taxCode: string;
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function monthRange(offset: number): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { from: ymd(first), to: ymd(offset === 0 ? now : last) };
}

const FILES: { kind: Kind; title: string; body: Record<System, string> }[] = [
  {
    kind: "contacts",
    title: "1. Customers",
    body: {
      xero: "Contacts > Import. Do this first, so invoices match existing contacts.",
      quickbooks: "Sales > Customers > New customer > Import customers. Do this first.",
    },
  },
  {
    kind: "invoices",
    title: "2. Invoices",
    body: {
      xero: "Business > Invoices > Import. Choose \"Tax exclusive\" amounts.",
      quickbooks: "Settings > Import data > Invoices. Pick the day/month/year date format.",
    },
  },
  {
    kind: "payments",
    title: "3. Payments",
    body: {
      xero: "Accounting > Bank accounts > your M-Pesa or bank account > Import a statement, then reconcile against the invoices.",
      quickbooks: "Transactions > Bank transactions > Upload from file, then match each line to its invoice.",
    },
  },
];

export default function AccountingPage() {
  const { user } = useAuth();
  const canManage = user?.permissions.includes("settings.manage") ?? false;
  const [system, setSystem] = useState<System>("xero");
  const [range, setRange] = useState(() => monthRange(-1));
  const [busy, setBusy] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(kind: Kind) {
    setBusy(kind);
    setError(null);
    try {
      await downloadFromApi(`/api/v1/accounting/export?system=${system}&kind=${kind}&from=${range.from}&to=${range.to}`, `${kind}-${system}.csv`);
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("Something went wrong."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHeader title={tr("Accounting export")} description={tr("Your invoices, payments and customers as import files for Xero or QuickBooks Online, so nothing is typed in twice.")} />

      <Panel>
        <div className="flex flex-wrap items-end gap-4">
          <Segmented
            label={tr("Accounting system")}
            value={system}
            onChange={setSystem}
            options={[
              { value: "xero", label: "Xero" },
              { value: "quickbooks", label: "QuickBooks Online" },
            ]}
          />
          <div className="flex gap-2">
            <button type="button" className={darkButton("ghost", "sm")} onClick={() => setRange(monthRange(0))}>
              {tr("This month")}
            </button>
            <button type="button" className={darkButton("ghost", "sm")} onClick={() => setRange(monthRange(-1))}>
              {tr("Last month")}
            </button>
          </div>
          <div>
            <Label htmlFor="acc-from">{tr("From")}</Label>
            <input id="acc-from" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className="rounded-lg border border-obsidian-700 bg-obsidian-950 px-2 py-1.5 text-sm text-slate-100" />
          </div>
          <div>
            <Label htmlFor="acc-to">{tr("To")}</Label>
            <input id="acc-to" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className="rounded-lg border border-obsidian-700 bg-obsidian-950 px-2 py-1.5 text-sm text-slate-100" />
          </div>
        </div>
      </Panel>

      {error && <Notice tone="bad">{error}</Notice>}

      <div className="grid gap-4 md:grid-cols-3">
        {FILES.map((f) => (
          <Panel key={f.kind} title={tr(f.title)}>
            <div className="space-y-4">
              <p className="text-sm text-slate-400">{tr(f.body[system])}</p>
              <button type="button" className={darkButton("primary", "sm")} disabled={busy !== null} onClick={() => download(f.kind)}>
                <IconDownload size={15} /> {busy === f.kind ? tr("Preparing…") : tr("Download CSV")}
              </button>
            </div>
          </Panel>
        ))}
      </div>
      <p className="text-xs text-slate-500">{tr("Customers are always the full list. Invoices are by the day they were issued; payments by the day they came in, with refunds as negative lines on the day they were made.")}</p>

      {canManage && <CodesSettings system={system} />}
    </div>
  );
}

function CodesSettings({ system }: { system: System }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["preferences"], queryFn: () => apiFetch<{ accounting: Codes } & Record<string, unknown>>("/api/v1/settings/preferences") });
  const [form, setForm] = useState<Codes | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (data && !form) setForm(data.accounting);
  }, [data, form]);
  const save = useMutation({
    mutationFn: () => apiFetch("/api/v1/settings/preferences", { method: "PUT", body: JSON.stringify({ ...data, accounting: form }) }),
    onSuccess: () => {
      setSaved(true);
      void qc.invalidateQueries({ queryKey: ["preferences"] });
    },
  });
  if (!form) return null;
  const field = (key: keyof Codes, label: string) => (
    <div key={key}>
      <Label htmlFor={`code-${key}`}>{label}</Label>
      <Input id={`code-${key}`} maxLength={100} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </div>
  );
  return (
    <Panel title={tr("Codes in your books")} description={tr("Use the names exactly as they appear in your accounting system, or the import will stop and ask.")}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(false);
          save.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {system === "xero"
            ? [field("salesAccountCode", tr("Sales account code")), field("taxType", tr("Tax rate for VAT lines")), field("noTaxType", tr("Tax rate for lines without VAT"))]
            : [field("itemName", tr("Product/service")), field("taxCode", tr("Tax code for VAT lines"))]}
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" className={darkButton("primary", "sm")} disabled={save.isPending}>
            {save.isPending ? tr("Saving…") : tr("Save")}
          </button>
          {saved && <span className="text-sm text-emerald-400">{tr("Saved")}</span>}
          {save.isError && <span className="text-sm text-rose-400">{save.error instanceof ApiRequestError ? save.error.message : tr("Something went wrong.")}</span>}
        </div>
      </form>
    </Panel>
  );
}
