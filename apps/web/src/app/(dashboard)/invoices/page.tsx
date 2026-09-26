"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { downloadFromApi } from "@/lib/download";
import { useLanguage } from "@/lib/language-context";
import { pageStrings } from "@/lib/page-strings";
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
  const { lang } = useLanguage();
  const t = pageStrings(lang).invoices;
  const c = pageStrings(lang).common;
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<"createdAt:desc" | "dueDate:asc" | "totalMinor:desc">("createdAt:desc");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const { data, isLoading } = useQuery({
    queryKey: ["invoices", "all", debounced, status, sort],
    queryFn: () => {
      const [sortBy, sortOrder] = sort.split(":");
      const params = new URLSearchParams({ limit: "50", sortBy: sortBy!, sortOrder: sortOrder! });
      if (debounced) params.set("search", debounced);
      if (status) params.set("status", status);
      return apiFetch<PaginatedInvoices>(`/api/v1/invoices?${params.toString()}`);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            {t.title}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t.description}
          </p>
        </div>
        <button
          type="button"
          onClick={() => downloadFromApi("/api/v1/invoices/export.csv", "invoices.csv").catch(() => {})}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-obsidian-700 dark:text-slate-200 dark:hover:bg-obsidian-900"
        >
          {t.exportCsv}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.searchPlaceholder}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-brand-500 dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-white sm:w-72"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-slate-200">
          <option value="">{t.allStatuses}</option>
          <option value="PENDING">{t.statusPending}</option>
          <option value="PARTIALLY_PAID">{t.statusPartlyPaid}</option>
          <option value="OVERDUE">{t.statusOverdue}</option>
          <option value="PAID">{t.statusPaid}</option>
          <option value="CANCELLED">{t.statusCancelled}</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-slate-200">
          <option value="createdAt:desc">{t.sortNewest}</option>
          <option value="dueDate:asc">{t.sortDueSoonest}</option>
          <option value="totalMinor:desc">{t.sortLargest}</option>
        </select>
      </div>

      {isLoading && <p className="text-sm text-slate-500">{t.loadingInvoices}</p>}

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
                      {c.due(new Date(invoice.dueDate).toLocaleDateString())}
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
            <h3 className="font-semibold text-slate-700 dark:text-slate-300">{t.noInvoices}</h3>
            <p className="text-xs text-slate-500 mt-1">{t.noInvoicesHint}</p>
          </div>
        )}
      </div>
    </div>
  );
}
