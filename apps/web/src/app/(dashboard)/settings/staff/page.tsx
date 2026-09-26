"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useBranches } from "@/lib/use-branches";
import { Badge, Button, Card, ErrorText, HintText, Input, Label } from "@/components/ui";
import { EmptyState, Pill, TableShell, darkButton, td, th } from "@/components/dashboard/surface";

/** Who can sign in to this ISP's dashboard and what they may do. */

interface StaffRow {
  id: string;
  email: string;
  phone: string | null;
  status: "ACTIVE" | "SUSPENDED" | "PENDING_VERIFICATION" | "DISABLED";
  lastLoginAt: string | null;
  createdAt: string;
  branch?: { id: string; name: string } | null;
  roles: { userRoleId: string; id: string; name: string }[];
}
interface Role {
  id: string;
  name: string;
  isSystem: boolean;
  tenantId: string | null;
  permissions: string[];
}

/** What each preset is for, in the words an ISP owner would use. */
const ROLE_HELP: Record<string, string> = {
  ISP_OWNER: "Everything, including settings, staff and money.",
  ADMIN: "Runs the business day to day: customers, billing, routers, tickets, staff.",
  FINANCE_MANAGER: "Payments, invoices, settlements and reports. No network changes.",
  SUPPORT_AGENT: "Customers and tickets. Can look up accounts and reply, not change billing.",
  TECHNICIAN: "Routers, VLANs and provisioning. No access to money.",
  CASHIER: "Records cash and manual payments and prints receipts.",
  ACCOUNTANT: "Reads invoices, payments and reports for the books. Cannot change anything.",
  NETWORK_ADMIN: "Routers, VLANs, IP pools and hotspot setup. No billing.",
  READ_ONLY: "Can look at everything and change nothing.",
  RESELLER: "Sells packages and vouchers for their own customers only.",
  SALES: "Adds customers and subscriptions, and records their first payment.",
  SUPPORT: "Customers and tickets. Can look up accounts and reply, not change billing.",
};

