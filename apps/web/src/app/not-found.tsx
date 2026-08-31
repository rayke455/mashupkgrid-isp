import Link from "next/link";
import { Button, Badge } from "@/components/ui";
import { IconArrowRight, IconRouter, IconPulse } from "@/components/icons";

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen items-center justify-center px-6 bg-obsidian-950 text-slate-100 font-sans selection:bg-brand-500 selection:text-white">
      {/* Ambient Glow & Grid */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-brand-600/15 blur-[140px] rounded-full" />
        <div className="absolute bottom-10 left-10 w-[500px] h-[400px] bg-rose-500/10 blur-[130px] rounded-full" />
        <div className="absolute inset-0 bg-grid-pattern opacity-50" />
      </div>

      <div className="relative z-10 w-full max-w-xl text-center space-y-6">
        {/* Brand Logo */}
        <div className="mx-auto h-16 w-16 overflow-hidden rounded-2xl ring-2 ring-cyan-500/40 shadow-xl shadow-cyan-500/25 bg-slate-950 flex items-center justify-center">
          <img src="/logo.jpg" alt="Mashupkgrid ISP Logo" className="h-full w-full object-cover" />
        </div>

        {/* 404 Route Error Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-rose-950/60 border border-rose-500/30 text-rose-300 text-xs font-mono">
          <span className="h-2 w-2 rounded-full bg-rose-400 animate-ping" />
          <span>HTTP 404 // UNROUTED_DESTINATION</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight">
          Packet Dropped by Core Gateway
        </h1>

        <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
          The routing table could not resolve the requested URI path. The interface might have been relocated, unprovisioned, or restricted.
        </p>

        {/* Quick Navigation Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left pt-2">
          <Link
            href="/"
            className="p-4 rounded-xl bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white group-hover:text-brand-400 transition-colors">
                Public Landing Page
              </span>
              <IconArrowRight size={14} className="text-slate-500 group-hover:text-white transition-colors" />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Explore platform features, simulator &amp; pricing.</p>
          </Link>

          <Link
            href="/login"
            className="p-4 rounded-xl bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors">
                Operator Sign In
              </span>
              <IconArrowRight size={14} className="text-slate-500 group-hover:text-white transition-colors" />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Access your MikroTik RADIUS console.</p>
          </Link>
        </div>

        {/* Action Button */}
        <div className="pt-2">
          <Link href="/">
            <Button className="px-8 py-3 font-bold shadow-glow gap-2">
              <IconRouter size={16} />
              <span>Return to Core Portal</span>
            </Button>
          </Link>
        </div>

        {/* Telemetry Status Bar */}
        <div className="pt-6 border-t border-slate-800/80 text-[11px] font-mono text-slate-500 flex items-center justify-center gap-4">
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>RADIUS Gateway: ONLINE</span>
          </span>
          <span className="text-slate-700">|</span>
          <span>BGP Core: 0.0% Loss</span>
        </div>
      </div>
    </main>
  );
}
