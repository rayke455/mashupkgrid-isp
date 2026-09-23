"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconClose } from "@/components/icons";

/**
 * Building blocks for the payment gateway screens. Light, quiet and dense on purpose: these are
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
  green: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/25",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  blue: "bg-blue-50 text-blue-800 ring-blue-600/20",
  slate: "bg-slate-100 text-slate-700 ring-slate-500/20",
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
    <span className="inline-flex items-center rounded-md bg-slate-900 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">Production</span>
  ) : (
    <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-900 ring-1 ring-inset ring-amber-600/30">
      Sandbox — no real money
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

/** The light payments workspace inside the (dark) dashboard shell. */
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

  return (
    <div className="force-light -mx-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-slate-900 shadow-sm sm:mx-0">
      <div className="border-b border-slate-200 bg-white">
        <nav aria-label="Payments" className="flex gap-1 overflow-x-auto px-3 pt-3 sm:px-6">
          {tabs.map((tab) => {
            const active = isActive(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`relative shrink-0 whitespace-nowrap rounded-t-md px-3 pb-3 pt-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  active ? "text-slate-950" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {tab.label}
                {active && <span aria-hidden="true" className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-blue-700" />}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-slate-950">{title}</h1>
            {description && <div className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{description}</div>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
        </header>
        <div className="space-y-6">{children}</div>
      </div>
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
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white">
      {(title || actions) && (
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-slate-950">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
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
  const accent = tone === "green" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : tone === "red" ? "bg-red-500" : "bg-blue-600";
  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white px-5 py-4">
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-0.5 ${accent}`} />
      <p className="text-sm text-slate-500">{label}</p>
      {loading ? (
        <div className="mt-2 h-7 w-32 animate-pulse rounded bg-slate-100" />
      ) : (
        <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-[-0.02em] text-slate-950">{value}</p>
      )}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Buttons & fields
// ---------------------------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export function buttonClass(variant: ButtonVariant = "secondary", size: "sm" | "md" = "md"): string {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50";
  const sizes = { sm: "px-2.5 py-1.5 text-xs", md: "px-3.5 py-2 text-sm" };
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-blue-700 text-white shadow-sm hover:bg-blue-800",
    secondary: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
    danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
    ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  };
  return `${base} ${sizes[size]} ${variants[variant]}`;
}

export const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 disabled:bg-slate-50 disabled:text-slate-500";

export function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-800">
        {label}
      </label>
      {children}
      {error ? <p className="mt-1.5 text-xs text-red-700">{error}</p> : hint ? <p className="mt-1.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Alert({ tone = "red", title, children }: { tone?: "red" | "amber" | "green" | "blue"; title?: string; children?: ReactNode }) {
  const styles = {
    red: "border-red-200 bg-red-50 text-red-900",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    green: "border-emerald-200 bg-emerald-50 text-emerald-950",
    blue: "border-blue-200 bg-blue-50 text-blue-950",
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

export const th = "whitespace-nowrap border-b border-slate-200 bg-slate-50/80 px-4 py-2.5 text-xs font-medium text-slate-500";
export const td = "whitespace-nowrap border-b border-slate-100 px-4 py-3 text-slate-700";

export function LoadingRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }, (_, c) => (
            <td key={c} className={td}>
              <div className="h-4 animate-pulse rounded bg-slate-100" style={{ width: `${40 + ((r * 7 + c * 13) % 45)}%` }} />
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
        <p className="text-sm font-medium text-slate-800">{title}</p>
        {children && <div className="mx-auto mt-1 max-w-md text-sm text-slate-500">{children}</div>}
      </td>
    </tr>
  );
}

export function ErrorRow({ cols, error, onRetry }: { cols: number; error: unknown; onRetry?: () => void }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-10 text-center">
        <p className="text-sm font-medium text-red-700">Couldn&apos;t load this list.</p>
        <p className="mt-1 text-sm text-slate-500">{error instanceof Error ? error.message : "Please try again."}</p>
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
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-slate-600">
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
    <div className="force-light fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-950/40" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full w-full max-w-xl flex-col bg-white text-slate-900 shadow-2xl outline-none"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-lg font-semibold text-slate-950">
              {title}
            </h2>
            {subtitle && <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close details" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
            <IconClose size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Dialog({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer: ReactNode }) {
  useEscape(open, onClose);
  const titleId = useId();
  if (!open) return null;
  return (
    <div className="force-light fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-950/45" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative w-full max-w-md rounded-lg bg-white text-slate-900 shadow-2xl">
        <div className="px-5 pt-5">
          <h2 id={titleId} className="text-base font-semibold text-slate-950">
            {title}
          </h2>
          <div className="mt-3 space-y-4 text-sm text-slate-600">{children}</div>
        </div>
        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">{footer}</div>
      </div>
    </div>
  );
}

export function DetailList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200">
      {items.map((item) => (
        <div key={item.label} className="grid grid-cols-[140px_1fr] gap-3 px-4 py-2.5 text-sm">
          <dt className="text-slate-500">{item.label}</dt>
          <dd className="min-w-0 break-words text-slate-900">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LedgerTable({ entries }: { entries: { id: string; entryType: string; direction: "CREDIT" | "DEBIT"; amountMinor: number; description: string; createdAt: string }[] }) {
  if (entries.length === 0) return <p className="text-sm text-slate-500">No ledger entries.</p>;
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-slate-100 last:border-0">
              <td className="px-3 py-2">
                <p className="text-slate-800">{ENTRY_LABEL[e.entryType] ?? e.entryType}</p>
                <p className="text-xs text-slate-500">{formatDateTime(e.createdAt)}</p>
              </td>
              <td className={`px-3 py-2 text-right font-medium tabular-nums ${e.direction === "CREDIT" ? "text-emerald-700" : "text-slate-900"}`}>
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
