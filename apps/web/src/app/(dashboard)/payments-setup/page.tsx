"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import { IconMpesa } from "@/components/icons";
import { PlatformPayoutSettings } from "@/components/payments/platform-payout-settings";
import { MpesaSettings } from "@/components/payments/mpesa-settings";
import { PaystackSettings } from "@/components/payments/paystack-settings";
import { PesapalSettings } from "@/components/payments/pesapal-settings";
import { PortalMethodToggles } from "@/components/payments/portal-method-toggles";

type TabId = "platform" | "mpesa" | "paystack" | "pesapal";

const TABS: { id: TabId; label: string; blurb: string }[] = [
  {
    id: "platform",
    label: "Till / Paybill",
    blurb: "Get paid to your own number with no keys to set up",
  },
  { id: "mpesa", label: "M-Pesa (own)", blurb: "Collect into your own M-Pesa using your Daraja keys" },
  { id: "paystack", label: "Paystack", blurb: "Cards and bank payments" },
  { id: "pesapal", label: "Pesapal", blurb: "Cards and mobile money" },
];

/**
 * Every way a tenant can receive money, in one place.
 *
 * These were four separate sidebar entries, which made them look like four unrelated features
 * rather than four answers to one question — "how do I get paid?" — of which an operator needs
 * exactly one. The simplest option leads deliberately: most ISPs want a number to receive money
 * on, not a Daraja account to register.
 */
export default function PaymentsSetupPage() {
  const [tab, setTab] = useState<TabId>("platform");
  const active = TABS.find((t) => t.id === tab)!;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/15 text-brand-600 dark:text-brand-400">
            <IconMpesa size={20} />
          </span>
          Getting paid
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Choose how your customers&apos; money reaches you. You only need one.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              tab === t.id
                ? "bg-brand-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-obsidian-800 dark:text-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card className="border-brand-500/30 bg-brand-50/30 px-4 py-2.5 dark:bg-brand-950/20">
        <p className="text-xs text-slate-600 dark:text-slate-300">{active.blurb}</p>
      </Card>

      {/* Above the tabs' own content: which methods customers see is one decision across all of
          them, and burying it inside a single gateway's tab would imply it only applies there. */}
      <PortalMethodToggles />

      {tab === "platform" && <PlatformPayoutSettings />}
      {tab === "mpesa" && <MpesaSettings />}
      {tab === "paystack" && <PaystackSettings />}
      {tab === "pesapal" && <PesapalSettings />}
    </div>
  );
}
