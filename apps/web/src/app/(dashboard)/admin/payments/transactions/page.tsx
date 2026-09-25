"use client";

import { PLATFORM_TABS, Panel, PaymentsWorkspace } from "@/components/payments-gateway/kit";
import { TransactionsView } from "@/components/payments-gateway/lists";
import { usePlatformTenants } from "@/components/payments-gateway/use-platform";

export default function PlatformTransactionsPage() {
  const tenants = usePlatformTenants();
  return (
    <PaymentsWorkspace
      tabs={PLATFORM_TABS}
      title="Transactions"
      description="Every payment the gateway collected for an ISP. Open one to see its ledger entries, refund it, or reverse it."
    >
      <Panel padded={false}>
        <TransactionsView endpointBase="/api/v1/platform/payments" admin tenants={tenants.data?.map((t) => ({ id: t.id, name: t.name }))} />
      </Panel>
    </PaymentsWorkspace>
  );
}
