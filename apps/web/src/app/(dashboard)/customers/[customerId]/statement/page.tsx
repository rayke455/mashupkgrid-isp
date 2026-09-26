"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";

/**
 * A customer statement the ISP can print or save as PDF from the browser: every invoice and
 * payment, running balance, and the ISP's branding. Styled for paper (white, black text) and
 * shown the same way on screen so what you see is what prints.
 */

interface Customer {
  fullName: string;
  customerNumber: string;
  phone: string;
  email: string | null;
  address?: string | null;
}
interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  totalMinor: number;
  amountPaidMinor: number;
  currency: string;
  issuedAt: string;
  dueDate: string;
}
interface Payment {
  id: string;
  amountMinor: number;
  currency: string;
  method: string;
  reference: string | null;
  createdAt: string;
  status: string;
}
interface Settings {
  name: string;
  logoUrl: string | null;
  platformUrl: string;
}

type Line = { date: string; description: string; debitMinor: number; creditMinor: number; currency: string };

export default function CustomerStatementPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const { data: customer } = useQuery({ queryKey: ["customer", customerId], queryFn: () => apiFetch<Customer>(`/api/v1/customers/${customerId}`) });
  const { data: invoices } = useQuery({ queryKey: ["invoices", customerId, "statement"], queryFn: () => apiFetch<{ items: Invoice[] }>(`/api/v1/invoices?customerId=${customerId}&limit=100&sortBy=createdAt&sortOrder=asc`) });
  const { data: payments } = useQuery({ queryKey: ["payments", customerId, "statement"], queryFn: () => apiFetch<{ items: Payment[] }>(`/api/v1/payments?customerId=${customerId}&limit=100`) });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: () => apiFetch<Settings>("/api/v1/settings") });

  if (!customer || !invoices || !payments) return <p className="text-sm text-slate-400">Preparing statement…</p>;

  const lines: Line[] = [
    ...invoices.items.filter((i) => i.status !== "CANCELLED").map((i) => ({ date: i.issuedAt, description: `Invoice ${i.invoiceNumber}`, debitMinor: i.totalMinor, creditMinor: 0, currency: i.currency })),
    ...payments.items.filter((p) => p.status === "COMPLETED").map((p) => ({ date: p.createdAt, description: `Payment · ${p.method.replace("_", " ").toLowerCase()}${p.reference ? ` · ${p.reference}` : ""}`, debitMinor: 0, creditMinor: p.amountMinor, currency: p.currency })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const currency = lines[0]?.currency ?? "KES";
  let running = 0;
  const rows = lines.map((l) => {
    running += l.debitMinor - l.creditMinor;
    return { ...l, balanceMinor: running };
  });
  const totalInvoiced = lines.reduce((s, l) => s + l.debitMinor, 0);
  const totalPaid = lines.reduce((s, l) => s + l.creditMinor, 0);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <p className="text-sm text-slate-400">Use your browser&rsquo;s print dialog to print or save as PDF.</p>
        <button type="button" onClick={() => window.print()} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500">
          Print / Save as PDF
        </button>
      </div>

      <article className="rounded-xl bg-white p-8 text-slate-900 shadow-sm [color-scheme:light] print:rounded-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
          <div className="flex items-center gap-3">
            {settings?.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- tenant logo URL, any host
              <img src={settings.logoUrl} alt="" className="h-12 w-12 object-contain" />
            )}
            <div>
              <p className="text-lg font-semibold">{settings?.name ?? "Statement"}</p>
              <p className="text-xs text-slate-500">{settings?.platformUrl}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold">Statement of account</p>
            <p className="text-xs text-slate-500">Prepared {new Date().toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
        </header>

        <section className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer</p>
            <p className="mt-1 font-medium">{customer.fullName}</p>
            <p className="text-sm text-slate-600">Account {customer.customerNumber}</p>
            <p className="text-sm text-slate-600">{customer.phone}</p>
            {customer.email && <p className="text-sm text-slate-600">{customer.email}</p>}
            {customer.address && <p className="text-sm text-slate-600">{customer.address}</p>}
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Summary</p>
            <dl className="mt-1 space-y-0.5 text-sm">
              <div className="flex justify-between sm:justify-end sm:gap-6">
                <dt className="text-slate-600">Total invoiced</dt>
                <dd className="tabular-nums">{formatMoney(totalInvoiced, currency)}</dd>
              </div>
              <div className="flex justify-between sm:justify-end sm:gap-6">
                <dt className="text-slate-600">Total paid</dt>
                <dd className="tabular-nums">{formatMoney(totalPaid, currency)}</dd>
              </div>
              <div className="flex justify-between font-semibold sm:justify-end sm:gap-6">
                <dt>Balance due</dt>
                <dd className="tabular-nums">{formatMoney(Math.max(0, running), currency)}</dd>
              </div>
            </dl>
          </div>
        </section>

        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3">Date</th>
              <th className="py-2 pr-3">Description</th>
              <th className="py-2 pr-3 text-right">Invoiced</th>
              <th className="py-2 pr-3 text-right">Paid</th>
              <th className="py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-500">
                  No invoices or payments yet.
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-2 pr-3 whitespace-nowrap text-slate-600">{new Date(r.date).toLocaleDateString()}</td>
                <td className="py-2 pr-3">{r.description}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{r.debitMinor ? formatMoney(r.debitMinor, r.currency) : ""}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{r.creditMinor ? formatMoney(r.creditMinor, r.currency) : ""}</td>
                <td className="py-2 text-right tabular-nums">{formatMoney(r.balanceMinor, r.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <footer className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-500">
          Amounts in {currency}. A positive balance is owed by the customer. Questions about this statement: contact {settings?.name ?? "your provider"}.
        </footer>
      </article>
    </div>
  );
}
