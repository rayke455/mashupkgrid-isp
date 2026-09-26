"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconClose } from "@/components/icons";

/**
 * Building blocks for the payment gateway screens. Quiet and dense on purpose: these are
 * screens people read numbers off, so type, alignment and state colours do the work — green for
 * money that arrived or was paid out, amber for money in motion, red for money that failed or went
 * back. Colour is never the only signal: every status also carries its word.
 */

// ---------------------------------------------------------------------------------------------
// Money & dates
// ---------------------------------------------------------------------------------------------

/** Integer cents → "KES 1,234.50". Never parse the result back. */
export function formatKes(minor: number | null | undefined, opts: { cents?: boolean } = {}): string {
  const value = minor ?? 0;
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  const whole = Math.floor(abs / 100).toLocaleString("en-KE");
  const cents = abs % 100;
  const showCents = opts.cents ?? cents !== 0;
  return `${sign}KES ${whole}${showCents ? `.${String(cents).padStart(2, "0")}` : ""}`;
}

export function Money({ minor, className = "", cents }: { minor: number | null | undefined; className?: string; cents?: boolean }) {
  return <span className={`tabular-nums ${className}`}>{formatKes(minor, { cents })}</span>;
}

const dtf = new Intl.DateTimeFormat("en-KE", {
  timeZone: "Africa/Nairobi",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const df = new Intl.DateTimeFormat("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", year: "numeric" });

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return dtf.format(new Date(value));
}
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return df.format(new Date(value));
}

export function percentFromBps(bps: number): string {
  return `${(bps / 100).toLocaleString("en-KE", { maximumFractionDigits: 2 })}%`;
}

// ---------------------------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------------------------

type Tone = "green" | "amber" | "red" | "blue" | "slate";

const TONE: Record<Tone, string> = {
  green: "bg-emerald-500/10 text-emerald-200 ring-emerald-500/30",
  amber: "bg-amber-500/10 text-amber-200 ring-amber-500/30",
  red: "bg-red-500/10 text-red-300 ring-red-500/30",
  blue: "bg-brand-500/10 text-brand-300 ring-brand-500/20",
  slate: "bg-obsidian-800 text-slate-300 ring-slate-500/20",
};

const STATUS: Record<string, { label: string; tone: Tone }> = {
  // gateway transactions
  COMPLETED: { label: "Completed", tone: "green" },
  PARTIALLY_REFUNDED: { label: "Partly refunded", tone: "amber" },
  REFUNDED: { label: "Refunded", tone: "red" },
  REVERSED: { label: "Reversed", tone: "red" },
  // transaction settlement
  UNSETTLED: { label: "Unsettled", tone: "slate" },
  SETTLEMENT_PENDING: { label: "Settlement pending", tone: "amber" },
  // settlements
  REQUESTED: { label: "Requested", tone: "amber" },
  AWAITING_APPROVAL: { label: "Awaiting approval", tone: "amber" },
  PROCESSING: { label: "Processing", tone: "blue" },
  SETTLED: { label: "Settled", tone: "green" },
  FAILED: { label: "Failed", tone: "red" },
  CANCELLED: { label: "Cancelled", tone: "slate" },
  // refunds
  PENDING_CUSTOMER_PAYOUT: { label: "Owed to customer", tone: "amber" },
  // destinations
  VERIFIED: { label: "Verified", tone: "green" },
  UNVERIFIED: { label: "Not yet verified", tone: "slate" },
  // webhooks
  RECEIVED: { label: "Received", tone: "blue" },
  PROCESSED: { label: "Processed", tone: "green" },
  DUPLICATE: { label: "Duplicate", tone: "slate" },
  IGNORED: { label: "Ignored", tone: "slate" },
  REJECTED: { label: "Rejected", tone: "red" },
  // stk
  PENDING: { label: "Pending", tone: "amber" },
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const meta = STATUS[status] ?? { label: status.replace(/_/g, " ").toLowerCase(), tone: "slate" as Tone };
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE[meta.tone]}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label ?? meta.label}
    </span>
  );
}

