"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import {
  ENTRY_LABEL,
  EmptyRow,
  ErrorRow,
  LoadingRows,
  Money,
  Panel,
  PaymentsWorkspace,
  TENANT_TABS,
  TableShell,
  buttonClass,
  formatDateTime,
  td,
  th,
} from "@/components/payments-gateway/kit";
import { RequestSettlementButton } from "@/components/payments-gateway/tenant-widgets";
import { useTenantOverview } from "@/components/payments-gateway/use-tenant-overview";
import type { LedgerEntry, TenantBalance } from "@/components/payments-gateway/types";

const PAGE = 50;

export default function PaymentsBalancePage() {
  const { data: overview } = useTenantOverview();
  const ledger = useInfiniteQuery({
    queryKey: ["tenant-payments", "ledger"],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      apiFetch<{ balance: TenantBalance; entries: LedgerEntry[]; nextCursor: string | null }>(
        `/api/v1/tenant-payments/ledger?limit=${PAGE}${pageParam ? `&cursor=${pageParam}` : ""}`
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const b = overview?.balance;
  const entries = ledger.data?.pages.flatMap((p) => p.entries) ?? [];

  return (
    <PaymentsWorkspace
      tabs={TENANT_TABS}
      title="Balance"
      description="Your balance is the sum of every entry below — nothing is edited after the fact. Corrections appear as new entries."
      actions={<RequestSettlementButton balance={b} destination={overview?.destination} minimumMinor={overview?.settlement.minimumMinor} />}
    >
      <Panel title="How your balance adds up">
        {b ? (
          <dl className="grid gap-x-10 gap-y-3 text-sm sm:grid-cols-2">
            <Row label="Collected from customers" value={b.collectedMinor} />
            <Row label="Platform fees" value={-b.feesMinor} />
            <Row label="Refunds & reversals" value={-b.refundsMinor} />
            <Row label="Settled to you" value={-b.settledMinor} />
            <Row label="On its way to you" value={-b.pendingSettlementMinor} />
            <div className="flex items-baseline justify-between border-t border-obsidian-800 pt-3 sm:col-span-2">
              <dt className="font-semibold text-white">Available balance</dt>
              <dd className={`text-xl font-semibold tabular-nums ${b.availableMinor < 0 ? "text-red-300" : "text-white"}`}>
                <Money minor={b.availableMinor} cents />
              </dd>
            </div>
            {b.availableMinor < 0 && (
              <p className="text-xs text-red-300 sm:col-span-2">
                A refund of money already sent to you has left your balance below zero. It is recovered from your next collections.
              </p>
            )}
          </dl>
        ) : (
          <div className="h-40 animate-pulse rounded-md bg-obsidian-800" />
        )}
      </Panel>

      <Panel title="Ledger" description="Newest first" padded={false}>
        <TableShell minWidth={640}>
          <thead>
            <tr>
              <th className={th}>Date</th>
              <th className={th}>Entry</th>
              <th className={th}>Description</th>
              <th className={`${th} text-right`}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {ledger.isLoading && <LoadingRows cols={4} rows={8} />}
            {ledger.error && <ErrorRow cols={4} error={ledger.error} onRetry={() => void ledger.refetch()} />}
            {!ledger.isLoading && !ledger.error && entries.length === 0 && (
              <EmptyRow cols={4} title="No ledger entries yet">
                Entries appear when the gateway collects a payment for you.
              </EmptyRow>
            )}
            {entries.map((e) => (
              <tr key={e.id}>
                <td className={`${td} text-slate-400`}>{formatDateTime(e.createdAt)}</td>
                <td className={td}>{ENTRY_LABEL[e.entryType] ?? e.entryType}</td>
                <td className={`${td} max-w-[360px] truncate text-slate-400`} title={e.description}>
                  {e.description}
                </td>
                <td className={`${td} text-right font-medium tabular-nums ${e.direction === "CREDIT" ? "text-emerald-300" : "text-slate-100"}`}>
                  {e.direction === "CREDIT" ? "+" : "−"} <Money minor={e.amountMinor} cents />
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
        {ledger.hasNextPage && (
          <div className="border-t border-obsidian-800 p-3 text-center">
            <button type="button" className={buttonClass("secondary", "sm")} disabled={ledger.isFetchingNextPage} onClick={() => void ledger.fetchNextPage()}>
              {ledger.isFetchingNextPage ? "Loading…" : "Load older entries"}
            </button>
          </div>
        )}
      </Panel>
    </PaymentsWorkspace>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-slate-400">{label}</dt>
      <dd className={`tabular-nums ${value < 0 ? "text-slate-300" : "text-white"}`}>
        {value < 0 ? "−" : ""}
        <Money minor={Math.abs(value)} cents />
      </dd>
    </div>
  );
}
