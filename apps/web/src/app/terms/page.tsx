"use client";

import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import {
  IconShield,
  IconArrowRight,
  IconCheck,
} from "@/components/icons";

export default function TermsOfServicePage() {
  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 selection:bg-brand-500 selection:text-white font-sans antialiased">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[1000px] h-[400px] bg-brand-600/10 blur-[140px] rounded-full" />
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
            <span className="rounded-full bg-brand-500/15 border border-brand-500/30 px-2 py-0.5 text-[10px] font-bold text-brand-400 uppercase tracking-wider">
              Legal
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
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-brand-600 text-white font-bold text-xs shadow-sm"
              >
                <span>Terms of Service</span>
                <IconCheck size={14} />
              </Link>
              <Link
                href="/refund-policy"
                className="flex items-center justify-between px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-900 text-xs transition-colors"
              >
                <span>Refund &amp; Billing Policy</span>
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
                <div>Jurisdiction: Republic of Kenya</div>
                <div>Regulator: Communications Authority (CA)</div>
                <div>Compliance: Kenya Data Protection Act 2019</div>
              </div>
            </div>
          </aside>

          {/* Terms Content */}
          <article className="lg:col-span-8 space-y-8 rounded-2xl border border-slate-800 bg-slate-950/90 p-8 shadow-2xl backdrop-blur-xl">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="info">Standard Telecom Agreement</Badge>
                <span className="text-xs font-mono text-slate-400">Effective: August 28, 2026</span>
              </div>
              <h1 className="mt-2 text-3xl font-black text-white">Terms of Service</h1>
              <p className="mt-2 text-sm text-slate-400">
                Please read these Terms of Service carefully before utilizing the Mashupkgrid ISP platform, MikroTik API provisioning, FreeRADIUS accounting, and automated M-Pesa billing integrations.
              </p>
            </div>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-brand-400 font-mono">1.</span>
                <span>Acceptance &amp; Service Scope</span>
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                By creating an account, registering a tenant slug, connecting a MikroTik RouterOS device, or initiating subscriber billing on Mashupkgrid ISP (&quot;the Platform&quot;), you agree to be bound by these Terms. The platform provides software-as-a-service (SaaS) management tools for Internet Service Providers (ISPs), Wireless ISPs (WISPs), public hotspot venues, and enterprise carriers.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-brand-400 font-mono">2.</span>
                <span>Hardware &amp; Network Infrastructure</span>
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Operators are solely responsible for maintaining legitimate, licensed access to their underlying network hardware (including MikroTik RouterOS routers, OLTs, switches, and wireless access points). Mashupkgrid provides software commands via native RouterOS API and FreeRADIUS RFC protocols; operators must ensure secure firewalling of Port 8728/8729 TLS and RADIUS ports.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-brand-400 font-mono">3.</span>
                <span>Automated M-Pesa &amp; Payment Processing</span>
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Automated billing and STK push requests are transmitted via Safaricom Daraja 2.0 and accredited fintech payment gateways. Operators retain direct ownership of their Safaricom Paybill or Till numbers. Mashupkgrid does not take custody of operator funds; all customer payments flow directly from Safaricom into the operator&apos;s settlement bank or Paybill utility account.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-brand-400 font-mono">4.</span>
                <span>Acceptable Use &amp; Regulatory Compliance</span>
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Operators agree not to utilize Mashupkgrid ISP to facilitate unlawful telecommunications activities, unauthorized lawful intercept bypasses, malicious denial-of-service (DDoS) reflection, or fraudulent SIM-box routing. Operators must maintain compliance with Communications Authority of Kenya (CA) guidelines and local regulatory licensing.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-brand-400 font-mono">5.</span>
                <span>Service Level Agreement &amp; Availability</span>
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Mashupkgrid maintains a target platform uptime SLA of 99.98% across our core FreeRADIUS clusters and API endpoints. Maintenance windows are announced 48 hours in advance via the dashboard banner. Scheduled maintenance does not interrupt ongoing PPPoE data forwarding on subscriber routers.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-brand-400 font-mono">6.</span>
                <span>Contact &amp; Legal Notices</span>
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                For questions concerning these Terms, email legal@mashupkgrid.com or contact Mashupkgrid Telecom Technologies Ltd, Nairobi, Kenya.
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
