"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";
import { Button, Card, ErrorText, HintText, Input, Label, Badge, StatusDot } from "@/components/ui";
import { IconTenants, IconCopy, IconCheck } from "@/components/icons";
import { UpgradeTenantModal } from "@/components/tenants/upgrade-tenant-modal";

const TENANT_FEATURES = [
  { key: "AI_ASSISTANT", label: "AI Assistant (hotspot package management)" },
  { key: "LIVE_CHAT", label: "Live Chat (Tawk.to widget)" },
  { key: "WIREGUARD_REMOTE_ACCESS", label: "WireGuard Remote Router Access" },
  { key: "HOTSPOT_VOUCHERS", label: "Hotspot Vouchers & Captive Portal" },
  { key: "SUPPORT_TICKETS", label: "Support Tickets" },
] as const;

interface TenantPlanSummary {
  id: string;
  name: string;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED" | "CANCELLED";
  createdAt: string;
  trialEndsAt: string | null;
  disabledFeatures: string[];
  /** `https://{slug}.{platformBaseDomain}` — computed server-side (see apps/api's tenants
   *  route), not yet a live URL (no hostname-routing layer exists to serve it) but the value
   *  this tenant's subdomain will resolve to once that ships. */
  platformUrl: string;
  /** Live usage, computed server-side — see loadTenantUsage in apps/api's tenants route. */
  usage?: TenantUsage;
  subscription: {
    id: string;
    status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "EXPIRED" | "CANCELLED";
    billingCycle: "MONTHLY" | "ANNUAL";
    plan: TenantPlanSummary;
  } | null;
}

interface TenantUsage {
  routerCount: number;
  routersOnline: number;
  customerCount: number;
  revenue30dMinor: number;
}

/**
 * Why a tenant needs attention, or null if nothing is wrong.
 *
 * Ordered by urgency, and each one is a thing a platform operator can act on today. "Never got
 * started" is the one worth reading twice: a tenant who signed up and never linked a router will
 * churn silently, and administrative state alone (ACTIVE, on a plan, trial running) makes them
 * look identical to a thriving customer.
 */
function tenantRisk(tenant: Tenant): { label: string; detail: string } | null {
  const usage = tenant.usage;
  const trialMsLeft = tenant.trialEndsAt ? new Date(tenant.trialEndsAt).getTime() - Date.now() : null;

  if (tenant.subscription?.status === "PAST_DUE") {
    return { label: "Past due", detail: "Subscription payment has failed" };
  }
  if (usage && usage.routerCount === 0) {
    return { label: "Never got started", detail: "No router has ever been linked" };
  }
  if (usage && usage.routerCount > 0 && usage.routersOnline === 0) {
    return { label: "All routers down", detail: `${usage.routerCount} linked, none reporting` };
  }
  if (trialMsLeft !== null && trialMsLeft > 0 && trialMsLeft < 3 * 24 * 60 * 60 * 1000) {
    return { label: "Trial ending", detail: "Fewer than 3 days left" };
  }
  if (usage && usage.customerCount > 0 && usage.revenue30dMinor === 0) {
    return { label: "No revenue", detail: "Has customers but took no payments in 30 days" };
  }
  return null;
}