function roleLabel(name: string): string {
  return name.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export default function StaffSettingsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState("");
  const [branchId, setBranchId] = useState("");
  const { branches } = useBranches();
  const [error, setError] = useState<string | null>(null);

  const { data: staff, isLoading } = useQuery({ queryKey: ["staff"], queryFn: () => apiFetch<StaffRow[]>("/api/v1/rbac/staff") });
  const { data: roles } = useQuery({ queryKey: ["roles"], queryFn: () => apiFetch<Role[]>("/api/v1/rbac/roles") });
  const assignable = (roles ?? []).filter((r) => r.name !== "CUSTOMER" && r.name !== "SUPER_ADMIN");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["staff"] });
  const add = useMutation({
    mutationFn: () => apiFetch("/api/v1/rbac/staff", { method: "POST", body: JSON.stringify({ email, phone: phone || undefined, password, roleId, branchId: branchId || null }) }),
    onSuccess: () => {
      setEmail("");
      setPhone("");
      setPassword("");
      setShowForm(false);
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Could not add this person"),
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "ACTIVE" | "SUSPENDED" }) => apiFetch(`/api/v1/rbac/staff/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Could not change access"),
  });
  const assignRole = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) => apiFetch("/api/v1/rbac/user-roles", { method: "POST", body: JSON.stringify({ userId, roleId }) }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Could not assign the role"),
  });
  const revokeRole = useMutation({
    mutationFn: (userRoleId: string) => apiFetch(`/api/v1/rbac/user-roles/${userRoleId}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Could not remove the role"),
  });

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Staff and roles</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Who can sign in to this dashboard, and what each person may do.</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancel" : "Add staff member"}</Button>
      </div>

      {error && <ErrorText>{error}</ErrorText>}

      {showForm && (
        <Card className="p-6">
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              add.mutate();
            }}
          >
            <div>
              <Label htmlFor="staffEmail">Email</Label>
              <Input id="staffEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="staffPhone">Phone (optional)</Label>
              <Input id="staffPhone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XX XXX XXX" />
            </div>
            <div>
              <Label htmlFor="staffPassword">Temporary password</Label>
              <Input id="staffPassword" type="text" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
              <HintText>Share it with them privately. They can change it under Settings → Password.</HintText>
            </div>
            <div>
              <Label htmlFor="staffRole">Role</Label>
              <select
                id="staffRole"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300/90 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-slate-100"
              >
                <option value="">Choose a role…</option>
                {assignable.map((r) => (
                  <option key={r.id} value={r.id}>
                    {roleLabel(r.name)}
                  </option>
                ))}
              </select>
              {roleId && <HintText>{ROLE_HELP[assignable.find((r) => r.id === roleId)?.name ?? ""] ?? "A custom role for this account."}</HintText>}
            </div>
            {branches.length > 0 && (
              <div>
                <Label htmlFor="staffBranch">Home branch (optional)</Label>
                <select
                  id="staffBranch"
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300/90 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-slate-100"
                >
                  <option value="">All branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={add.isPending || !roleId}>
                {add.isPending ? "Adding…" : "Add staff member"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="p-0">
        {isLoading ? (
          <p className="px-5 py-6 text-sm text-slate-500">Loading…</p>
        ) : !staff || staff.length === 0 ? (
          <EmptyState title="Only you so far">Add a colleague and give them a role that matches their job.</EmptyState>
        ) : (
          <TableShell minWidth={720}>
            <thead>
              <tr>
                <th className={th}>Person</th>
                <th className={th}>Roles</th>
                <th className={th}>Last sign-in</th>
                <th className={th}>Status</th>
                <th className={`${th} text-right`}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => {
                const isMe = s.id === user?.id;
                return (
                  <tr key={s.id}>
                    <td className={td}>
                      <span className="font-medium text-white">{s.email}</span>
                      {isMe && <span className="ml-2 text-xs text-slate-500">you</span>}
                      {(s.phone || s.branch) && <span className="block text-xs text-slate-500">{[s.phone, s.branch?.name].filter(Boolean).join(" · ")}</span>}
                    </td>
                    <td className={`${td} whitespace-normal`}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {s.roles.map((r) => (
                          <span key={r.userRoleId} className="inline-flex items-center gap-1 rounded-full border border-obsidian-700 px-2 py-0.5 text-xs text-slate-200">
                            {roleLabel(r.name)}
                            {!isMe && s.roles.length > 1 && (
                              <button type="button" onClick={() => revokeRole.mutate(r.userRoleId)} className="text-slate-500 hover:text-white" aria-label={`Remove ${roleLabel(r.name)}`}>
                                ✕
                              </button>
                            )}
                          </span>
                        ))}
                        {!isMe && (
                          <select
                            value=""
                            onChange={(e) => e.target.value && assignRole.mutate({ userId: s.id, roleId: e.target.value })}
                            className="rounded-md border border-obsidian-700 bg-obsidian-950 px-1.5 py-0.5 text-xs text-slate-300"
                            aria-label="Add a role"
                          >
                            <option value="">+ role</option>
                            {assignable
                              .filter((r) => !s.roles.some((x) => x.id === r.id))
                              .map((r) => (
                                <option key={r.id} value={r.id}>
                                  {roleLabel(r.name)}
                                </option>
                              ))}
                          </select>
                        )}
                      </div>
                    </td>
                    <td className={`${td} text-slate-400`}>{s.lastLoginAt ? new Date(s.lastLoginAt).toLocaleString() : "Never"}</td>
                    <td className={td}>
                      <Pill tone={s.status === "ACTIVE" ? "good" : s.status === "SUSPENDED" ? "bad" : "warn"}>{roleLabel(s.status)}</Pill>
                    </td>
                    <td className={`${td} text-right`}>
                      {!isMe &&
                        (s.status === "SUSPENDED" ? (
                          <button type="button" className={darkButton("secondary", "sm")} onClick={() => setStatus.mutate({ id: s.id, status: "ACTIVE" })}>
                            Restore access
                          </button>
                        ) : (
                          <button type="button" className={`${darkButton("ghost", "sm")} text-rose-300`} onClick={() => confirm(`Suspend ${s.email}? They are signed out immediately.`) && setStatus.mutate({ id: s.id, status: "SUSPENDED" })}>
                            Suspend
                          </button>
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}
      </Card>

      <Card className="p-6">
        <p className="font-medium text-slate-900 dark:text-white">What each role can do</p>
        <ul className="mt-3 grid gap-2 text-sm text-slate-600 dark:text-slate-400 sm:grid-cols-2">
          {assignable.map((r) => (
            <li key={r.id} className="rounded-lg border border-slate-200 p-3 dark:border-obsidian-800">
              <span className="font-medium text-slate-900 dark:text-white">{roleLabel(r.name)}</span>
              {!r.isSystem && <Badge variant="neutral" className="ml-2">custom</Badge>}
              <span className="block text-xs">{ROLE_HELP[r.name] ?? `${r.permissions.length} permissions`}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
