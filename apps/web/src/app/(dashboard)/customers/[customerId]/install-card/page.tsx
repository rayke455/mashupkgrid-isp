"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import QRCode from "qrcode";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { tr } from "@/lib/tr";
import { Notice, darkButton } from "@/components/dashboard/surface";
import { IconPrinter, IconRefresh } from "@/components/icons";

/**
 * The printable self-install card: the customer scans the QR, sets up their app login and sees
 * how to connect their router. Printed on plain paper; everything outside the card is hidden.
 */

interface Card {
  code: string;
  url: string;
  expiresAt: string;
  activatedAt: string | null;
  hasLogin: boolean;
  isp: string;
  customer: { fullName: string; customerNumber: string; phone: string };
  connections: { plan: string; pppoeUsername: string | null }[];
}

export default function InstallCardPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const [card, setCard] = useState<Card | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useMutation({
    mutationFn: (renew: boolean) => apiFetch<Card>(`/api/v1/customers/${customerId}/install-card`, { method: "POST", body: JSON.stringify({ renew }) }),
    onSuccess: async (c) => {
      setCard(c);
      setQr(await QRCode.toDataURL(c.url, { margin: 1, width: 320, errorCorrectionLevel: "M" }));
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : tr("Something went wrong.")),
  });
  const { mutate } = load;
  useEffect(() => {
    mutate(false);
  }, [mutate]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/customers/${customerId}`} className="text-sm text-slate-400 hover:underline">
          ← {tr("Back to customer")}
        </Link>
        <div className="flex gap-2">
          <button type="button" className={darkButton("secondary")} disabled={load.isPending} onClick={() => confirm(tr("Make a new card? The old card stops working.")) && load.mutate(true)}>
            <IconRefresh size={16} /> {tr("New card")}
          </button>
          <button type="button" className={darkButton("primary")} onClick={() => window.print()} disabled={!card}>
            <IconPrinter size={16} /> {tr("Print")}
          </button>
        </div>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      {card?.hasLogin && (
        <Notice tone="neutral" >
          {tr("This customer already has an app login. The card still shows them how to connect their router, and signs them in.")}
        </Notice>
      )}

      {card && (
        <div id="install-card" className="theme-native rounded-2xl border border-slate-300 bg-white p-8 text-slate-900 print:border-slate-400">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{card.isp}</p>
          <h1 className="mt-1 text-2xl font-bold">
            {tr("Welcome")}, {card.customer.fullName.split(/\s+/)[0]}
          </h1>
          <p className="text-sm text-slate-600">
            {tr("Account")} {card.customer.customerNumber}
          </p>
          <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {qr && <img src={qr} alt={tr("QR code to set up your account")} className="h-44 w-44 shrink-0" />}
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-6">
              <li>{tr("Scan this code with your phone camera.")}</li>
              <li>{tr("Choose an email and password for your account.")}</li>
              <li>{tr("Follow the steps shown to connect your router. Your internet login appears there.")}</li>
              <li>{tr("Pay your bill, get help and track your usage from the app.")}</li>
            </ol>
          </div>
          {card.connections.map((c, i) => (
            <p key={i} className="mt-4 text-sm">
              {tr("Plan")}: <strong>{c.plan}</strong>
              {c.pppoeUsername && (
                <>
                  {" "}
                  · {tr("Internet username")}: <span className="font-mono">{c.pppoeUsername}</span>
                </>
              )}
            </p>
          ))}
          <p className="mt-4 break-all text-xs text-slate-500">
            {tr("No camera? Open")} {card.url}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {tr("Valid until")} {new Date(card.expiresAt).toLocaleDateString()}. {tr("Keep this card private: it opens your account.")}
          </p>
        </div>
      )}
    </div>
  );
}
