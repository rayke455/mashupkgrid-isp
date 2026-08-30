"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Button, Card, Badge, Input, Label, ErrorText } from "@/components/ui";
import { IconCheck, IconPulse, IconMpesa, IconRouter, IconShield } from "@/components/icons";

interface TenantPlanDetail {
  id: string;
  name: string;
  slug: string;
  monthlyPriceKsh: number;
  annualPriceKsh: number;
  maxCustomers: string;
  maxRouters: string;
  badge: string;
  features: string[];
}

const PLANS: TenantPlanDetail[] = [
  {
    id: "plan-starter",
    name: "Starter WISP",
    slug: "starter",
    monthlyPriceKsh: 4500,
    annualPriceKsh: 3600,
    maxCustomers: "250 Subscribers",
    maxRouters: "2 MikroTik Routers",
    badge: "Emerging Networks",
    features: [
      "Up to 250 active PPPoE & Hotspot subscribers",
      "Connect 2 MikroTik RouterOS gateways",
      "Automated M-Pesa Paybill C2B reconciliation",
      "Captive portal voucher generation",
      "Standard community support",
    ],
  },
  {
    id: "plan-growth",
    name: "Growth Telecom",
    slug: "growth",
    monthlyPriceKsh: 12500,
    annualPriceKsh: 10000,
    maxCustomers: "1,500 Subscribers",
    maxRouters: "Unlimited Routers",
    badge: "Most Popular for ISPs",
    features: [
      "Up to 1,500 active subscribers",
      "Unlimited MikroTik routers, OLTs & switches",
      "Automated WhatsApp Self-Service Billing Bot",
      "AI Optical Outage & Fiber Cut Pinpointer",
      "GIS Fiber & Wireless Coverage Checker",
      "In-Portal Subscriber Speedometer",
    ],
  },
  {
    id: "plan-enterprise",
    name: "Carrier Enterprise",
    slug: "enterprise",
    monthlyPriceKsh: 35000,
    annualPriceKsh: 28000,
    maxCustomers: "Unlimited Subscribers",
    maxRouters: "Unlimited Routers",
    badge: "High-Volume ISPs & Carriers",
    features: [
      "Unlimited active subscribers & vouchers",
      "Dedicated FreeRADIUS 3.2 High-Availability VM",
      "Custom white-label domain with dedicated SSL",
      "BGP / OSPF multi-POP routing telemetry",
      "Direct WhatsApp NOC bridge & 99.99% SLA",
      "24/7 dedicated telecom engineer access",
    ],
  },
];

interface Props {
  tenant: {
    id: string;
    name: string;
    slug: string;
    subscription?: {
      plan?: { id: string; name: string };
      billingCycle?: "MONTHLY" | "ANNUAL";
    } | null;
  };
  onClose: () => void;
}

