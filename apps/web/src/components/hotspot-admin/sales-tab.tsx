"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";
import { EmptyState, Panel, Pill, TableShell, td, th } from "@/components/dashboard/surface";
import { VOUCHER_STATUS, formatBytes, type HotspotPurchase } from "./shared";

export function SalesTab() {
  const { data: purchases, isLoading } = useQuery({
    queryKey: ["hotspot-purchases"],
    queryFn: () => apiFetch<HotspotPurchase[]>("/api/v1/vouchers/purchases"),
  });

  return (
    <Panel title="Sales" description="Everyone who bought a package on your hotspot portal, and how much they've used." padded={false}>
      {isLoading ? (
        <p className="px-5 py-8 text-sm text-slate-400">Loading sales…</p>
      ) : !purchases || purchases.length === 0 ? (
        <EmptyState title="No sales yet">Purchases made on your hotspot portal appear here.</EmptyState>
      ) : (
        <TableShell minWidth={1000}>
          <thead>
            <tr>
              <th className={th}>Paid</th>
              <th className={th}>Customer</th>
              <th className={th}>Package</th>
              <th className={`${th} text-right`}>Amount</th>
              <th className={th}>Receipt</th>
              <th className={th}>Voucher</th>
              <th className={th}>Phone (MAC)</th>
              <th className={th}>Used</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((p, i) => {
              const used = (p.bytesIn ?? 0) + (p.bytesOut ?? 0);
              const cap = p.dataCapMb ? p.dataCapMb * 1024 * 1024 : null;
              return (
                <tr key={`${p.receiptNumber ?? p.voucherCode ?? i}-${p.paidAt}`}>
                  <td className={`${td} text-slate-400`}>{new Date(p.paidAt).toLocaleString()}</td>
                  <td className={td}>
                    <span className="text-slate-200">{p.contact ?? "—"}</span>
                    <span className="block text-xs text-slate-500">{p.method === "MPESA" ? "M-Pesa" : "Card"}</span>
                  </td>
                  <td className={td}>{p.packageName ?? "—"}</td>
                  <td className={`${td} text-right font-medium tabular-nums text-white`}>{formatMoney(p.amountMinor, p.currency)}</td>
                  <td className={`${td} font-mono text-[13px] text-slate-300`}>{p.receiptNumber ?? "—"}</td>
                  <td className={td}>
                    {p.voucherCode ? (
                      <>
                        <span className="font-mono text-[13px] text-slate-200">{p.voucherCode}</span>
                        {p.voucherStatus && (
                          <span className="ml-2">
                            <Pill tone={VOUCHER_STATUS[p.voucherStatus].tone}>{VOUCHER_STATUS[p.voucherStatus].label}</Pill>
                          </span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={`${td} font-mono text-[13px] text-slate-300`}>
                    {p.devices.length ? (
                      <>
                        {p.devices[0]}
                        {p.devices.length > 1 && <span className="block text-xs text-slate-500">+{p.devices.length - 1} more</span>}
                      </>
                    ) : (
                      <span className="text-slate-500">Not connected yet</span>
                    )}
                  </td>
                  <td className={td}>
                    {p.bytesIn === null && p.bytesOut === null ? (
                      <span className="text-slate-500">—</span>
                    ) : (
                      <>
                        {formatBytes(used)}
                        {cap ? <span className="text-slate-500"> of {formatBytes(cap)}</span> : null}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      )}
    </Panel>
  );
}
