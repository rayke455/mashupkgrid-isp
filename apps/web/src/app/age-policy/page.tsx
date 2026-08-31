"use client";

import Link from "next/link";
import { Badge } from "@/components/ui";
import { IconCheck } from "@/components/icons";

export default function AgePolicyPage() {
  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 selection:bg-brand-500 selection:text-white font-sans antialiased">
      {/* Ambient background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[1000px] h-[400px] bg-sky-600/10 blur-[140px] rounded-full" />
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
            <span className="rounded-full bg-sky-500/15 border border-sky-500/30 px-2 py-0.5 text-[10px] font-bold text-sky-400 uppercase tracking-wider">
              Safety
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
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-sky-600 text-white font-bold text-xs shadow-sm"
              >
                <span>Age &amp; Protection Policy</span>
                <IconCheck size={14} />
              </Link>

              <div className="pt-4 mt-4 border-t border-slate-800 text-[11px] text-slate-400 space-y-1 font-mono">
                <div>Minimum Account Age: 18 Years</div>
                <div>Parental DNS Controls Supported</div>
                <div>Child Online Protection (COP)</div>
              </div>
            </div>
          </aside>

          {/* Age Policy Content */}
          <article className="lg:col-span-8 space-y-8 rounded-2xl border border-slate-800 bg-slate-950/90 p-8 shadow-2xl backdrop-blur-xl">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="info">Child Online Safety &amp; Age Policy</Badge>
                <span className="text-xs font-mono text-slate-400">Effective: August 28, 2026</span>
              </div>
              <h1 className="mt-2 text-3xl font-black text-white">Age Verification &amp; Protection Policy</h1>
              <p className="mt-2 text-sm text-slate-400">
                Our standards regarding minimum age eligibility for account holders, parental authority, data privacy safeguards for minors, and child online protection.
              </p>
            </div>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-sky-400 font-mono">1.</span>
                <span>Minimum Age Eligibility (18+)</span>
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                To register an operator console account, sign a telecommunications broadband subscription agreement, or initiate recurring M-Pesa billing on Mashupkgrid ISP, users must be at least 18 years of age (the legal age of majority in the Republic of Kenya) or have explicit contractual authorization from a parent or legal guardian.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-sky-400 font-mono">2.</span>
                <span>Protection of Minors on Broadband Networks</span>
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                While minors frequently access home fiber and public Wi-Fi networks managed through Mashupkgrid routers, our platform does not knowingly collect personal identifying information (PII) directly from children under 13 years of age. All subscriber contracts and billing records are registered under the adult account holder&apos;s name.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-sky-400 font-mono">3.</span>
                <span>Parental Controls &amp; Family Filtering</span>
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Mashupkgrid ISP enables operators to provision family-safe DNS profiles (such as Cloudflare 1.1.1.3 Family Protection or CleanBrowsing Adult Filter) directly through MikroTik DHCP server and RADIUS attribute configuration. Parents and guardians may request family-safe speed profiles on their residential PPPoE line.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-sky-400 font-mono">4.</span>
                <span>Kenya Data Protection Act Compliance</span>
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Pursuant to Section 33 of the Kenya Data Protection Act 2019, any processing of personal data relating to minors requires verifiable consent from their parent or guardian. If an operator discovers that an unauthorized minor has created an account without parental consent, the account is terminated and associated records expunged.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-sky-400 font-mono">5.</span>
                <span>Inquiries &amp; Parental Requests</span>
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Parents or guardians with questions regarding parental controls, content filtering, or minor data deletion may contact our Data Protection Officer at privacy@mashupkgrid.com.
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
