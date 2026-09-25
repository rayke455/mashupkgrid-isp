/**
 * Per-app packages (TikTok only, YouTube only, …) enforced cheaply enough for a 32 MB hAP lite.
 *
 * RADIUS puts a customer on `mashup-client-<app>`. The router then:
 *  1. learns each app's server addresses from DNS: every lookup of an app domain goes through the
 *     router (customer DNS is redirected to it) and a forwarding entry adds the answers to
 *     `mashup-dest-<app>`, so CDN addresses are always current;
 *  2. checks only NEW connections from those customers: one jump per app, then "is the
 *     destination on the app's list?" — allow, otherwise drop. Packets of connections already
 *     allowed are never looked at again.
 *
 * The older filter matched every packet against ~70 rules, some inspecting TLS, which pinned a
 * 650 MHz single-core router; its DNS entries also lacked type=FWD, so RouterOS rejected them.
 */

interface AppRule {
  /** Suffix of the RADIUS address list, `mashup-client-<client>`. */
  client: string;
  /** Destination lists this package may reach. */
  dest: string[];
  /** Extra ports allowed to any destination (WhatsApp chat and calls use their own). */
  extra?: { protocol: "tcp" | "udp"; ports: string }[];
}

/** Domains per destination list, each matched with its subdomains. */
export const APP_DOMAINS: Record<string, string[]> = {
  tiktok: ["tiktok.com", "tiktokv.com", "tiktokcdn.com", "tiktokcdn-us.com", "byteoversea.com", "ibytedtos.com", "ibyteimg.com", "bytedance.com", "musical.ly"],
  youtube: ["youtube.com", "googlevideo.com", "ytimg.com", "ggpht.com", "youtu.be", "youtube-nocookie.com", "youtubei.googleapis.com", "gvt1.com"],
  facebook: ["facebook.com", "facebook.net", "fbcdn.net", "fbsbx.com", "fb.me", "messenger.com", "meta.com"],
  instagram: ["instagram.com", "cdninstagram.com", "ig.me", "threads.net"],
  whatsapp: ["whatsapp.com", "whatsapp.net"],
  social: ["x.com", "twitter.com", "twimg.com", "t.co"],
};

/** Meta's own address blocks: WhatsApp chat and parts of Facebook/Instagram connect by IP. */
export const META_RANGES = [
  "31.13.24.0/21", "31.13.64.0/18", "31.13.96.0/19", "157.240.0.0/16", "179.60.192.0/22",
  "185.60.216.0/22", "204.15.20.0/22", "69.171.224.0/19",
];

const APPS: AppRule[] = [
  { client: "tiktok", dest: ["tiktok"] },
  { client: "youtube", dest: ["youtube"] },
  { client: "facebook", dest: ["facebook", "meta"] },
  { client: "instagram", dest: ["instagram", "meta"] },
  { client: "whatsapp", dest: ["whatsapp", "meta"], extra: [{ protocol: "tcp", ports: "5222" }, { protocol: "udp", ports: "3478,45395" }] },
  { client: "social", dest: ["tiktok", "youtube", "facebook", "instagram", "whatsapp", "meta", "social"], extra: [{ protocol: "tcp", ports: "5222" }, { protocol: "udp", ports: "3478,45395" }] },
];

/** Comment on everything the filter adds, which is how it is found, replaced and checked. */
export const APP_FILTER_TAG = "MASHUPKGRID APP FILTER";
const TAG = APP_FILTER_TAG;

/**
 * RouterOS lines for the filter. `portalHosts` stay reachable for app-only customers, so they can
 * still open the portal to buy full internet. Safe to re-run: everything it adds is tagged and
 * removed first, including the older heavy filter.
 */
