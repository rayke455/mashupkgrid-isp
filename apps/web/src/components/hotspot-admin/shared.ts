import { SOCIAL_APP_CATALOG, appOnlyLabel, type SocialAppPolicy } from "@/components/hotspot/themes";

export interface HotspotPackage {
  id: string;
  name: string;
  description: string | null;
  priceMinor: number;
  currency: string;
  durationMinutes: number;
  dataCapMb: number | null;
  downloadKbps: number | null;
  uploadKbps: number | null;
  isPopular?: boolean;
  badge?: string | null;
  simultaneousUse?: number;
  blockTethering?: boolean;
  appPolicy?: string | null;
  isActive: boolean;
}

export interface Voucher {
  id: string;
  code: string;
  hotspotPackageId: string | null;
  hotspotPackage?: HotspotPackage | null;
  status: "UNUSED" | "ACTIVE" | "EXPIRED" | "USED";
  durationMinutes: number | null;
  dataCapMb: number | null;
  downloadKbps: number | null;
  uploadKbps: number | null;
  simultaneousUse?: number | null;
  appPolicy?: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface HotspotPurchase {
  method: "MPESA" | "PAYSTACK";
  contact: string | null;
  amountMinor: number;
  currency: string;
  packageName: string | null;
  voucherCode: string | null;
  receiptNumber: string | null;
  paidAt: string;
  voucherStatus: "UNUSED" | "ACTIVE" | "EXPIRED" | "USED" | null;
  dataCapMb: number | null;
  bytesIn: number | null;
  bytesOut: number | null;
  usageUpdatedAt: string | null;
  expiresAt: string | null;
  /** MAC addresses of the phones that have used this voucher. */
  devices: string[];
}

export const PACKAGES_QUERY_KEY = ["hotspot-packages-staff"];
export const VOUCHERS_QUERY_KEY = ["vouchers"];

const DAY = 60 * 24;

export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes) return "No time limit";
  if (minutes < 60) return `${minutes} min`;
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (minutes % (DAY * 7) === 0) return plural(minutes / (DAY * 7), "week");
  if (minutes % DAY === 0) return plural(minutes / DAY, "day");
  const h = minutes / 60;
  return plural(Number.isInteger(h) ? h : +h.toFixed(1), "hour");
}

export function formatSpeed(kbps: number | null | undefined): string {
  if (!kbps) return "—";
  return kbps >= 1000 ? `${+(kbps / 1000).toFixed(1)} Mbps` : `${kbps} kbps`;
}

export function formatData(mb: number | null | undefined): string {
  if (!mb) return "Unlimited";
  return mb >= 1024 ? `${+(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}

export const DURATION_PRESETS: { minutes: number; label: string }[] = [
  { minutes: 30, label: "30 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 180, label: "3 hours" },
  { minutes: 360, label: "6 hours" },
  { minutes: 720, label: "12 hours" },
  { minutes: DAY, label: "1 day" },
  { minutes: DAY * 3, label: "3 days" },
  { minutes: DAY * 7, label: "1 week" },
  { minutes: DAY * 30, label: "30 days" },
];

export const APP_POLICY_OPTIONS = (Object.keys(SOCIAL_APP_CATALOG) as SocialAppPolicy[]).map((policy) => ({
  value: policy,
  label: SOCIAL_APP_CATALOG[policy].name,
}));

export const VOUCHER_STATUS: Record<Voucher["status"], { tone: "good" | "warn" | "bad" | "neutral"; label: string }> = {
  UNUSED: { tone: "neutral", label: "Unused" },
  ACTIVE: { tone: "good", label: "In use" },
  EXPIRED: { tone: "bad", label: "Expired" },
  USED: { tone: "warn", label: "Used up" },
};

/** Opens a clean print page with just the voucher cards (3 per row on A4). */
export function printVouchers(vouchers: Voucher[], brand: string): void {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const cards = vouchers
    .map((v) => {
      const plan = v.hotspotPackage?.name || formatDuration(v.durationMinutes);
      // Strip the emoji: print fonts render it inconsistently.
      const appOnly = appOnlyLabel(v.appPolicy ?? v.hotspotPackage?.appPolicy)?.replace(/^\S+\s/, "");
      const price = v.hotspotPackage?.priceMinor ? `KSh ${(v.hotspotPackage.priceMinor / 100).toLocaleString("en-KE")}` : "";
      return `<div class="card"><div class="brand">${esc(brand)} Wi-Fi</div><div class="code">${esc(v.code)}</div><div class="plan">${esc(plan)}${price ? ` · ${esc(price)}` : ""}</div>${appOnly ? `<div class="app">${esc(appOnly)}</div>` : ""}<div class="how">Connect to the Wi-Fi, open any page, enter this code.</div></div>`;
    })
    .join("");
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>Vouchers</title><style>
    body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:16px;color:#0f172a}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
    .card{border:1.5px dashed #64748b;border-radius:10px;padding:12px;text-align:center;break-inside:avoid}
    .brand{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#475569}
    .code{font-family:ui-monospace,Consolas,monospace;font-size:22px;font-weight:700;letter-spacing:.15em;margin:8px 0}
    .plan{font-size:13px;font-weight:600}.app{font-size:11px;font-weight:700;margin-top:3px}.how{font-size:10px;color:#64748b;margin-top:6px}
    @media print{body{margin:8mm}}
  </style></head><body><div class="grid">${cards}</div><script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
}
