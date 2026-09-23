"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import {
  Alert,
  DetailList,
  Drawer,
  EmptyRow,
  ErrorRow,
  LoadingRows,
  PLATFORM_TABS,
  Pagination,
  Panel,
  PaymentsWorkspace,
  StatusBadge,
  TableShell,
  formatDateTime,
  inputClass,
  qs,
  td,
  th,
} from "@/components/payments-gateway/kit";
import type { Page } from "@/components/payments-gateway/types";

interface WebhookEvent {
  id: string;
  provider: string;
  eventType: string;
  externalId: string | null;
  status: string;
  transactionReference: string | null;
  errorMessage: string | null;
  sourceIp: string | null;
  receivedAt: string;
  processedAt: string | null;
  tenant: { name: string } | null;
  payload?: unknown;
  response?: unknown;
}

const EVENT_LABEL: Record<string, string> = {
  STK_CALLBACK: "STK push result",
  C2B_CONFIRMATION: "Paybill payment (ISP paybill)",
  PLATFORM_C2B_CONFIRMATION: "Paybill payment (platform)",
  SETTLEMENT_RESULT: "Settlement result",
  SETTLEMENT_TIMEOUT: "Settlement queue timeout",
};

export default function WebhooksPage() {
  const [status, setStatus] = useState("");
  const [eventType, setEventType] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [status, eventType, debounced]);

  const query = qs({ status, eventType, search: debounced, page, pageSize: 30 });
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["platform-payments", "webhooks", query],
    queryFn: () => apiFetch<Page<WebhookEvent>>(`/api/v1/platform/payments/webhooks${query}`),
    placeholderData: (prev) => prev,
    refetchInterval: 30_000,
  });
  const detail = useQuery({
    queryKey: ["platform-payments", "webhook", openId],
    queryFn: () => apiFetch<WebhookEvent>(`/api/v1/platform/payments/webhooks/${openId}`),
    enabled: Boolean(openId),
  });

  return (
    <PaymentsWorkspace
      tabs={PLATFORM_TABS}
      title="Webhooks"
      description="Every callback M-Pesa sent us — processed, duplicate, ignored or rejected. Duplicates are expected: Safaricom retries, and a duplicate never moves money twice."
    >
      <Panel padded={false}>
        <div className="grid gap-2 border-b border-slate-100 p-4 sm:grid-cols-3">
          <input className={inputClass} placeholder="Checkout ID, M-Pesa ID or reference" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search webhooks" />
          <select className={inputClass} value={eventType} onChange={(e) => setEventType(e.target.value)} aria-label="Event type">
            <option value="">All event types</option>
            {Object.entries(EVENT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Processing status">
            <option value="">Any status</option>
            {["PROCESSED", "DUPLICATE", "IGNORED", "REJECTED", "FAILED", "RECEIVED"].map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <TableShell minWidth={900}>
          <thead>
            <tr>
              <th className={th}>Received</th>
              <th className={th}>Event</th>
              <th className={th}>Provider</th>
              <th className={th}>ISP</th>
              <th className={th}>Reference</th>
              <th className={th}>Status</th>
              <th className={th}>Error</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <LoadingRows cols={7} rows={10} />}
            {error && <ErrorRow cols={7} error={error} onRetry={() => void refetch()} />}
            {data && data.items.length === 0 && <EmptyRow cols={7} title="No callbacks received yet" />}
            {data?.items.map((e) => (
              <tr key={e.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenId(e.id)}>
                <td className={`${td} text-slate-500`}>
                  <button type="button" className="text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" onClick={(ev) => { ev.stopPropagation(); setOpenId(e.id); }}>
                    {formatDateTime(e.receivedAt)}
                  </button>
                </td>
                <td className={td}>{EVENT_LABEL[e.eventType] ?? e.eventType}</td>
                <td className={td}>{e.provider === "MPESA" ? "M-Pesa" : e.provider}</td>
                <td className={td}>{e.tenant?.name ?? <span className="text-slate-400">—</span>}</td>
                <td className={`${td} font-mono text-xs`}>{e.transactionReference ?? e.externalId ?? "—"}</td>
                <td className={td}>
                  <StatusBadge status={e.status} />
                </td>
                <td className={`${td} max-w-[240px] truncate text-slate-500`} title={e.errorMessage ?? undefined}>
                  {e.errorMessage ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      </Panel>

      <Drawer open={Boolean(openId)} onClose={() => setOpenId(null)} title="Webhook event" subtitle={detail.data ? formatDateTime(detail.data.receivedAt) : undefined}>
        {detail.isLoading && <div className="h-48 animate-pulse rounded-lg bg-slate-100" />}
        {detail.error && <Alert>{(detail.error as Error).message}</Alert>}
        {detail.data && (
          <div className="space-y-5">
            <DetailList
              items={[
                { label: "Webhook ID", value: <span className="font-mono text-xs">{detail.data.id}</span> },
                { label: "Event", value: EVENT_LABEL[detail.data.eventType] ?? detail.data.eventType },
                { label: "Provider", value: detail.data.provider },
                { label: "Status", value: <StatusBadge status={detail.data.status} /> },
                { label: "Provider ID", value: detail.data.externalId ?? "—" },
                { label: "Transaction", value: detail.data.transactionReference ?? "—" },
                { label: "ISP", value: detail.data.tenant?.name ?? "—" },
                { label: "Processed", value: formatDateTime(detail.data.processedAt) },
                { label: "Source IP", value: detail.data.sourceIp ?? "—" },
                ...(detail.data.errorMessage ? [{ label: "Error", value: <span className="text-red-700">{detail.data.errorMessage}</span> }] : []),
              ]}
            />
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Payload</h3>
              <pre className="max-h-80 overflow-auto rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-100">{JSON.stringify(detail.data.payload, null, 2)}</pre>
            </div>
            {detail.data.response !== undefined && detail.data.response !== null && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">Outcome</h3>
                <pre className="overflow-auto rounded-lg bg-slate-100 p-3 text-xs leading-5 text-slate-800">{JSON.stringify(detail.data.response, null, 2)}</pre>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </PaymentsWorkspace>
  );
}
