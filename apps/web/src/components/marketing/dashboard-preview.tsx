import type { ReactNode } from "react";
import {
  IconDashboard,
  IconInvoice,
  IconPackage,
  IconPulse,
  IconRouter,
  IconTicket,
  IconUsers,
} from "@/components/icons";

/**
 * Illustrations of the MashupHost console for the marketing site.
 *
 * The labels, navigation and layout mirror the real dashboard (see app/(dashboard)/layout.tsx),
 * but the figures are sample data — a public page has no tenant to read real numbers from — and
 * each preview says so in a visible "Sample data" tag. The whole frame is exposed to assistive tech
 * as a single labelled image rather than a pile of meaningless numbers.
 */

const NAV = [
  { label: "Dashboard", icon: IconDashboard, key: "dashboard" },
  { label: "Customers", icon: IconUsers, key: "customers" },
  { label: "Packages", icon: IconPackage, key: "packages" },
  { label: "Invoices", icon: IconInvoice, key: "invoices" },
  { label: "Routers", icon: IconRouter, key: "routers" },
  { label: "Hotspot & Vouchers", icon: IconTicket, key: "hotspot" },
  { label: "Reports", icon: IconPulse, key: "reports" },
] as const;

type NavKey = (typeof NAV)[number]["key"];

function Frame({
  active,
  title,
  subtitle,
  ariaLabel,
  children,
}: {
  active: NavKey;
  title: string;
  subtitle: string;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_48px_-20px_rgba(15,23,42,0.22)]"
    >
      {/* App bar */}
      <div className="flex h-10 items-center justify-between border-b border-slate-200 bg-white px-3 sm:px-4">
        <div className="flex items-center gap-2">
          <span className="grid h-5 w-5 place-items-center rounded bg-blue-700 text-[10px] font-bold text-white">M</span>
          <span className="text-[11px] font-semibold text-slate-900">Demo ISP</span>
          <span className="hidden text-[11px] text-slate-400 sm:inline">/ {title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded border border-slate-200 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-500">
            Sample data
          </span>
          <span className="h-5 w-5 rounded-full bg-slate-200" />
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden w-40 shrink-0 border-r border-slate-200 bg-slate-50/70 px-2 py-3 md:block">
          {NAV.map(({ label, icon: Icon, key }) => (
            <div
              key={key}
              className={`mb-0.5 flex items-center gap-2 rounded px-2 py-1.5 text-[11px] ${
                key === active ? "bg-white font-semibold text-slate-900 shadow-[0_0_0_1px_rgb(226,232,240)]" : "text-slate-500"
              }`}
            >
              <Icon size={13} className={key === active ? "text-blue-700" : "text-slate-400"} />
              <span className="truncate">{label}</span>
            </div>
          ))}
        </aside>

        <div className="min-w-0 flex-1 p-3 sm:p-4">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-slate-900">{title}</p>
              <p className="truncate text-[10px] text-slate-500">{subtitle}</p>
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, note, tone = "neutral" }: { label: string; value: string; note: string; tone?: "neutral" | "good" }) {
  return (
    <div className="min-w-0 rounded-md border border-slate-200 p-2.5">
      <p className="truncate text-[10px] text-slate-500">{label}</p>
      <p className="mt-1 text-[15px] font-semibold tabular-nums tracking-tight text-slate-950">{value}</p>
      <p className={`mt-0.5 truncate text-[10px] ${tone === "good" ? "text-emerald-700" : "text-slate-500"}`}>{note}</p>
    </div>
  );
}

/** Daily collections for the month so far, in KES thousands. Weekends dip, month-start spikes —
 *  the shape real ISP collections have, rather than a smooth up-and-to-the-right line. */
const DAILY = [96, 118, 104, 88, 71, 64, 83, 92, 87, 79, 74, 58, 55, 76, 81, 77, 72, 69, 52, 49, 71, 78, 74];

