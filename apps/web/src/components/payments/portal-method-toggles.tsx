"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Card } from "@/components/ui";

type Method = "MPESA" | "PAYSTACK" | "PESAPAL";

interface MethodState {
  method: Method;
  /** Whether this tenant is capable of taking money this way at all. */
  usable: boolean;
  /** Whether it is actually offered on their captive portal. */
  enabled: boolean;
}

const LABELS: Record<Method, { name: string; blurb: string }> = {
  MPESA: { name: "M-Pesa", blurb: "STK push straight to the customer's phone" },
  PAYSTACK: { name: "Paystack", blurb: "Cards and bank transfer" },
  PESAPAL: { name: "Pesapal", blurb: "Cards and mobile money" },
};

/**
 * Which payment methods appear on the captive portal.
 *
 * Deliberately separate from configuring a gateway: having credentials and wanting customers to
 * see that option are different decisions. An operator testing a new gateway, or one whose
 * Paystack account is under review, needs to take it off the portal without deleting the keys
 * and re-entering them later.
 *
 * A method that is not usable is shown greyed with the reason rather than hidden, so it is
 * obvious WHY a customer cannot pay that way — an absent row explains nothing.
 */
export function PortalMethodToggles() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["portal-payment-toggles"],
    queryFn: () => apiFetch<{ methods: MethodState[] }>("/api/v1/hotspot/payment-toggles"),
  });

  const toggle = useMutation({
    mutationFn: (input: { method: Method; enabled: boolean }) =>
      apiFetch("/api/v1/hotspot/payment-toggles", { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-payment-toggles"] });
      queryClient.invalidateQueries({ queryKey: ["hotspot-payment-methods"] });
    },
  });

  const methods = data?.methods ?? [];

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-semibold text-slate-900 dark:text-white">Shown on your captive portal</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Turn a payment method off to hide it from customers without removing its setup.
        </p>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-obsidian-800">
        {methods.map((state) => (
          <div key={state.method} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p
                className={
                  state.usable
                    ? "text-sm font-medium text-slate-900 dark:text-white"
                    : "text-sm font-medium text-slate-400"
                }
              >
                {LABELS[state.method].name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {state.usable
                  ? LABELS[state.method].blurb
                  : "Not set up yet — configure it in the tab above to offer it."}
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={state.enabled}
              aria-label={`${LABELS[state.method].name} on the captive portal`}
              disabled={!state.usable || toggle.isPending}
              onClick={() => toggle.mutate({ method: state.method, enabled: !state.enabled })}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
                state.enabled ? "bg-emerald-600" : "bg-slate-300 dark:bg-obsidian-700"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  state.enabled ? "translate-x-[22px]" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        ))}
      </div>

      {methods.length > 0 && methods.every((m) => !m.enabled) && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
          Every method is off, so customers cannot buy anything on your portal.
        </p>
      )}
    </Card>
  );
}
