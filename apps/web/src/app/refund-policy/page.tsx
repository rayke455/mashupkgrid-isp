"use client";

import Link from "next/link";
import { Badge } from "@/components/ui";
import { IconCheck } from "@/components/icons";

export default function RefundPolicyPage() {
  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 selection:bg-brand-500 selection:text-white font-sans antialiased">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[1000px] h-[400px] bg-emerald-600/10 blur-[140px] rounded-full" />
        <div className="absolute inset-0 bg-grid-pattern opacity-50" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-slate-900/85 border-b border-slate-800">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl overflow-hidden ring-1 ring-cyan-500/40 shadow-md group-hover:scale-105 transition-transform bg-slate-950">
              <img src="/logo.jpg" alt="Mashupkgrid ISP Logo" className="h-full w-full object-cover" />
            </div>
            <span className="text-base font-extrabold tracking-tight text-white">MASHUPKGRID</span>
            <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
              Refunds
            </span>
          </Link>
          <div className="flex items-center gap-3 text-xs">
            <Link href="/" className="text-slate-400 hover:text-white transition-colors">
              &larr; Back to Platform
            </Link>
            <Link href="/login" className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-white font-medium hover:bg-slate-700">
              Console Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* Body Container */}
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Policy Navigation Sidebar */}
          <aside className="lg:col-span-4 space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5 backdrop-blur-xl space-y-2 sticky top-24">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                Legal &amp; Compliance Center
              </p>
              <Link
                href="/terms"
                className="flex items-center justify-between px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-900 text-xs transition-colors"
              >
                <span>Terms of Service</span>
              </Link>
              <Link
                href="/refund-policy"
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-600 text-white font-bold text-xs shadow-sm"
              >
                <span>Refund &amp; Billing Policy</span>
                <IconCheck size={14} />
              </Link>
              <Link
                href="/referral-policy"
                className="flex items-center justify-between px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-900 text-xs transition-colors"
              >
                <span>Referral &amp; Affiliate Policy</span>
              </Link>
              <Link
                href="/age-policy"
                className="flex items-center justify-between px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-900 text-xs transition-colors"
              >
                <span>Age &amp; Protection Policy</span>
              </Link>

              <div className="pt-4 mt-4 border-t border-slate-800 text-[11px] text-slate-400 space-y-1 font-mono">
                <div>M-Pesa STK Reversals Supported</div>
                <div>Dispute SLA: &lt; 24 business hours</div>
                <div>Automated Ledger Balancing</div>
              </div>
            </div>
          </aside>

          {/* Refund Policy Content */}
          <article className="lg:col-span-8 space-y-8 rounded-2xl border border-slate-800 bg-slate-950/90 p-8 shadow-2xl backdrop-blur-xl">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="success">Telecom Billing Protection</Badge>
                <span className="text-xs font-mono text-slate-400">Effective: August 28, 2026</span>
              </div>
              <h1 className="mt-2 text-3xl font-black text-white">Refund &amp; Billing Policy</h1>
              <p className="mt-2 text-sm text-slate-400">
                Transparent policies regarding ISP platform SaaS subscriptions, automated Safaricom M-Pesa payments, hotspot voucher purchases, and service outage credits.
              </p>
            </div>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-emerald-400 font-mono">1.</span>
                <span>SaaS Subscription 14-Day Guarantee</span>
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                For newly registered ISPs purchasing a paid platform tier (Starter WISP or Growth Telecom), we provide a 14-day full refund guarantee if the platform fails to integrate with your verified MikroTik hardware or Safaricom Daraja API credentials. Refund requests can be initiated directly from Settings &rarr; Billing.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-emerald-400 font-mono">2.</span>
                <span>End-Subscriber M-Pesa Double Deductions</span>
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                In rare events where a subscriber experiences duplicate Safaricom STK push prompts due to cellular network delays, our ledger engine automatically flags the duplicate transaction. The operator can authorize an instant M-Pesa B2C refund back to the subscriber&apos;s phone number or credit their internal wallet for next month&apos;s invoice.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-emerald-400 font-mono">3.</span>
                <span>Hotspot Vouchers Policy</span>
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Hotspot access vouchers (1-Hour, 24-Hour, or Weekly passes) that have been successfully logged into and begun consumption of time or byte quota are non-refundable. Unused vouchers with verifiable zero bytes transferred may be revoked or re-issued by the hotspot venue administrator within 48 hours of purchase.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-emerald-400 font-mono">4.</span>
                <span>Service Downtime &amp; Fiber Cut Credits</span>
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                If the Mashupkgrid FreeRADIUS cloud cluster experiences unscheduled downtime exceeding our 99.98% monthly SLA, affected operators receive pro-rated billing credits automatically applied to their subsequent renewal invoice upon submitting an outage verification ticket.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-emerald-400 font-mono">5.</span>
                <span>Dispute Resolution &amp; Inquiries</span>
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                To submit a billing inquiry or duplicate payment verification request, please email billing@mashupkgrid.com with the relevant Safaricom M-Pesa transaction code (e.g. SK########) and account reference.
              </p>
            </section>
          </article>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800 bg-slate-950 py-6 text-center text-xs text-slate-500">
        &copy; {new Date().getFullYear()} MASHUPKGRID Telecom Technologies Ltd. All rights reserved.
      </footer>
    </main>
  );
}