function RevenueChart() {
  const w = 560;
  const h = 150;
  const max = 130;
  const step = w / (DAILY.length - 1);
  const pts = DAILY.map((v, i) => [i * step, h - (v / max) * h] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;

  // Axis labels are HTML, not SVG <text>: the SVG scales with the card, which would shrink
  // in-SVG labels to an unreadable size on narrow screens.
  const ticks = [0, 7, 14, 21].map((day) => ({ label: `${day + 1} Sep`, left: (day / (DAILY.length - 1)) * 100 }));

  return (
    <div className="flex flex-col rounded-md border border-slate-200 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold text-slate-900">Revenue overview</p>
        <p className="text-[10px] text-slate-500">Daily collections · KES</p>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-3 h-24 w-full sm:h-28" aria-hidden="true">
        {[0, 0.5, 1].map((t) => (
          <line key={t} x1="0" x2={w} y1={h * t} y2={h * t} stroke="#e2e8f0" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} fill="#1d4ed8" fillOpacity="0.07" />
        <path d={line} fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="relative mt-1 h-3 text-[9px] text-slate-500">
        {ticks.map((t, i) => (
          <span
            key={t.label}
            className="absolute top-0 whitespace-nowrap"
            style={{ left: `${t.left}%`, transform: i === 0 ? "none" : i === ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)" }}
          >
            {t.label}
          </span>
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-2.5">
        {[
          ["Collected", "KES 1.86M"],
          ["Outstanding", "KES 214K"],
          ["Via M-Pesa", "96%"],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="truncate text-[9px] text-slate-500">{k}</dt>
            <dd className="truncate text-[11px] font-semibold tabular-nums text-slate-900">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const PAYMENTS = [
  { name: "Grace Wanjiru", ref: "TIN4K8Q2ZL", amount: "2,500", when: "2 min ago" },
  { name: "Brian Otieno", ref: "TIN3H7W1PD", amount: "1,500", when: "9 min ago" },
  { name: "Hotspot · 24 hrs", ref: "TIN2C5R9MX", amount: "50", when: "12 min ago" },
  { name: "Faith Chebet", ref: "TIN1B6T4NS", amount: "4,000", when: "31 min ago" },
];

function RecentPayments() {
  return (
    <div className="min-w-0 rounded-md border border-slate-200 p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-semibold text-slate-900">Recent payments</p>
        <p className="text-[10px] text-slate-500">M-Pesa</p>
      </div>
      <ul className="mt-2 divide-y divide-slate-100">
        {PAYMENTS.map((p) => (
          <li key={p.ref} className="flex items-center justify-between gap-2 py-1.5">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium text-slate-800">{p.name}</p>
              <p className="truncate font-mono text-[9px] text-slate-400">{p.ref} · {p.when}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[11px] font-semibold tabular-nums text-slate-900">KES {p.amount}</p>
              <p className="text-[9px] font-medium text-emerald-700">Completed</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DashboardOverviewPreview() {
  return (
    <Frame
      active="dashboard"
      title="Overview"
      subtitle="September 2026 · all sites"
      ariaLabel="Preview of the MashupHost dashboard with sample data: active subscribers, revenue this month, network uptime, active sessions, a daily revenue chart and a list of recent M-Pesa payments."
    >
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kpi label="Active subscribers" value="1,284" note="+36 this month" tone="good" />
        <Kpi label="Revenue (MTD)" value="KES 1.86M" note="+12.4% vs August" tone="good" />
        <Kpi label="Network uptime" value="99.9%" note="6 of 6 routers online" />
        <Kpi label="Active sessions" value="947" note="612 PPPoE · 335 hotspot" />
      </div>
      <div className="mt-2 grid gap-2 lg:grid-cols-[1.45fr_1fr]">
        <RevenueChart />
        <RecentPayments />
      </div>
    </Frame>
  );
}

const CUSTOMERS = [
  { name: "Grace Wanjiru", acct: "CUS-00412", pkg: "Home 20 Mbps", type: "PPPoE", status: "Active", due: "14 Oct" },
  { name: "Brian Otieno", acct: "CUS-00398", pkg: "Home 10 Mbps", type: "PPPoE", status: "Active", due: "02 Oct" },
  { name: "Kilele Cafe", acct: "CUS-00377", pkg: "Business 50 Mbps", type: "PPPoE", status: "Overdue", due: "19 Sep" },
  { name: "Faith Chebet", acct: "CUS-00361", pkg: "Home 50 Mbps", type: "PPPoE", status: "Active", due: "28 Sep" },
  { name: "Samuel Mutua", acct: "CUS-00355", pkg: "Weekly Hotspot", type: "Hotspot", status: "Suspended", due: "16 Sep" },
  { name: "Amina Hassan", acct: "CUS-00349", pkg: "Home 20 Mbps", type: "PPPoE", status: "Active", due: "07 Oct" },
];

const STATUS_STYLE: Record<string, string> = {
  Active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Overdue: "bg-amber-50 text-amber-800 ring-amber-600/20",
  Suspended: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

export function DashboardCustomersPreview() {
  return (
    <Frame
      active="customers"
      title="Customers"
      subtitle="1,284 active · 37 overdue · 12 suspended"
      ariaLabel="Preview of the MashupHost customers screen with sample data: a table of subscribers with their package, connection type, billing status and next renewal date."
    >
      <div className="mb-2 flex items-center gap-2">
        <div className="h-7 flex-1 rounded border border-slate-200 bg-white px-2 text-[10px] leading-7 text-slate-400">
          Search name, phone or account…
        </div>
        <span className="hidden h-7 rounded border border-slate-200 px-2 text-[10px] leading-7 text-slate-600 sm:inline-block">All packages</span>
        <span className="h-7 rounded bg-blue-700 px-2.5 text-[10px] font-medium leading-7 text-white">Add customer</span>
      </div>
      <div className="overflow-hidden rounded-md border border-slate-200">
        <table className="w-full text-left text-[10px]">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-2.5 py-2 font-medium">Customer</th>
              <th className="hidden px-2.5 py-2 font-medium sm:table-cell">Package</th>
              <th className="hidden px-2.5 py-2 font-medium lg:table-cell">Type</th>
              <th className="px-2.5 py-2 font-medium">Status</th>
              <th className="px-2.5 py-2 text-right font-medium">Renews</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {CUSTOMERS.map((c) => (
              <tr key={c.acct}>
                <td className="px-2.5 py-2">
                  <p className="font-medium text-slate-800">{c.name}</p>
                  <p className="font-mono text-[9px] text-slate-400">{c.acct}</p>
                </td>
                <td className="hidden px-2.5 py-2 text-slate-600 sm:table-cell">{c.pkg}</td>
                <td className="hidden px-2.5 py-2 text-slate-600 lg:table-cell">{c.type}</td>
                <td className="px-2.5 py-2">
                  <span className={`inline-flex rounded px-1.5 py-0.5 font-medium ring-1 ring-inset ${STATUS_STYLE[c.status]}`}>{c.status}</span>
                </td>
                <td className="px-2.5 py-2 text-right tabular-nums text-slate-600">{c.due}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Frame>
  );
}
