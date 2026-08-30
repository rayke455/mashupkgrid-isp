"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";
import { Card, Badge, StatusDot } from "@/components/ui";
import { IconInvoice, IconArrowRight } from "@/components/icons";

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  totalMinor: number;
  amountPaidMinor: number;
  currency: string;
  dueDate: string;
}

interface PaginatedInvoices {
  items: Invoice[];
}

export default function InvoicesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["invoices", "all"],
    queryFn: () => apiFetch<PaginatedInvoices>("/api/v1/invoices?limit=50&sortBy=createdAt&sortOrder=desc"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400">
              <IconInvoice size={20} />
            </span>
            Invoices &amp; Ledger
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Automated subscription billing, tax calculations, and payment tracking.
          </p>
        </div>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading invoices...</p>}

      <div className="space-y-3">
        {data?.items.map((invoice) => {
          const badgeVariant =
            invoice.status === "PAID"
              ? "success"
              : invoice.status === "PENDING" || invoice.status === "PARTIALLY_PAID"
              ? "warning"
              : invoice.status === "OVERDUE"
              ? "danger"
              : "neutral";

          return (
            <Link key={invoice.id} href={`/invoices/${invoice.id}`} className="block">
              <Card hover={true} className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-obsidian-800 dark:text-slate-300">
                    <IconInvoice size={20} />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white font-mono">
                      {invoice.invoiceNumber}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Due {new Date(invoice.dueDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                      {formatMoney(invoice.amountPaidMinor, invoice.currency)} /{" "}
                      {formatMoney(invoice.totalMinor, invoice.currency)}
                    </p>
                    <Badge variant={badgeVariant} className="mt-1">
                      <StatusDot status={invoice.status} pulse={invoice.status === "PENDING"} />
                      <span>{invoice.status}</span>
                    </Badge>
                  </div>
                  <IconArrowRight size={16} className="text-slate-400" />
                </div>
              </Card>
            </Link>
          );
        })}

        {data && data.items.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-obsidian-800">
            <IconInvoice size={32} className="mx-auto text-slate-400 mb-2" />
            <h3 className="font-semibold text-slate-700 dark:text-slate-300">No invoices found</h3>
            <p className="text-xs text-slate-500 mt-1">Invoices will appear when subscribers are billed.</p>
          </div>
        )}
      </div>
    </div>
  );
}
