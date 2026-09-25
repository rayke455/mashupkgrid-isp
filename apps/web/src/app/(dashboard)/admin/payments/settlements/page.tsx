"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import {
  Alert,
  Dialog,
  Money,
  PLATFORM_TABS,
  Panel,
  PaymentsWorkspace,
  TableShell,
  buttonClass,
  td,
  th,
} from "@/components/payments-gateway/kit";
import { SettlementsView } from "@/components/payments-gateway/lists";
import { usePlatformGateway, usePlatformTenants } from "@/components/payments-gateway/use-platform";
import type { PlatformTenantRow } from "@/components/payments-gateway/types";

export default function PlatformSettlementsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const tenants = usePlatformTenants();
  const gateway = usePlatformGateway();
  const [confirm, setConfirm] = useState<PlatformTenantRow | null>(null);
  const canApprove = Boolean(user?.permissions.includes("settlements.approve"));

  const settle = useMutation({
    mutationFn: (tenantId: string) => apiFetch(`/api/v1/platform/payments/tenants/${tenantId}/settle`, { method: "POST" }),
    onSuccess: () => {
      setConfirm(null);
      void qc.invalidateQueries();
    },
  });

  const owed = (tenants.data ?? []).filter((t) => t.balance.settleableMinor > 0);

  return (
    <PaymentsWorkspace
      tabs={PLATFORM_TABS}
      title="Settlements"
      description="Money sent from ISPs' balances to their destinations. Automatic settlements are confirmed only by the provider's result; manual ones only with a transfer reference."
    >
      {gateway.data?.sandboxSettlements && (
        <Alert tone="amber" title="Sandbox settlements are on">
          Settlements are not sent to M-Pesa. Use “Simulate success/failure” on a processing settlement to stand in for Safaricom&apos;s result.
        </Alert>
      )}

      <Panel title="Ready to settle" description="ISPs with a whole-shilling balance available now." padded={false}>
        <TableShell minWidth={640}>
          <thead>
            <tr>
              <th className={th}>ISP</th>
              <th className={`${th} text-right`}>Can settle now</th>
              <th className={th}>Destination</th>
              <th className={th}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {tenants.isLoading && (
              <tr>
                <td colSpan={4} className={td}>
                  <div className="h-4 w-1/2 animate-pulse rounded bg-obsidian-800" />
                </td>
              </tr>
            )}
            {!tenants.isLoading && owed.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-400">
                  No ISP has a balance waiting to be settled.
                </td>
              </tr>
            )}
            {owed.map((t) => (
              <tr key={t.id}>
                <td className={`${td} font-medium text-slate-100`}>{t.name}</td>
                <td className={`${td} text-right font-medium text-slate-100`}>
                  <Money minor={t.balance.settleableMinor} />
                </td>
                <td className={td}>{t.destination ? `${t.destination.label} · ${t.destination.settlementMethod === "MANUAL" ? "manual" : "automatic"}` : <span className="text-amber-300">None set</span>}</td>
                <td className={`${td} text-right`}>
                  {canApprove && (
                    <button type="button" className={buttonClass("secondary", "sm")} disabled={!t.destination} onClick={() => setConfirm(t)}>
                      Settle now
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      </Panel>

      <Panel title="All settlements" padded={false}>
        <SettlementsView
          endpointBase="/api/v1/platform/payments"
          admin
          tenants={tenants.data?.map((t) => ({ id: t.id, name: t.name }))}
          sandboxActions={gateway.data?.sandboxSettlements}
        />
      </Panel>

      {confirm && (
        <Dialog
          open
          onClose={() => setConfirm(null)}
          title={`Settle ${confirm.name} now?`}
          footer={
            <>
              <button type="button" className={buttonClass("ghost")} onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button type="button" className={buttonClass("primary")} disabled={settle.isPending} onClick={() => settle.mutate(confirm.id)}>
                {settle.isPending ? "Creating…" : "Create settlement"}
              </button>
            </>
          }
        >
          <p>
            Sends <strong className="text-slate-100"><Money minor={confirm.balance.settleableMinor} /></strong> to {confirm.destination?.label}. This ignores the
            minimum settlement amount. In manual mode it waits for approval.
          </p>
          {settle.error && <Alert>{(settle.error as ApiRequestError).message}</Alert>}
        </Dialog>
      )}
    </PaymentsWorkspace>
  );
}