interface PaginatedTenants {
  items: Tenant[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  platformBaseDomain: string;
}

type OnboardingFee = {
  status: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
  amountMinor: number;
  phone: string | null;
  mpesaReceiptNumber: string | null;
} | null;

function trialCountdown(trialEndsAt: string | null): string | null {
  if (!trialEndsAt) return null;
  const msLeft = new Date(trialEndsAt).getTime() - Date.now();
  if (msLeft <= 0) return "Trial ended";
  const days = Math.floor(msLeft / (24 * 60 * 60 * 1000));
  const hours = Math.floor((msLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  return `${days}d ${hours}h left in trial`;
}

function TenantManagePanel({ tenant, onOpenUpgrade }: { tenant: Tenant; onOpenUpgrade: () => void }) {
  const queryClient = useQueryClient();
  const [chargePhone, setChargePhone] = useState("");
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementBody, setAnnouncementBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: fee } = useQuery({
    queryKey: ["onboarding-fee", tenant.id],
    queryFn: () => apiFetch<OnboardingFee>(`/api/v1/platform/tenants/${tenant.id}/onboarding-fee`),
  });

  const { data: plans } = useQuery({
    queryKey: ["plans"],
    queryFn: () => apiFetch<TenantPlanSummary[]>("/api/v1/platform/plans"),
  });

  const changePlan = useMutation({
    mutationFn: (planId: string) =>
      apiFetch(`/api/v1/platform/tenants/${tenant.id}/subscription`, {
        method: "PATCH",
        body: JSON.stringify({ planId }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tenants"] }),
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to change plan"),
  });

  const toggleFeature = useMutation({
    mutationFn: (feature: string) => {
      const enabled = tenant.disabledFeatures.includes(feature);
      const next = enabled
        ? tenant.disabledFeatures.filter((f) => f !== feature)
        : [...tenant.disabledFeatures, feature];
      return apiFetch(`/api/v1/platform/tenants/${tenant.id}`, {
        method: "PATCH",
        body: JSON.stringify({ disabledFeatures: next }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tenants"] }),
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to update feature"),
  });

  const extendTrial = useMutation({
    mutationFn: (days: number) => {
      const base = tenant.trialEndsAt && new Date(tenant.trialEndsAt) > new Date() ? new Date(tenant.trialEndsAt) : new Date();
      base.setDate(base.getDate() + days);
      return apiFetch(`/api/v1/platform/tenants/${tenant.id}`, {
        method: "PATCH",
        body: JSON.stringify({ trialEndsAt: base.toISOString() }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tenants"] }),
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to extend trial"),
  });

  const clearTrial = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/platform/tenants/${tenant.id}`, {
        method: "PATCH",
        body: JSON.stringify({ trialEndsAt: null }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tenants"] }),
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to clear trial"),
  });

  const chargeOnboardingFee = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/platform/tenants/${tenant.id}/onboarding-fee/charge`, {
        method: "POST",
        body: JSON.stringify({ phone: chargePhone.trim() }),
      }),
    onSuccess: () => {
      setChargePhone("");
      queryClient.invalidateQueries({ queryKey: ["onboarding-fee", tenant.id] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to send STK push"),
  });

  const sendAnnouncement = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/announcements", {
        method: "POST",
        body: JSON.stringify({
          tenantId: tenant.id,
          title: announcementTitle.trim(),
          body: announcementBody.trim(),
          severity: "INFO",
        }),
      }),
    onSuccess: () => {
      setAnnouncementTitle("");
      setAnnouncementBody("");
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to send message"),
  });

  return (
    <div className="mt-3 space-y-4 border-t border-slate-100 pt-4 dark:border-obsidian-800">
      {error && <ErrorText>{error}</ErrorText>}

      {/* Plan */}
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Subscription Plan</p>
        <div className="flex flex-wrap items-center gap-2">
          {tenant.subscription ? (
            <Badge variant={tenant.subscription.status === "ACTIVE" ? "success" : tenant.subscription.status === "PAST_DUE" ? "warning" : tenant.subscription.status === "EXPIRED" ? "danger" : "info"}>
              {tenant.subscription.plan.name} · {tenant.subscription.status}
            </Badge>
          ) : (
            <span className="text-xs text-slate-500">No plan assigned</span>
          )}
          <Button
            variant="secondary"
            className="px-2.5 py-1 text-xs font-bold bg-brand-600/20 hover:bg-brand-600/30 text-brand-400 border border-brand-500/30"
            onClick={onOpenUpgrade}
          >
            ⭐ Upgrade Plan &amp; Quotas
          </Button>
          <select
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-slate-100"
            disabled={changePlan.isPending}
            value=""
            onChange={(e) => {
              if (e.target.value) changePlan.mutate(e.target.value);
            }}
          >
            <option value="">Quick override...</option>
            {plans?.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Trial controls */}
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Free Trial</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-600 dark:text-slate-400">
            {tenant.trialEndsAt
              ? `${trialCountdown(tenant.trialEndsAt)} (ends ${new Date(tenant.trialEndsAt).toLocaleString()})`
              : "No trial set"}
          </span>
          <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => extendTrial.mutate(7)}>
            +7 days
          </Button>
          <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => clearTrial.mutate()}>
            Mark as paid (clear trial)
          </Button>
        </div>
      </div>

      {/* Onboarding fee */}
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Onboarding Fee (KES 450)
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {fee ? (
            <Badge variant={fee.status === "COMPLETED" ? "success" : fee.status === "PENDING" ? "warning" : "danger"}>
              {fee.status}
              {fee.mpesaReceiptNumber ? ` · ${fee.mpesaReceiptNumber}` : ""}
            </Badge>
          ) : (
            <span className="text-xs text-slate-500">Not charged yet</span>
          )}
          {fee?.status !== "COMPLETED" && (
            <>
              <Input
                placeholder="0712345678"
                value={chargePhone}
                onChange={(e) => setChargePhone(e.target.value)}
                className="w-40 py-1 text-xs"
              />
              <Button
                variant="secondary"
                className="px-2.5 py-1 text-xs"
                disabled={!chargePhone.trim() || chargeOnboardingFee.isPending}
                onClick={() => chargeOnboardingFee.mutate()}
              >
                {chargeOnboardingFee.isPending ? "Sending STK..." : "Charge via M-Pesa"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Feature toggles */}
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Features</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {TENANT_FEATURES.map((f) => {
            const enabled = !tenant.disabledFeatures.includes(f.key);
            return (
              <label key={f.key} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={enabled}
                  disabled={toggleFeature.isPending}
                  onChange={() => toggleFeature.mutate(f.key)}
                />
                {f.label}
              </label>
            );
          })}
        </div>
      </div>

      {/* Send announcement */}
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Send a Message to This Tenant
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            sendAnnouncement.mutate();
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <Input
            placeholder="Title"
            value={announcementTitle}
            onChange={(e) => setAnnouncementTitle(e.target.value)}
            className="w-40 py-1 text-xs"
            required
          />
          <Input
            placeholder="Message"
            value={announcementBody}
            onChange={(e) => setAnnouncementBody(e.target.value)}
            className="flex-1 min-w-[200px] py-1 text-xs"
            required
          />
          <Button type="submit" variant="secondary" className="px-2.5 py-1 text-xs" disabled={sendAnnouncement.isPending}>
            {sendAnnouncement.isPending ? "Sending..." : "Send"}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function TenantsPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "TRIAL" | "SUSPENDED" | "ATTENTION">("ALL");
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [showProvision, setShowProvision] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [upgradeTenant, setUpgradeTenant] = useState<Tenant | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => apiFetch<PaginatedTenants>("/api/v1/platform/tenants?limit=100"),
  });

  const copyPlatformUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const createTenant = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/platform/tenants", {
        method: "POST",
        body: JSON.stringify({ name, slug: slug.toLowerCase().trim(), ownerPhone: ownerPhone.trim() || undefined }),
      }),
    onSuccess: () => {
      setName("");
      setSlug("");
      setOwnerPhone("");
      setShowProvision(false);
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to create tenant"),
  });

  const toggleSuspend = useMutation({
    mutationFn: ({ id, suspend }: { id: string; suspend: boolean }) =>
      apiFetch(`/api/v1/platform/tenants/${id}/${suspend ? "suspend" : "reactivate"}`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tenants"] }),
  });

  const sendBroadcast = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/announcements", {
        method: "POST",
        body: JSON.stringify({
          tenantId: null,
          title: broadcastTitle.trim(),
          body: broadcastBody.trim(),
          severity: "INFO",
        }),
      }),
    onSuccess: () => {
      setBroadcastTitle("");
      setBroadcastBody("");
      setShowBroadcast(false);
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to send broadcast"),
  });

  const allItems = data?.items ?? [];
  const totalCount = allItems.length;
  const activeCount = allItems.filter((t) => t.status === "ACTIVE").length;
  const trialCount = allItems.filter((t) => t.trialEndsAt && new Date(t.trialEndsAt) > new Date()).length;
  const suspendedCount = allItems.filter((t) => t.status === "SUSPENDED").length;
  const attentionCount = allItems.filter((t) => tenantRisk(t) !== null).length;

  const filteredItems = allItems.filter((tenant) => {
    const matchesSearch =
      search === "" ||
      tenant.name.toLowerCase().includes(search.toLowerCase()) ||
      tenant.slug.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;

    if (statusFilter === "ACTIVE") return tenant.status === "ACTIVE";
    if (statusFilter === "SUSPENDED") return tenant.status === "SUSPENDED";
    if (statusFilter === "TRIAL") return Boolean(tenant.trialEndsAt && new Date(tenant.trialEndsAt) > new Date());
    if (statusFilter === "ATTENTION") return tenantRisk(tenant) !== null;
    return true;
  });

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <IconTenants size={20} />
            </span>
            Tenant Organizations
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Platform-level multi-tenant partitioning, trials, features, and status lifecycle.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" className="text-xs" onClick={() => setShowBroadcast((v) => !v)}>
            {showBroadcast ? "Close Broadcast" : "📢 Broadcast Message"}
          </Button>
          <Button
            className="text-xs bg-purple-600 hover:bg-purple-700 font-bold"
            onClick={() => setShowProvision((v) => !v)}
          >
            {showProvision ? "Close Form" : "+ Provision Tenant"}
          </Button>
        </div>
      </div>

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div
          onClick={() => setStatusFilter("ALL")}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === "ALL"
              ? "bg-purple-50/50 border-purple-500/50 dark:bg-purple-950/20"
              : "bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800"
          }`}
        >
          <span className="text-[11px] font-bold text-slate-500 uppercase block">Total Tenants</span>
          <span className="text-2xl font-black text-slate-900 dark:text-white">{totalCount}</span>
        </div>

        <div
          onClick={() => setStatusFilter("ACTIVE")}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === "ACTIVE"
              ? "bg-emerald-50/50 border-emerald-500/50 dark:bg-emerald-950/20"
              : "bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800"
          }`}
        >
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase block">Active</span>
          <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{activeCount}</span>
        </div>

        <div
          onClick={() => setStatusFilter("TRIAL")}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === "TRIAL"
              ? "bg-amber-50/50 border-amber-500/50 dark:bg-amber-950/20"
              : "bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800"
          }`}
        >
          <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase block">In Trial</span>
          <span className="text-2xl font-black text-amber-600 dark:text-amber-400">{trialCount}</span>
        </div>

        <div
          onClick={() => setStatusFilter("SUSPENDED")}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === "SUSPENDED"
              ? "bg-rose-50/50 border-rose-500/50 dark:bg-rose-950/20"
              : "bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800"
          }`}
        >
          <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase block">Suspended</span>
          <span className="text-2xl font-black text-rose-600 dark:text-rose-400">{suspendedCount}</span>
        </div>

