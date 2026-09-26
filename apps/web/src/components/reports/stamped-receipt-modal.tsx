"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui";

interface StampedReceiptData {
  receiptNumber: string;
  issuedAt: string;
  stampedDate: string;
  verificationStamp: string;
  tenant: {
    id: string;
    name: string;
    currency: string;
    timezone: string;
    logoUrl: string | null;
  };
  customer: {
    id: string | null;
    fullName: string;
    customerNumber: string;
    phone: string;
    email: string | null;
    address: string | null;
  };
  payment: {
    id: string;
    amountMinor: number;
    currency: string;
    method: string;
    reference: string;
    paidAt: string;
    status: string;
  };
  invoice: {
    id: string | null;
    invoiceNumber: string | null;
    dueDate: string | null;
    description: string;
  } | null;
}

export function StampedReceiptModal({
  paymentId,
  onClose,
}: {
  paymentId: string | null;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["stamped-receipt", paymentId],
    queryFn: () => apiFetch<StampedReceiptData>(`/api/v1/reports/receipts/${paymentId}`),
    enabled: Boolean(paymentId),
  });

  if (!paymentId) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="theme-native fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm print:p-0 print:bg-white print:static print:z-auto">
      {/* Printable Container */}
      <div className="relative w-full max-w-xl bg-white dark:bg-obsidian-900 text-slate-900 dark:text-white rounded-2xl shadow-2xl border border-slate-200 dark:border-obsidian-800 overflow-hidden print:border-none print:shadow-none print:w-full print:max-w-none print:rounded-none">
        
        {/* Modal Top Actions (Hidden in Print) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-obsidian-800 bg-slate-50/50 dark:bg-obsidian-950/50 print:hidden">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="text-sm font-semibold tracking-wide uppercase text-slate-700 dark:text-slate-300">
              Verified Stamped Receipt
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handlePrint} className="gap-1.5 bg-brand-600 hover:bg-brand-500 text-white font-medium text-xs">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print / Save PDF
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Loading / Error States */}
        {isLoading && (
          <div className="p-12 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-brand-500 border-r-transparent" />
            <p className="mt-3 text-sm text-slate-500">Generating stamped receipt...</p>
          </div>
        )}

        {error && (
          <div className="p-8 text-center">
            <p className="text-sm text-red-500 font-medium">Failed to load receipt details.</p>
            <Button size="sm" className="mt-4" onClick={onClose}>Close</Button>
          </div>
        )}

        {/* Receipt Body */}
        {data && (
          <div className="p-6 sm:p-8 space-y-6 print:p-4 print:text-black">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-dashed border-slate-200 dark:border-obsidian-800">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white print:text-black">
                  {data.tenant.name}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 print:text-gray-600">
                  Broadband & Hotspot Internet Services
                </p>
                <p className="text-xs font-mono text-slate-400 mt-2">
                  Receipt Ref: <span className="font-semibold text-slate-700 dark:text-slate-200 print:text-black">{data.receiptNumber}</span>
                </p>
              </div>

              {/* Official Stamp */}
              <div className="inline-flex flex-col items-center justify-center p-3 rounded-xl border-2 border-emerald-500/80 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 rotate-[-2deg] select-none print:border-emerald-600 print:bg-transparent">
                <span className="text-[10px] font-bold tracking-widest uppercase">OFFICIAL STAMP</span>
                <span className="text-base font-extrabold tracking-wider">PAID</span>
                <span className="text-[9px] font-mono mt-0.5">{data.stampedDate}</span>
                <span className="text-[8px] font-mono opacity-80">{data.verificationStamp}</span>
              </div>
            </div>

            {/* Billed To / Details Grid */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <span className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold">Client Details</span>
                <p className="font-semibold text-slate-900 dark:text-white text-sm print:text-black">
                  {data.customer.fullName}
                </p>
                <p className="text-slate-600 dark:text-slate-300 print:text-gray-700">
                  Acc #: <span className="font-mono">{data.customer.customerNumber}</span>
                </p>
                <p className="text-slate-600 dark:text-slate-300 print:text-gray-700">
                  Phone: {data.customer.phone}
                </p>
                {data.customer.email && (
                  <p className="text-slate-500 dark:text-slate-400">{data.customer.email}</p>
                )}
              </div>

              <div className="space-y-1 text-right">
                <span className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold">Payment Details</span>
                <p className="font-semibold text-slate-900 dark:text-white text-sm print:text-black">
                  {data.payment.method.replace("_", " ")}
                </p>
                <p className="text-slate-600 dark:text-slate-300 print:text-gray-700">
                  Reference: <span className="font-mono font-medium">{data.payment.reference}</span>
                </p>
                <p className="text-slate-500 dark:text-slate-400">
                  Date: {data.stampedDate}
                </p>
              </div>
            </div>

            {/* Itemized Table */}
            <div className="rounded-xl border border-slate-200 dark:border-obsidian-800 overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-obsidian-950/60 border-b border-slate-200 dark:border-obsidian-800 text-slate-500 uppercase tracking-wider font-semibold text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3">Description / Service</th>
                    <th className="py-2.5 px-3 text-right">Amount (KES)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-obsidian-800">
                  <tr>
                    <td className="py-3 px-3">
                      <p className="font-semibold text-slate-800 dark:text-slate-200 print:text-black">
                        {data.invoice?.description ?? "Internet Broadband Package"}
                      </p>
                      {data.invoice?.invoiceNumber && (
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Invoice #{data.invoice.invoiceNumber}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-semibold text-slate-900 dark:text-white print:text-black">
                      KES {(data.payment.amountMinor / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tbody>
                <tfoot className="bg-slate-50/80 dark:bg-obsidian-950/80 font-semibold border-t border-slate-200 dark:border-obsidian-800">
                  <tr>
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">Total Paid</td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400 text-sm">
                      KES {(data.payment.amountMinor / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Footer / Verification */}
            <div className="pt-2 text-center border-t border-slate-100 dark:border-obsidian-800 space-y-1">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Thank you for your business. This is an electronic stamped receipt.
              </p>
              <p className="text-[10px] font-mono text-slate-400">
                Official Validation Stamp: {data.verificationStamp} · Stamped on {data.stampedDate}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
