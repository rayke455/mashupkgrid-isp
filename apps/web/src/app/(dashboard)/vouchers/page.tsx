"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/dashboard/surface";
import { PackagesTab } from "@/components/hotspot-admin/packages-tab";
import { VouchersTab } from "@/components/hotspot-admin/vouchers-tab";
import { SalesTab } from "@/components/hotspot-admin/sales-tab";
import { PortalTab } from "@/components/hotspot-admin/portal-tab";
import { AdvancedTab } from "@/components/hotspot-admin/advanced-tab";
import { tr } from "@/lib/tr";

const TABS = [
  { id: "packages", label: "Packages" },
  { id: "vouchers", label: "Vouchers" },
  { id: "sales", label: "Sales" },
  { id: "portal", label: "Portal design" },
  { id: "advanced", label: "Advanced" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function HotspotSection() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get("tab");
  const tab: TabId = TABS.some((t) => t.id === requested) ? (requested as TabId) : "packages";
  const tenantSlug = user?.tenantSlug ?? null;

  // Printed vouchers carry the ISP's name, so read what the portal itself shows.
  const { data: info } = useQuery({
    queryKey: ["hotspot-info", tenantSlug],
    queryFn: () => apiFetch<{ name: string; brandName?: string | null }>(`/api/v1/hotspot/${tenantSlug}/info`, { skipAuth: true }),
    enabled: Boolean(tenantSlug),
  });
  const brand = info?.brandName || info?.name || "";

  const select = (id: TabId) => router.replace(`${pathname}?tab=${id}`, { scroll: false });

  return (
    <div className="space-y-6">
      <PageHeader
        title={tr("Hotspot")}
        description={tr("Packages customers buy with M-Pesa, cash vouchers, and the Wi-Fi sign-in page they see.")}
      />

      <div role="tablist" aria-label={tr("Hotspot sections")} className="-mx-1 flex gap-1 overflow-x-auto border-b border-obsidian-800 px-1">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => select(t.id)}
              className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? "border-brand-500 text-white" : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {tab === "packages" && <PackagesTab />}
        {tab === "vouchers" && <VouchersTab brand={brand} />}
        {tab === "sales" && <SalesTab />}
        {tab === "portal" &&
          (tenantSlug ? <PortalTab tenantSlug={tenantSlug} /> : <p className="text-sm text-slate-400">{tr("Sign in to an ISP account to edit its portal.")}</p>)}
        {tab === "advanced" && <AdvancedTab />}
      </div>
    </div>
  );
}

export default function HotspotPage() {
  return (
    <Suspense fallback={null}>
      <HotspotSection />
    </Suspense>
  );
}
