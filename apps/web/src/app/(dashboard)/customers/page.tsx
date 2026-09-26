"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { useLanguage } from "@/lib/language-context";
import { pageStrings } from "@/lib/page-strings";
import { downloadFromApi } from "@/lib/download";
import { Button, Card, ErrorText, Input, Label, Badge, StatusDot } from "@/components/ui";
import { IconUsers, IconArrowRight } from "@/components/icons";

interface Customer {
  id: string;
  customerNumber: string;
  fullName: string;
  phone: string;
  email: string | null;
  status: string;
  createdAt: string;
}

interface PaginatedCustomers {
  items: Customer[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const { lang } = useLanguage();
  const t = pageStrings(lang).customers;
  const c = pageStrings(lang).common;
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const { data, isLoading } = useQuery({
    queryKey: ["customers", debounced, status],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "50" });
      if (debounced) params.set("search", debounced);
      if (status) params.set("status", status);
      return apiFetch<PaginatedCustomers>(`/api/v1/customers?${params.toString()}`);
    },
  });

  const createCustomer = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/customers", {
        method: "POST",
        body: JSON.stringify({ fullName, phone, email: email || undefined }),
      }),
    onSuccess: () => {
      setFullName("");
      setPhone("");
      setEmail("");
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : t.createFailed),
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
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="text-xs"
            onClick={() => downloadFromApi("/api/v1/customers/export.csv", "customers.csv").catch((e) => setError(e instanceof Error ? e.message : t.exportFailed))}
          >
            {t.exportCustomers}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="text-xs"
            onClick={() => downloadFromApi("/api/v1/payments/export.csv", "payments.csv").catch((e) => setError(e instanceof Error ? e.message : t.exportFailed))}
          >
            {t.exportPayments}
          </Button>
          <Link href="/reports">
            <Button variant="secondary" size="sm" className="text-xs">
              {t.reports}
            </Button>
          </Link>
          <Button onClick={() => setShowForm((v) => !v)}>
            {showForm ? c.cancel : t.newSubscriber}
          </Button>
        </div>
      </div>

      {showForm && (
        <Card className="border-brand-500/40 bg-brand-50/20 dark:bg-brand-950/20">
          <h2 className="font-semibold text-slate-900 dark:text-white mb-3">{t.registerTitle}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              createCustomer.mutate();
            }}
            className="grid grid-cols-1 sm:grid-cols-3 gap-4"
          >
            <div>
              <Label htmlFor="fullName">{t.fullName}</Label>
              <Input id="fullName" placeholder="Jane Doe" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="phone">{t.phoneMpesa}</Label>
              <Input id="phone" placeholder="0712345678" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="email">{t.emailOptional}</Label>
              <Input id="email" type="email" placeholder="jane@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="sm:col-span-3 pt-2">
              <Button type="submit" disabled={createCustomer.isPending}>
                {createCustomer.isPending ? t.registering : t.createAccount}
              </Button>
            </div>
          </form>
          {error && <ErrorText>{error}</ErrorText>}
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.searchPlaceholder}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-brand-500 dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-white sm:w-72"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-slate-200">
          <option value="">{t.allStatuses}</option>
          <option value="ACTIVE">{t.statusActive}</option>
          <option value="SUSPENDED">{t.statusSuspended}</option>
          <option value="INACTIVE">{t.statusInactive}</option>
        </select>
        {data && <span className="text-xs text-slate-500">{t.matching(data.pagination.total)}</span>}
      </div>

      {isLoading && <p className="text-sm text-slate-500">{t.loadingSubscribers}</p>}

      <div className="space-y-3">
        {data?.items.map((customer) => (
          <Link key={customer.id} href={`/customers/${customer.id}`} className="block">
            <Card hover={true} className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-700 dark:bg-obsidian-800 dark:text-slate-300">
                  {customer.fullName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    {customer.fullName}
                    <span className="font-mono text-xs font-normal text-slate-500">
                      #{customer.customerNumber}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {customer.phone} {customer.email ? `· ${customer.email}` : ""} · {t.joined} {new Date(customer.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Badge variant={customer.status === "ACTIVE" ? "success" : "neutral"}>
                  <StatusDot status={customer.status} pulse={customer.status === "ACTIVE"} />
                  <span>{customer.status}</span>
                </Badge>
                <IconArrowRight size={16} className="text-slate-400" />
              </div>
            </Card>
          </Link>
        ))}

        {data && data.items.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-obsidian-800">
            <IconUsers size={32} className="mx-auto text-slate-400 mb-2" />
            <h3 className="font-semibold text-slate-700 dark:text-slate-300">{t.noSubscribers}</h3>
            <p className="text-xs text-slate-500 mt-1">{t.addFirst}</p>
          </div>
        )}
      </div>
    </div>
  );
}