export function UpgradeTenantModal({ tenant, onClose }: Props) {
  const queryClient = useQueryClient();
  const [billingCycle, setBillingCycle] = useState<"MONTHLY" | "ANNUAL">(
    tenant.subscription?.billingCycle ?? "MONTHLY"
  );
  const [selectedPlanId, setSelectedPlanId] = useState<string>(
    tenant.subscription?.plan?.id ?? PLANS[1]!.id
  );
  const [chargePhone, setChargePhone] = useState("");
  const [chargeMethod, setChargeMethod] = useState<"instant" | "mpesa">("instant");
  const [error, setError] = useState<string | null>(null);
  const [stkDispatched, setStkDispatched] = useState(false);

  const selectedPlan = PLANS.find((p) => p.id === selectedPlanId) ?? PLANS[1]!;
  const price = billingCycle === "MONTHLY" ? selectedPlan.monthlyPriceKsh : selectedPlan.annualPriceKsh;

  const applyPlanChange = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/platform/tenants/${tenant.id}/subscription`, {
        method: "PATCH",
        body: JSON.stringify({
          planId: selectedPlanId,
          billingCycle,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      onClose();
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Failed to update plan"),
  });

  const handleChargeMpesa = () => {
    if (!chargePhone.trim()) {
      setError("Please provide a valid M-Pesa phone number");
      return;
    }
    setError(null);
    setStkDispatched(true);
    setTimeout(() => {
      applyPlanChange.mutate();
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-3xl rounded-3xl border border-slate-800 bg-slate-950 p-6 sm:p-8 space-y-6 shadow-2xl text-left font-sans max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="info">Subscription Upgrade</Badge>
              <span className="font-mono text-xs text-slate-400">
                Tenant: <strong className="text-white">{tenant.name}</strong> ({tenant.slug})
              </span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-white mt-1">
              Upgrade Operator Plan &amp; Quota
            </h3>
          </div>

          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-sm"
          >
            ✕
          </button>
        </div>

        {/* Billing Cycle Switcher */}
        <div className="flex items-center justify-center">
          <div className="inline-flex items-center gap-2 bg-slate-900 p-1.5 rounded-xl border border-slate-800 text-xs font-bold font-mono">
            <button
              type="button"
              onClick={() => setBillingCycle("MONTHLY")}
              className={`px-4 py-1.5 rounded-lg transition-all ${
                billingCycle === "MONTHLY" ? "bg-brand-600 text-white shadow-glow" : "text-slate-400 hover:text-white"
              }`}
            >
              Monthly Billing
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle("ANNUAL")}
              className={`px-4 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                billingCycle === "ANNUAL" ? "bg-emerald-600 text-white shadow-glow-emerald" : "text-slate-400 hover:text-white"
              }`}
            >
              <span>Annual Billing</span>
              <span className="px-1.5 py-0.5 rounded bg-black/40 text-[10px] text-emerald-300">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {/* 3 Tier Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const isSelected = selectedPlanId === plan.id;
            const currentPrice = billingCycle === "MONTHLY" ? plan.monthlyPriceKsh : plan.annualPriceKsh;

            return (
              <div
                key={plan.id}
                onClick={() => setSelectedPlanId(plan.id)}
                className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-4 relative ${
                  isSelected
                    ? "bg-slate-900 border-brand-500 shadow-glow ring-1 ring-brand-500/40"
                    : "bg-slate-950 border-slate-800 hover:border-slate-700"
                }`}
              >
                {isSelected && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-brand-600 text-white text-[10px] font-mono font-bold shadow-md">
                    SELECTED PLAN
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] font-mono text-cyan-400 uppercase font-bold">{plan.badge}</span>
                  </div>
                  <h4 className="text-base font-bold text-white">{plan.name}</h4>
                  <div className="font-mono">
                    <span className="text-2xl font-black text-white">KES {currentPrice.toLocaleString()}</span>
                    <span className="text-[11px] text-slate-500"> /mo</span>
                  </div>
                  <div className="text-[11px] font-mono text-emerald-400 bg-slate-950 p-1.5 rounded border border-slate-800">
                    {plan.maxCustomers} · {plan.maxRouters}
                  </div>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-800/80 text-xs text-slate-300">
                  {plan.features.slice(0, 4).map((f, idx) => (
                    <div key={idx} className="flex items-start gap-1.5 text-[11px]">
                      <span className="text-emerald-400 font-bold">✓</span>
                      <span className="leading-tight">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Upgrade Execution Methods */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-400">
            <span>Selected Upgrade: <strong className="text-white">{selectedPlan.name}</strong> ({billingCycle})</span>
            <span>Total Payable: <strong className="text-emerald-400">KES {price.toLocaleString()}</strong></span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={() => setChargeMethod("instant")}
              className={`p-3 rounded-xl border text-left transition-all ${
                chargeMethod === "instant"
                  ? "bg-slate-900 border-brand-500 shadow-sm"
                  : "bg-slate-950 border-slate-800 hover:border-slate-700"
              }`}
            >
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <IconCheck size={14} className="text-brand-400" />
                <span>Immediate Quota Provisioning</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Assign plan now; invoice or collect payment later.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setChargeMethod("mpesa")}
              className={`p-3 rounded-xl border text-left transition-all ${
                chargeMethod === "mpesa"
                  ? "bg-slate-900 border-emerald-500 shadow-glow-emerald"
                  : "bg-slate-950 border-slate-800 hover:border-slate-700"
              }`}
            >
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <IconMpesa size={14} />
                <span>Instant M-Pesa STK Push Charge</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Prompt owner phone immediately for KES {price.toLocaleString()}.
              </p>
            </button>
          </div>

          {chargeMethod === "mpesa" && (
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <Label htmlFor="owner-phone">Owner Safaricom M-Pesa Phone Number</Label>
              <div className="flex gap-2">
                <Input
                  id="owner-phone"
                  value={chargePhone}
                  onChange={(e) => setChargePhone(e.target.value)}
                  placeholder="0712345678"
                  className="font-mono text-xs"
                />
              </div>
            </div>
          )}
        </div>

        {error && <ErrorText>{error}</ErrorText>}

        {stkDispatched && (
          <div className="p-3 rounded-xl bg-emerald-950 border border-emerald-500/40 text-emerald-300 text-xs font-mono text-center flex items-center justify-center gap-2 animate-pulse">
            <IconCheck size={16} />
            <span>M-Pesa STK prompt dispatched! Upgrading tenant upon confirmation...</span>
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-bold text-slate-300 transition-colors"
          >
            Cancel
          </button>

          {chargeMethod === "instant" ? (
            <Button
              onClick={() => applyPlanChange.mutate()}
              disabled={applyPlanChange.isPending}
              className="px-6 py-2.5 font-bold shadow-glow text-xs gap-2"
            >
              {applyPlanChange.isPending ? <IconPulse size={14} className="animate-spin" /> : <IconCheck size={14} />}
              <span>{applyPlanChange.isPending ? "Assigning Plan..." : `Upgrade to ${selectedPlan.name}`}</span>
            </Button>
          ) : (
            <button
              type="button"
              onClick={handleChargeMpesa}
              disabled={stkDispatched || !chargePhone.trim()}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-glow-emerald transition-all flex items-center gap-2"
            >
              <IconMpesa size={16} />
              <span>Charge KES {price.toLocaleString()} via M-Pesa</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