        {/* The card an operator should look at first: administrative status says a tenant is
            fine, usage says whether they actually are. */}
        <div
          onClick={() => setStatusFilter("ATTENTION")}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === "ATTENTION"
              ? "bg-amber-50/50 border-amber-500/50 dark:bg-amber-950/20"
              : "bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800"
          }`}
        >
          <span className="block text-[11px] font-bold uppercase text-amber-600 dark:text-amber-400">
            Needs attention
          </span>
          <span className="text-2xl font-black text-amber-600 dark:text-amber-400">{attentionCount}</span>
        </div>
      </div>

      {/* Broadcast Box */}
      {showBroadcast && (
        <Card className="border-brand-500/40 bg-brand-50/20 dark:bg-brand-950/20 space-y-3">
          <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <span>📢</span> Broadcast Announcement to Every Tenant
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              sendBroadcast.mutate();
            }}
            className="space-y-3"
          >
            <Input placeholder="Title" value={broadcastTitle} onChange={(e) => setBroadcastTitle(e.target.value)} required />
            <Input placeholder="Message" value={broadcastBody} onChange={(e) => setBroadcastBody(e.target.value)} required />
            <Button type="submit" disabled={sendBroadcast.isPending}>
              {sendBroadcast.isPending ? "Sending..." : "Send to All Tenants"}
            </Button>
          </form>
        </Card>
      )}

      {/* Provision New Tenant Card */}
      {showProvision && (
        <Card className="border-purple-500/40 space-y-4">
          <div className="pb-2 border-b border-slate-100 dark:border-slate-800">
            <h2 className="font-bold text-base text-slate-900 dark:text-white">Provision New ISP Tenant</h2>
            <p className="text-xs text-slate-500">
              Creates a dedicated tenant domain, FreeRADIUS database slice, and 7-day trial.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              createTenant.mutate();
            }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            <div>
              <Label htmlFor="name">Organization / ISP Name</Label>
              <Input
                id="name"
                placeholder="e.g. SafariNet ISP Ltd"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9]/g, "-")) {
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""));
                  }
                }}
                required
              />
            </div>
            <div>
              <Label htmlFor="slug">Subdomain / Tenant Slug</Label>
              <Input
                id="slug"
                placeholder="e.g. safarinet"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                className="font-mono text-sm"
                required
              />
              <p className="text-[10px] text-slate-400 mt-1 font-mono">
                URL: https://{slug || "your-slug"}.{data?.platformBaseDomain ?? "billing.example.com"}
              </p>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="ownerPhone">Owner M-Pesa Phone (Optional)</Label>
              <Input
                id="ownerPhone"
                placeholder="0712345678"
                value={ownerPhone}
                onChange={(e) => setOwnerPhone(e.target.value)}
              />
              <HintText>
                If provided, an onboarding STK push for KES 450 is dispatched immediately.
              </HintText>
            </div>
            <div className="sm:col-span-2 pt-1">
              <Button type="submit" disabled={createTenant.isPending} className="bg-purple-600 hover:bg-purple-700 text-white font-bold">
                {createTenant.isPending ? "Provisioning..." : "Create Tenant Account"}
              </Button>
            </div>
          </form>
          {error && <ErrorText>{error}</ErrorText>}
        </Card>
      )}

      {/* Search & Filter Bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Input
            placeholder="Search tenants by name or slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full"
          />
        </div>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading tenants...</p>}

      {/* Tenants List */}
      <div className="space-y-3">
        {filteredItems.map((tenant) => {
          const countdown = trialCountdown(tenant.trialEndsAt);
          const risk = tenantRisk(tenant);
          const usage = tenant.usage;
          return (
            <Card key={tenant.id} className="py-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 dark:text-white text-base">{tenant.name}</h3>
                    <span className="font-mono text-xs text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded-md border border-purple-200 dark:border-purple-800/40">
                      {tenant.slug}
                    </span>
                    {risk && (
                      <span
                        title={risk.detail}
                        className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-300"
                      >
                        {risk.label}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Created {new Date(tenant.createdAt).toLocaleDateString()}
                    {countdown && (
                      <span className={countdown === "Trial ended" ? "ml-2 text-rose-500 font-semibold" : "ml-2 text-amber-500 font-semibold"}>
                        · {countdown}
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="font-mono text-[11px] text-slate-500">{tenant.platformUrl}</span>
                    <button
                      type="button"
                      onClick={() => copyPlatformUrl(tenant.platformUrl)}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      title="Copy platform URL"
                    >
                      {copiedUrl === tenant.platformUrl ? <IconCheck size={12} /> : <IconCopy size={12} />}
                    </button>
                  </div>

                  {/* Live usage — what administrative status cannot tell you. */}
                  {usage && (
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {usage.routersOnline}/{usage.routerCount}
                        </span>{" "}
                        routers online
                      </span>
                      <span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {usage.customerCount}
                        </span>{" "}
                        customers
                      </span>
                      <span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {formatMoney(usage.revenue30dMinor)}
                        </span>{" "}
                        in 30 days
                      </span>
                      {risk && <span className="text-amber-600 dark:text-amber-400">{risk.detail}</span>}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                  <a
                    href={`/hotspot/${tenant.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-mono text-cyan-400 hover:text-cyan-300 hidden md:inline-block px-1"
                  >
                    Preview Portal &rarr;
                  </a>
                  <Button
                    className="text-xs py-1.5 bg-brand-600 hover:bg-brand-500 text-white font-bold"
                    onClick={() => setUpgradeTenant(tenant)}
                  >
                    ⭐ Upgrade
                  </Button>
                  <Badge variant={tenant.status === "ACTIVE" ? "success" : "danger"}>
                    <StatusDot status={tenant.status} />
                    <span>{tenant.status}</span>
                  </Badge>
                  <Button
                    variant="secondary"
                    className="text-xs py-1.5"
                    onClick={() => setExpandedId(expandedId === tenant.id ? null : tenant.id)}
                  >
                    {expandedId === tenant.id ? "Close" : "⚙️ Manage"}
                  </Button>
                  <Button
                    variant={tenant.status === "ACTIVE" ? "danger" : "secondary"}
                    className="text-xs py-1.5"
                    onClick={() => toggleSuspend.mutate({ id: tenant.id, suspend: tenant.status === "ACTIVE" })}
                    disabled={toggleSuspend.isPending}
                  >
                    {tenant.status === "ACTIVE" ? "Suspend" : "Reactivate"}
                  </Button>
                </div>
              </div>

              {expandedId === tenant.id && (
                <TenantManagePanel
                  tenant={tenant}
                  onOpenUpgrade={() => setUpgradeTenant(tenant)}
                />
              )}
            </Card>
          );
        })}

        {filteredItems.length === 0 && !isLoading && (
          <div className="py-12 text-center text-xs text-slate-400">
            No tenants match your search/filter criteria.
          </div>
        )}
      </div>

      {upgradeTenant && (
        <UpgradeTenantModal
          tenant={upgradeTenant}
          onClose={() => setUpgradeTenant(null)}
        />
      )}
    </div>
  );
}
