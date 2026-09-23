"use client";

import { Panel, PaymentsWorkspace, TENANT_TABS } from "@/components/payments-gateway/kit";
import { SettlementsView } from "@/components/payments-gateway/lists";
import { RequestSettlementButton } from "@/components/payments-gateway/tenant-widgets";
import { useTenantOverview } from "@/components/payments-gateway/use-tenant-overview";
import { describeSchedule } from "@/components/payments-gateway/types";

export default function PaymentsSettlementsPage() {
  const { data } = useTenantOverview();
  return (
    <PaymentsWorkspace
      tabs={TENANT_TABS}
      title="Settlements"
      description={
        data
          ? `Money sent from your balance to ${data.destination?.label ?? "your destination"}. ${describeSchedule(data.settlement)}.`
          : "Money sent from your balance to your settlement destination."
      }
      actions={<RequestSettlementButton balance={data?.balance} destination={data?.destination} minimumMinor={data?.settlement.minimumMinor} />}
    >
      <Panel padded={false}>
        <SettlementsView endpointBase="/api/v1/tenant-payments" />
      </Panel>
    </PaymentsWorkspace>
  );
}
