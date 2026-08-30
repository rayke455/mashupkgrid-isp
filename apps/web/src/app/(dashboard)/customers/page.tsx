"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
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
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: () => apiFetch<PaginatedCustomers>("/api/v1/customers?limit=50"),
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
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to create customer"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/15 text-brand-600 dark:text-brand-400">
              <IconUsers size={20} />
            </span>
            Subscribers &amp; Customers
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manage broadband subscribers, PPPoE credentials, subscriptions, and wallets.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "+ New Subscriber"}
        </Button>
      </div>

      {showForm && (
        <Card className="border-brand-500/40 bg-brand-50/20 dark:bg-brand-950/20">
          <h2 className="font-semibold text-slate-900 dark:text-white mb-3">Register New Subscriber</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              createCustomer.mutate();
            }}
            className="grid grid-cols-1 sm:grid-cols-3 gap-4"
          >
            <div>
              <Label htmlFor="fullName">Full Name</Label>
              <Input id="fullName" placeholder="Jane Doe" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="phone">Phone Number (M-Pesa)</Label>
              <Input id="phone" placeholder="0712345678" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="email">Email Address (Optional)</Label>
              <Input id="email" type="email" placeholder="jane@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="sm:col-span-3 pt-2">
              <Button type="submit" disabled={createCustomer.isPending}>
                {createCustomer.isPending ? "Registering subscriber..." : "Create Subscriber Account"}
              </Button>
            </div>
          </form>
          {error && <ErrorText>{error}</ErrorText>}
        </Card>
      )}

      {isLoading && <p className="text-sm text-slate-500">Loading subscribers...</p>}

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
                    {customer.phone} {customer.email ? `· ${customer.email}` : ""}
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
            <h3 className="font-semibold text-slate-700 dark:text-slate-300">No subscribers registered yet</h3>
            <p className="text-xs text-slate-500 mt-1">Add your first subscriber using the button above.</p>
          </div>
        )}
      </div>
    </div>
  );
}