export function EnvironmentBadge({ environment }: { environment: "SANDBOX" | "PRODUCTION" | string }) {
  return environment === "PRODUCTION" ? (
    <span className="inline-flex items-center rounded-md bg-obsidian-800 px-2 py-0.5 text-xs font-medium text-slate-200 ring-1 ring-inset ring-obsidian-700">Live</span>
  ) : (
    <span className="inline-flex items-center rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-200 ring-1 ring-inset ring-amber-500/30">
      Sandbox (no real money)
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------------

export interface WorkspaceTab {
  href: string;
  label: string;
}

export const TENANT_TABS: WorkspaceTab[] = [
  { href: "/payments", label: "Overview" },
  { href: "/payments/transactions", label: "Transactions" },
  { href: "/payments/balance", label: "Balance" },
  { href: "/payments/settlements", label: "Settlements" },
  { href: "/payments/settings", label: "Payment Settings" },
];

export const PLATFORM_TABS: WorkspaceTab[] = [
  { href: "/admin/payments", label: "Overview" },
  { href: "/admin/payments/transactions", label: "Transactions" },
  { href: "/admin/payments/settlements", label: "Settlements" },
  { href: "/admin/payments/reconciliation", label: "Reconciliation" },
  { href: "/admin/payments/gateway", label: "Payment Gateway" },
  { href: "/admin/payments/fees", label: "Fees" },
  { href: "/admin/payments/webhooks", label: "Webhooks" },
];

/** The payments pages: a tabbed section in the dashboard's own dark style. */
export function PaymentsWorkspace({
  tabs,
  title,
  description,
  actions,
  children,
}: {
  tabs: WorkspaceTab[];
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const root = tabs[0]!.href;
  const isActive = (href: string) => (href === root ? pathname === root : pathname === href || pathname.startsWith(`${href}/`));

  // Same layout as every other dashboard page: title, then a tab row, then the content.
  return (
    <div className="space-y-6 text-slate-100">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
          {description && <div className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">{description}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </header>
      <nav aria-label="Payments" className="-mx-1 flex gap-1 overflow-x-auto border-b border-obsidian-800 px-1">
        {tabs.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                active ? "border-brand-500 text-white" : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-6">{children}</div>
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  padded = true,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-obsidian-800 bg-obsidian-900">
      {(title || actions) && (
        <div className="flex flex-col gap-3 border-b border-obsidian-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-white">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-slate-400">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

export function StatCard({
  label,
  value,
  hint,
  tone,
  loading,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "green" | "amber" | "red";
  loading?: boolean;
}) {
  const accent = tone === "green" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : tone === "red" ? "bg-red-500" : "bg-brand-600";
  return (
    <div className="relative overflow-hidden rounded-lg border border-obsidian-800 bg-obsidian-900 px-5 py-4">
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-0.5 ${accent}`} />
      <p className="text-sm text-slate-400">{label}</p>
      {loading ? (
        <div className="mt-2 h-7 w-32 animate-pulse rounded bg-obsidian-800" />
      ) : (
        <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-[-0.02em] text-white">{value}</p>
      )}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Buttons & fields
// ---------------------------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export function buttonClass(variant: ButtonVariant = "secondary", size: "sm" | "md" = "md"): string {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50";
  const sizes = { sm: "px-2.5 py-1.5 text-xs", md: "px-3.5 py-2 text-sm" };
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-brand-600 text-white shadow-sm hover:bg-brand-500",
    secondary: "border border-obsidian-700 bg-obsidian-900 text-slate-200 hover:bg-obsidian-950",
    danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
    ghost: "text-slate-400 hover:bg-obsidian-800 hover:text-slate-100",
  };
  return `${base} ${sizes[size]} ${variants[variant]}`;
}

export const inputClass =
  "w-full rounded-md border border-obsidian-700 bg-obsidian-900 px-3 py-2 text-sm text-slate-100 shadow-sm placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-obsidian-950 disabled:text-slate-400";

export function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-200">
        {label}
      </label>
      {children}
      {error ? <p className="mt-1.5 text-xs text-red-300">{error}</p> : hint ? <p className="mt-1.5 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

export function Alert({ tone = "red", title, children }: { tone?: "red" | "amber" | "green" | "blue"; title?: string; children?: ReactNode }) {
  const styles = {
    red: "border-red-500/30 bg-red-500/10 text-red-200",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    blue: "border-brand-500/30 bg-brand-500/10 text-brand-300",
  }[tone];
  return (
    <div role={tone === "red" ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm leading-6 ${styles}`}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Tables & states
// ---------------------------------------------------------------------------------------------

export function TableShell({ children, minWidth = 720 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export const th = "whitespace-nowrap border-b border-obsidian-800 bg-obsidian-950 px-4 py-2.5 text-xs font-medium text-slate-400";
export const td = "whitespace-nowrap border-b border-obsidian-800 px-4 py-3 text-slate-300";

export function LoadingRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }, (_, c) => (
            <td key={c} className={td}>
              <div className="h-4 animate-pulse rounded bg-obsidian-800" style={{ width: `${40 + ((r * 7 + c * 13) % 45)}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function EmptyRow({ cols, title, children }: { cols: number; title: string; children?: ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-14 text-center">
        <p className="text-sm font-medium text-slate-200">{title}</p>
        {children && <div className="mx-auto mt-1 max-w-md text-sm text-slate-400">{children}</div>}
      </td>
    </tr>
  );
}

export function ErrorRow({ cols, error, onRetry }: { cols: number; error: unknown; onRetry?: () => void }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-10 text-center">
        <p className="text-sm font-medium text-red-300">Couldn&apos;t load this list.</p>
        <p className="mt-1 text-sm text-slate-400">{error instanceof Error ? error.message : "Please try again."}</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className={`${buttonClass("secondary", "sm")} mt-3`}>
            Try again
          </button>
        )}
      </td>
    </tr>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-slate-400">
      <span className="tabular-nums">
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </span>
      <div className="flex gap-2">
        <button type="button" className={buttonClass("secondary", "sm")} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button type="button" className={buttonClass("secondary", "sm")} disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Drawer (details) & dialog (confirmations)
// ---------------------------------------------------------------------------------------------

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

export function Drawer({ open, onClose, title, subtitle, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  useEscape(open, onClose);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full w-full max-w-xl flex-col bg-obsidian-900 text-slate-100 shadow-lg outline-none"
      >
        <div className="flex items-start justify-between gap-4 border-b border-obsidian-800 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-lg font-semibold text-white">
              {title}
            </h2>
            {subtitle && <div className="mt-0.5 text-sm text-slate-400">{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close details" className="rounded-md p-1.5 text-slate-400 hover:bg-obsidian-800 hover:text-slate-100">
            <IconClose size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-obsidian-800 bg-obsidian-950 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Dialog({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer: ReactNode }) {
  useEscape(open, onClose);
  const titleId = useId();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative w-full max-w-md rounded-lg bg-obsidian-900 text-slate-100 shadow-lg">
        <div className="px-5 pt-5">
          <h2 id={titleId} className="text-base font-semibold text-white">
            {title}
          </h2>
          <div className="mt-3 space-y-4 text-sm text-slate-400">{children}</div>
        </div>
        <div className="mt-5 flex justify-end gap-2 border-t border-obsidian-800 bg-obsidian-950 px-5 py-3">{footer}</div>
      </div>
    </div>
  );
}

export function DetailList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-obsidian-800 rounded-lg border border-obsidian-800">
      {items.map((item) => (
        <div key={item.label} className="grid grid-cols-[140px_1fr] gap-3 px-4 py-2.5 text-sm">
          <dt className="text-slate-400">{item.label}</dt>
          <dd className="min-w-0 break-words text-slate-100">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LedgerTable({ entries }: { entries: { id: string; entryType: string; direction: "CREDIT" | "DEBIT"; amountMinor: number; description: string; createdAt: string }[] }) {
  if (entries.length === 0) return <p className="text-sm text-slate-400">No ledger entries.</p>;
  return (
    <div className="overflow-hidden rounded-lg border border-obsidian-800">
      <table className="w-full text-sm">
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-obsidian-800 last:border-0">
              <td className="px-3 py-2">
                <p className="text-slate-200">{ENTRY_LABEL[e.entryType] ?? e.entryType}</p>
                <p className="text-xs text-slate-400">{formatDateTime(e.createdAt)}</p>
              </td>
              <td className={`px-3 py-2 text-right font-medium tabular-nums ${e.direction === "CREDIT" ? "text-emerald-300" : "text-slate-100"}`}>
                {e.direction === "CREDIT" ? "+" : "−"} {formatKes(e.amountMinor)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const ENTRY_LABEL: Record<string, string> = {
  CUSTOMER_PAYMENT: "Customer payment",
  PLATFORM_FEE: "Platform fee",
  SETTLEMENT: "Settlement",
  SETTLEMENT_REVERSAL: "Settlement returned",
  PAYMENT_REVERSAL: "Payment reversal",
  FEE_REVERSAL: "Fee returned",
  REFUND: "Refund",
  ADJUSTMENT: "Adjustment",
};

export const CHANNEL_LABEL: Record<string, string> = {
  MPESA_STK: "M-Pesa STK",
  MPESA_C2B: "M-Pesa Paybill",
};

export const PROVIDER_LABEL: Record<string, string> = {
  MPESA_B2B: "M-Pesa B2B",
  MPESA_B2C: "M-Pesa B2C",
  MANUAL: "Manual transfer",
  SANDBOX: "Sandbox",
};

export const DESTINATION_LABEL: Record<string, string> = {
  MPESA_PHONE: "M-Pesa",
  BANK_ACCOUNT: "Bank account",
  TILL: "Till",
  PAYBILL: "Paybill",
};

/** Builds a URL query string, dropping empty values. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
  const s = search.toString();
  return s ? `?${s}` : "";
}
