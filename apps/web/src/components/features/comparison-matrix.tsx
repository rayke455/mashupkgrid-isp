"use client";

import { Badge } from "@/components/ui";

interface Row {
  feature: string;
  mashupkgrid: string;
  manual: string;
  legacy: string;
}

const COMPARISON_ROWS: Row[] = [
  {
    feature: "Automated M-Pesa Paybill Reconciliation",
    mashupkgrid: "Instant (Daraja 2.0 Webhook < 1s)",
    manual: "Manual SMS tracking (3-5 hrs/day)",
    legacy: "Fragile IPN webhooks, frequent drops",
  },
  {
    feature: "Service Reconnection Speed",
    mashupkgrid: "< 2 seconds via FreeRADIUS CoA",
    manual: "Manual Winbox toggle by staff",
    legacy: "Requires customer router reboot",
  },
  {
    feature: "WhatsApp Self-Service Billing Bot",
    mashupkgrid: "Included (Meta Cloud API ready)",
    manual: "Staff answering WhatsApp chats manually",
    legacy: "Not supported",
  },
  {
    feature: "Visual Captive Portal Designer",
    mashupkgrid: "Drag-and-drop with mobile preview",
    manual: "Raw HTML editing via Winbox files",
    legacy: "Basic static templates",
  },
  {
    feature: "MikroTik RouterOS v7 Integration",
    mashupkgrid: "Native REST API / Port 8729 TLS",
    manual: "Winbox GUI only",
    legacy: "Legacy RouterOS v6 SSH commands",
  },
  {
    feature: "Subscriber Speedometer & Portal",
    mashupkgrid: "Included with KIXP cache peering",
    manual: "Customers using external speedtest.net",
    legacy: "Basic text-only customer portal",
  },
  {
    feature: "Multi-Tenant Franchise Isolation",
    mashupkgrid: "Unlimited isolated tenants & sub-ISPs",
    manual: "Impossible (shared sheets)",
    legacy: "Requires separate Linux servers",
  },
  {
    feature: "Infrastructure Uptime SLA",
    mashupkgrid: "99.99% High-Availability Cluster",
    manual: "Subject to human availability",
    legacy: "Single-point-of-failure VPS",
  },
];

export function ComparisonMatrix() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/95 shadow-2xl p-6 lg:p-8 backdrop-blur-xl space-y-8">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <Badge variant="info">Unmatched Operational Superiority</Badge>
        <h3 className="text-2xl sm:text-3xl font-black text-white">
          Mashupkgrid vs. The Alternatives
        </h3>
        <p className="text-xs sm:text-sm text-slate-400">
          See why over 120 Internet Service Providers migrated away from manual Excel spreadsheets and legacy Linux FreeRADIUS scripts.
        </p>
      </div>

      {/* Responsive Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs font-mono">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="py-3 px-4 font-sans font-bold text-slate-300">Capability</th>
              <th className="py-3 px-4 bg-brand-600/10 border-x border-brand-500/20 text-brand-400 font-bold">
                MASHUPKGRID ISP
              </th>
              <th className="py-3 px-4 text-slate-400 font-sans">Manual Winbox &amp; Excel</th>
              <th className="py-3 px-4 text-slate-400 font-sans">Legacy CLI / RadiusDesk</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {COMPARISON_ROWS.map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-900/40 transition-colors">
                <td className="py-3.5 px-4 font-sans font-semibold text-white">
                  {row.feature}
                </td>
                <td className="py-3.5 px-4 bg-brand-600/10 border-x border-brand-500/20 text-emerald-400 font-bold flex items-center gap-2">
                  <span className="text-emerald-400">✓</span>
                  <span>{row.mashupkgrid}</span>
                </td>
                <td className="py-3.5 px-4 text-slate-400">
                  <span className="text-rose-400 mr-1.5">✕</span>
                  <span>{row.manual}</span>
                </td>
                <td className="py-3.5 px-4 text-slate-400">
                  <span className="text-amber-400 mr-1.5">⚠</span>
                  <span>{row.legacy}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bottom Takeaway Pill */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-center text-xs text-slate-300 flex flex-col sm:flex-row items-center justify-between gap-3 font-sans">
        <div>
          <span className="font-bold text-white">Average WISP Migration Time: </span>
          <span className="text-brand-400 font-mono">Under 4 hours</span>
          <span className="text-slate-400 ml-2">with zero downtime on existing active subscribers.</span>
        </div>
        <a
          href="#scripts"
          className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold text-white border border-slate-700 transition-colors"
        >
          View 30s Provisioning Script &rarr;
        </a>
      </div>
    </div>
  );
}
