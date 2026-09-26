import { tr } from "@/lib/tr";

/** "20 / 10 Mbps · 1 day" or "+10 GB · 7 days": what an add-on gives, in a few words. */
export function describeAddOn(a: { kind: "SPEED" | "DATA"; downloadKbps: number | null; uploadKbps: number | null; dataMb: number | null; durationHours: number }): string {
  const hours = a.durationHours % 24 === 0 ? `${a.durationHours / 24} ${a.durationHours === 24 ? tr("day") : tr("days")}` : `${a.durationHours} ${tr("hours")}`;
  const what = a.kind === "SPEED" ? `${Math.round((a.downloadKbps ?? 0) / 1000)} / ${Math.round((a.uploadKbps ?? 0) / 1000)} Mbps` : a.dataMb! >= 1024 ? `+${Math.round((a.dataMb! / 1024) * 10) / 10} GB` : `+${a.dataMb} MB`;
  return `${what} · ${hours}`;
}