export function buildAppFilterSection(opts: { portalHosts?: string[]; dnsUpstream?: string } = {}): string {
  const upstream = opts.dnsUpstream ?? "1.1.1.1";
  const w = (line: string) => `:do {${line}} on-error={}`;
  const lines: string[] = [
    `# Per-app packages (TikTok only, …): DNS-learned destinations, new connections only.`,
    // Clear this filter and the older heavy one before adding.
    w(`/ip firewall filter remove [find comment~"MASHUPKGRID SOCIAL"]`),
    w(`/ip firewall filter remove [find comment="${TAG}"]`),
    w(`/ip firewall address-list remove [find comment~"MASHUPKGRID SOCIAL DEST"]`),
    w(`/ip firewall address-list remove [find comment="${TAG}"]`),
    w(`/ip dns static remove [find comment~"MASHUPKGRID SOCIAL"]`),
    w(`/ip dns static remove [find comment="${TAG}"]`),
    // Hotspot customers' DNS goes through the router, which is what lets it learn the addresses.
    // The router answers its LAN only: DNS arriving on the internet port (ether1) is dropped, so
    // this never becomes an open resolver.
    w(`/ip dns set allow-remote-requests=yes`),
    w(`/ip firewall nat remove [find comment~"MASHUPKGRID SOCIAL DNS REDIRECT"]`),
    w(`/ip firewall nat remove [find comment="${TAG} DNS"]`),
    w(`/ip firewall nat add chain=dstnat hotspot=auth protocol=udp dst-port=53 action=redirect to-ports=53 comment="${TAG} DNS"`),
    w(`/ip firewall nat add chain=dstnat hotspot=auth protocol=tcp dst-port=53 action=redirect to-ports=53 comment="${TAG} DNS"`),
    w(`/ip firewall filter add chain=input in-interface=ether1 protocol=udp dst-port=53 action=drop comment="${TAG}"`),
    w(`/ip firewall filter add chain=input in-interface=ether1 protocol=tcp dst-port=53 action=drop comment="${TAG}"`),
  ];
  for (const [list, domains] of Object.entries(APP_DOMAINS)) {
    for (const domain of domains) {
      lines.push(w(`/ip dns static add name="${domain}" type=FWD forward-to=${upstream} match-subdomain=yes address-list="mashup-dest-${list}" comment="${TAG}"`));
    }
  }
  for (const range of META_RANGES) {
    lines.push(w(`/ip firewall address-list add list="mashup-dest-meta" address=${range} comment="${TAG}"`));
  }
  for (const host of opts.portalHosts ?? []) {
    lines.push(w(`/ip firewall address-list add list="mashup-dest-portal" address=${host} comment="${TAG}"`));
  }
  for (const app of APPS) {
    const chain = `mkg-app-${app.client}`;
    lines.push(w(`/ip firewall filter add chain=forward connection-state=new src-address-list="mashup-client-${app.client}" action=jump jump-target=${chain} comment="${TAG}"`));
    lines.push(w(`/ip firewall filter add chain=${chain} protocol=udp dst-port=53,123 action=accept comment="${TAG}"`));
    lines.push(w(`/ip firewall filter add chain=${chain} protocol=icmp action=accept comment="${TAG}"`));
    lines.push(w(`/ip firewall filter add chain=${chain} dst-address-list="mashup-dest-portal" action=accept comment="${TAG}"`));
    for (const dest of app.dest) {
      lines.push(w(`/ip firewall filter add chain=${chain} dst-address-list="mashup-dest-${dest}" action=accept comment="${TAG}"`));
    }
    for (const extra of app.extra ?? []) {
      lines.push(w(`/ip firewall filter add chain=${chain} protocol=${extra.protocol} dst-port=${extra.ports} action=accept comment="${TAG}"`));
    }
    lines.push(w(`/ip firewall filter add chain=${chain} action=drop comment="${TAG}"`));
  }
  return lines.join("\n");
}

/** Firewall filter rules a complete install has, so self-repair can tell a missing or partial one. */
export const APP_FILTER_RULE_COUNT = buildAppFilterSection()
  .split("\n")
  .filter((l) => l.includes("/ip firewall filter add")).length;
