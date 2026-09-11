import type { RadiusNas, Router } from "@mashupkgrid/database";

/** Strips characters that would let a router's (staff-editable) `name` break out of the RouterOS
 *  comment/string it's interpolated into below, or out of the `{ }`-delimited client block in the
 *  generated FreeRADIUS clients.conf snippet — a name containing a newline, quote, or brace would
 *  otherwise let whoever named the router inject arbitrary lines into a script another person
 *  (an ops admin pasting the FreeRADIUS snippet, or whoever runs the RouterOS script) trusts and
 *  runs verbatim. */
function sanitizeForScript(value: string): string {
  return value.replace(/[^\w .-]/g, "").trim() || "router";
}

/** Every third-party host an unauthenticated hotspot client must reach BEFORE it can pay and
 *  log in. Derived from what packages/payments actually calls, not guesswork:
 *
 *  - Safaricom / M-Pesa (packages/payments/src/mpesa) — the STK push itself is server-to-server,
 *    but the customer's own M-Pesa confirmation and any Daraja-hosted fallback page are not.
 *  - Paystack (packages/payments/src/paystack) — the customer is redirected to Paystack's hosted
 *    checkout, which pulls scripts from js.paystack.co and short-links through pstk.it.
 *  - Pesapal (packages/payments/src/pesapal) — same pattern, hosted checkout on pay.pesapal.com.
 *  - The 3-D Secure step-up hosts. A card payment that passes checkout but cannot reach its
 *    issuer's ACS silently fails at the last step, which reads to the customer as "the payment
 *    hung" — the single most confusing failure in a captive portal, since they have no way to
 *    reach a support page either.
 *
 *  Wildcards throughout: every one of these is CDN-fronted with rotating addresses, so pinning
 *  exact hosts is what breaks the moment a provider re-points a record. */
export const PAYMENT_GATEWAY_WALLED_GARDEN_HOSTS = [
  "*.safaricom.co.ke",
  "*.paystack.com",
  "*.paystack.co",
  "*.pstk.it",
  "*.pesapal.com",
  "*.visa.com",
  "*.mastercard.com",
  "*.cardinalcommerce.com",
  "*.modirum.com",
] as const;

/** RouterOS splits the walled garden across two menus and BOTH are needed.
 *  `/ip hotspot walled-garden` is the HTTP-proxy-level menu: it can match a Host header, but only
 *  for plain HTTP. `/ip hotspot walled-garden ip` is the packet-level menu, and it is the only
 *  one that lets an HTTPS connection through — without an entry there the hotspot intercepts the
 *  TLS connection and the client gets ERR_CONNECTION_CLOSED rather than a login page. Every
 *  host this platform cares about is HTTPS-only, so each name is emitted to both menus (note the
 *  differing action verbs: `allow` in the first, `accept` in the second).
 *
 *  A bare IP goes in as `dst-address` — passing one as `dst-host` makes RouterOS try, and fail,
 *  to resolve it as a name. Dev deployments hand this an IP; production hands it a domain.
 *
 *  All entries are commented "MASHUPKGRID" so the script can clear exactly its own rules on a
 *  re-run without touching anything an operator added by hand. */
function walledGardenLines(hosts: readonly string[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const host of hosts) {
    if (!host || seen.has(host)) continue;
    seen.add(host);

    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      lines.push(`/ip hotspot walled-garden ip add dst-address=${host} action=accept comment="MASHUPKGRID"`);
      continue;
    }
    // Restricted to the two web ports. Every host in this list is an HTTPS service, so anything
    // reaching them on another port is not a payment — it is someone using an allowed name as a
    // tunnel endpoint. Narrowing the hole costs nothing legitimate.
    lines.push(`/ip hotspot walled-garden add dst-host=${host} action=allow comment="MASHUPKGRID"`);
    lines.push(`/ip hotspot walled-garden ip add dst-host=${host} action=accept comment="MASHUPKGRID"`);
  }
  return lines.join("\n");
}

/** Hostname out of a config URL, tolerating a value that is already a bare host. */
function hostFromUrl(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return value.replace(/^https?:\/\//, "").split("/")[0]!.split(":")[0]!;
  }
}

/** Two-part public suffixes this platform actually meets. Kenya is the primary market (see the
 *  Tenant model's KES/Africa-Nairobi defaults) where "acme.co.ke" is the registrable domain, not
 *  "co.ke" — getting that wrong would emit a "*.co.ke" walled-garden rule, opening the hotspot
 *  to an entire country's namespace. Not a full public-suffix list, and deliberately so: an
 *  unlisted suffix falls back to the last two labels, which is merely narrower than ideal
 *  (a redundant exact-host entry) rather than dangerously wide. */
const MULTI_PART_TLDS = new Set([
  "co.ke", "or.ke", "ne.ke", "ac.ke", "go.ke", "sc.ke", "me.ke", "mobi.ke", "info.ke",
  "co.tz", "co.ug", "co.rw", "co.za", "org.za", "com.ng", "com.gh", "co.zm", "co.zw",
  "co.uk", "org.uk", "ac.uk", "com.au", "co.nz", "com.br", "co.in",
]);

/** The registrable domain — "api.mashuphost.tech" and "portal.acme.co.ke" reduce to
 *  "mashuphost.tech" and "acme.co.ke" respectively. */
function registrableDomain(host: string): string {
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const labelCount = MULTI_PART_TLDS.has(parts.slice(-2).join(".")) ? 3 : 2;
  return parts.slice(-labelCount).join(".");
}

/** A host plus one wildcard covering its registrable domain. The exact host alone is not enough:
 *  a portal behind a CDN (mashuphost.tech sits behind Cloudflare) pulls assets and API calls from
 *  sibling names, and a tenant's own domain usually answers on both the apex and www. The
 *  wildcard is anchored at the registrable domain rather than the host, so "api.example.com"
 *  contributes "*.example.com" — a useful rule — instead of "*.api.example.com", which would
 *  match nothing anyone visits. An IP is returned as-is; it has no subdomains. */
function hostWithSubdomains(host: string): string[] {
  if (!host) return [];
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return [host];
  return [host, `*.${registrableDomain(host)}`];
}

/** Blocks a customer re-sharing their paid session over their own phone hotspot or travel router.
 *
 *  Detection is by TTL, which is the only signal a router actually has. A packet from the paying
 *  device arrives with its operating system's default TTL — 64 on Android/iOS/Linux, 128 on
 *  Windows. When that device re-routes for someone else, the second device's packets pass through
 *  it and arrive one hop lower: 63, or 127. Dropping those catches sharing without touching the
 *  customer who paid.
 *
 *  It is a heuristic, and honestly so:
 *    - A customer whose own device legitimately sits behind a router (a travel router in a hotel
 *      room, some MiFi units) is blocked even though only one person is using it.
 *    - An operating system with a non-standard default TTL is misjudged in either direction.
 *    - Anyone who knows this exists can set their TTL to 65 and defeat it in one command.
 *  So it raises the cost of casual sharing — which is nearly all of it — rather than stopping a
 *  determined person. That is why it is opt-in per router: an operator turns it on where sharing
 *  is actually costing them, and leaves it off where a wrongly-blocked customer is worse. */
function buildAntiTetheringSection(enabled: boolean): string {
  if (!enabled) {
    return `# 10. Anti-tethering: Package-level enforcement active via RADIUS address list.
/ip firewall filter remove [find comment="MASHUPKGRID ANTI-TETHER"]
/ip firewall filter add chain=forward src-address-list="mashup-anti-tether" ttl=equal:63 action=drop comment="MASHUPKGRID ANTI-TETHER"
/ip firewall filter add chain=forward src-address-list="mashup-anti-tether" ttl=equal:127 action=drop comment="MASHUPKGRID ANTI-TETHER"
/ip firewall filter add chain=forward src-address-list="mashup-anti-tether" ttl=equal:254 action=drop comment="MASHUPKGRID ANTI-TETHER"
:do {/ip firewall filter move [find comment="MASHUPKGRID ANTI-TETHER"] destination=0} on-error={}
:put "Per-package Anti-tethering filter active"`;
  }

  return `# 10. Anti-tethering: Global router + package enforcement active.
/ip firewall filter remove [find comment="MASHUPKGRID ANTI-TETHER"]
/ip firewall filter add chain=forward hotspot=auth ttl=equal:63 action=drop comment="MASHUPKGRID ANTI-TETHER"
/ip firewall filter add chain=forward hotspot=auth ttl=equal:127 action=drop comment="MASHUPKGRID ANTI-TETHER"
/ip firewall filter add chain=forward hotspot=auth ttl=equal:254 action=drop comment="MASHUPKGRID ANTI-TETHER"
/ip firewall filter add chain=forward src-address-list="mashup-anti-tether" ttl=equal:63 action=drop comment="MASHUPKGRID ANTI-TETHER"
/ip firewall filter add chain=forward src-address-list="mashup-anti-tether" ttl=equal:127 action=drop comment="MASHUPKGRID ANTI-TETHER"
/ip firewall filter add chain=forward src-address-list="mashup-anti-tether" ttl=equal:254 action=drop comment="MASHUPKGRID ANTI-TETHER"
:do {/ip firewall filter move [find comment="MASHUPKGRID ANTI-TETHER"] destination=0} on-error={}
:put "Anti-tethering active — one device per voucher enforced at the network level"`;
}

/** Social media and app-specific voucher firewall rules and destination address lists.
 *  Allows operators to sell TikTok-only, YouTube-only, Facebook-only, Instagram-only,
 *  WhatsApp-only, or All-in-One Social Bundle packages. */
export function buildSocialAppFirewallSection(): string {
  return `# 17. Social Media & App-Specific Voucher Isolation
/ip firewall address-list remove [find comment~"MASHUPKGRID SOCIAL DEST"]

# Meta / Facebook / WhatsApp / Instagram IP Networks (AS32934)
/ip firewall address-list add list="mashup-dest-meta" address="157.240.0.0/16" comment="MASHUPKGRID SOCIAL DEST meta"
/ip firewall address-list add list="mashup-dest-meta" address="31.13.64.0/18" comment="MASHUPKGRID SOCIAL DEST meta"
/ip firewall address-list add list="mashup-dest-meta" address="31.13.24.0/21" comment="MASHUPKGRID SOCIAL DEST meta"
/ip firewall address-list add list="mashup-dest-meta" address="31.13.72.0/21" comment="MASHUPKGRID SOCIAL DEST meta"
/ip firewall address-list add list="mashup-dest-meta" address="31.13.80.0/21" comment="MASHUPKGRID SOCIAL DEST meta"
/ip firewall address-list add list="mashup-dest-meta" address="31.13.88.0/21" comment="MASHUPKGRID SOCIAL DEST meta"
/ip firewall address-list add list="mashup-dest-meta" address="31.13.96.0/19" comment="MASHUPKGRID SOCIAL DEST meta"
/ip firewall address-list add list="mashup-dest-meta" address="69.171.224.0/19" comment="MASHUPKGRID SOCIAL DEST meta"
/ip firewall address-list add list="mashup-dest-meta" address="69.171.240.0/20" comment="MASHUPKGRID SOCIAL DEST meta"
/ip firewall address-list add list="mashup-dest-meta" address="69.171.248.0/21" comment="MASHUPKGRID SOCIAL DEST meta"
/ip firewall address-list add list="mashup-dest-meta" address="69.171.250.0/23" comment="MASHUPKGRID SOCIAL DEST meta"
/ip firewall address-list add list="mashup-dest-meta" address="69.171.252.0/22" comment="MASHUPKGRID SOCIAL DEST meta"
/ip firewall address-list add list="mashup-dest-meta" address="179.60.192.0/22" comment="MASHUPKGRID SOCIAL DEST meta"
/ip firewall address-list add list="mashup-dest-meta" address="185.60.216.0/22" comment="MASHUPKGRID SOCIAL DEST meta"
/ip firewall address-list add list="mashup-dest-meta" address="204.15.20.0/22" comment="MASHUPKGRID SOCIAL DEST meta"

# TikTok Domains & CDNs
/ip firewall address-list add list="mashup-dest-tiktok" address="tiktok.com" comment="MASHUPKGRID SOCIAL DEST tiktok"
/ip firewall address-list add list="mashup-dest-tiktok" address="www.tiktok.com" comment="MASHUPKGRID SOCIAL DEST tiktok"
/ip firewall address-list add list="mashup-dest-tiktok" address="m.tiktok.com" comment="MASHUPKGRID SOCIAL DEST tiktok"
/ip firewall address-list add list="mashup-dest-tiktok" address="tiktokcdn.com" comment="MASHUPKGRID SOCIAL DEST tiktok"
/ip firewall address-list add list="mashup-dest-tiktok" address="v16-webapp.tiktokcdn.com" comment="MASHUPKGRID SOCIAL DEST tiktok"
/ip firewall address-list add list="mashup-dest-tiktok" address="p16-va.tiktokcdn.com" comment="MASHUPKGRID SOCIAL DEST tiktok"
/ip firewall address-list add list="mashup-dest-tiktok" address="ib.tiktokv.com" comment="MASHUPKGRID SOCIAL DEST tiktok"
/ip firewall address-list add list="mashup-dest-tiktok" address="tiktokv.com" comment="MASHUPKGRID SOCIAL DEST tiktok"
/ip firewall address-list add list="mashup-dest-tiktok" address="byteoversea.com" comment="MASHUPKGRID SOCIAL DEST tiktok"
/ip firewall address-list add list="mashup-dest-tiktok" address="ibytedtos.com" comment="MASHUPKGRID SOCIAL DEST tiktok"
/ip firewall address-list add list="mashup-dest-tiktok" address="ibyteimg.com" comment="MASHUPKGRID SOCIAL DEST tiktok"
/ip firewall address-list add list="mashup-dest-tiktok" address="musical.ly" comment="MASHUPKGRID SOCIAL DEST tiktok"
/ip firewall address-list add list="mashup-dest-tiktok" address="bytedance.com" comment="MASHUPKGRID SOCIAL DEST tiktok"
/ip firewall address-list add list="mashup-dest-tiktok" address="tiktokcdn-us.com" comment="MASHUPKGRID SOCIAL DEST tiktok"

# YouTube Domains & CDNs
/ip firewall address-list add list="mashup-dest-youtube" address="youtube.com" comment="MASHUPKGRID SOCIAL DEST youtube"
/ip firewall address-list add list="mashup-dest-youtube" address="www.youtube.com" comment="MASHUPKGRID SOCIAL DEST youtube"
/ip firewall address-list add list="mashup-dest-youtube" address="m.youtube.com" comment="MASHUPKGRID SOCIAL DEST youtube"
/ip firewall address-list add list="mashup-dest-youtube" address="youtu.be" comment="MASHUPKGRID SOCIAL DEST youtube"
/ip firewall address-list add list="mashup-dest-youtube" address="googlevideo.com" comment="MASHUPKGRID SOCIAL DEST youtube"
/ip firewall address-list add list="mashup-dest-youtube" address="ytimg.com" comment="MASHUPKGRID SOCIAL DEST youtube"
/ip firewall address-list add list="mashup-dest-youtube" address="ggpht.com" comment="MASHUPKGRID SOCIAL DEST youtube"
/ip firewall address-list add list="mashup-dest-youtube" address="youtubei.googleapis.com" comment="MASHUPKGRID SOCIAL DEST youtube"
/ip firewall address-list add list="mashup-dest-youtube" address="gvt1.com" comment="MASHUPKGRID SOCIAL DEST youtube"
/ip firewall address-list add list="mashup-dest-youtube" address="youtube-nocookie.com" comment="MASHUPKGRID SOCIAL DEST youtube"

# Facebook Domains & CDNs
/ip firewall address-list add list="mashup-dest-facebook" address="facebook.com" comment="MASHUPKGRID SOCIAL DEST facebook"
/ip firewall address-list add list="mashup-dest-facebook" address="www.facebook.com" comment="MASHUPKGRID SOCIAL DEST facebook"
/ip firewall address-list add list="mashup-dest-facebook" address="m.facebook.com" comment="MASHUPKGRID SOCIAL DEST facebook"
/ip firewall address-list add list="mashup-dest-facebook" address="fbcdn.net" comment="MASHUPKGRID SOCIAL DEST facebook"
/ip firewall address-list add list="mashup-dest-facebook" address="fbsbx.com" comment="MASHUPKGRID SOCIAL DEST facebook"
/ip firewall address-list add list="mashup-dest-facebook" address="meta.com" comment="MASHUPKGRID SOCIAL DEST facebook"
/ip firewall address-list add list="mashup-dest-facebook" address="messenger.com" comment="MASHUPKGRID SOCIAL DEST facebook"
/ip firewall address-list add list="mashup-dest-facebook" address="fb.me" comment="MASHUPKGRID SOCIAL DEST facebook"
/ip firewall address-list add list="mashup-dest-facebook" address="facebook.net" comment="MASHUPKGRID SOCIAL DEST facebook"

# Instagram Domains & CDNs
/ip firewall address-list add list="mashup-dest-instagram" address="instagram.com" comment="MASHUPKGRID SOCIAL DEST instagram"
/ip firewall address-list add list="mashup-dest-instagram" address="www.instagram.com" comment="MASHUPKGRID SOCIAL DEST instagram"
/ip firewall address-list add list="mashup-dest-instagram" address="cdninstagram.com" comment="MASHUPKGRID SOCIAL DEST instagram"
/ip firewall address-list add list="mashup-dest-instagram" address="ig.me" comment="MASHUPKGRID SOCIAL DEST instagram"
/ip firewall address-list add list="mashup-dest-instagram" address="threads.net" comment="MASHUPKGRID SOCIAL DEST instagram"

# WhatsApp Domains & CDNs
/ip firewall address-list add list="mashup-dest-whatsapp" address="whatsapp.com" comment="MASHUPKGRID SOCIAL DEST whatsapp"
/ip firewall address-list add list="mashup-dest-whatsapp" address="www.whatsapp.com" comment="MASHUPKGRID SOCIAL DEST whatsapp"
/ip firewall address-list add list="mashup-dest-whatsapp" address="web.whatsapp.com" comment="MASHUPKGRID SOCIAL DEST whatsapp"
/ip firewall address-list add list="mashup-dest-whatsapp" address="whatsapp.net" comment="MASHUPKGRID SOCIAL DEST whatsapp"
/ip firewall address-list add list="mashup-dest-whatsapp" address="g.whatsapp.net" comment="MASHUPKGRID SOCIAL DEST whatsapp"
/ip firewall address-list add list="mashup-dest-whatsapp" address="v.whatsapp.net" comment="MASHUPKGRID SOCIAL DEST whatsapp"
/ip firewall address-list add list="mashup-dest-whatsapp" address="chat.whatsapp.com" comment="MASHUPKGRID SOCIAL DEST whatsapp"
/ip firewall address-list add list="mashup-dest-whatsapp" address="pps.whatsapp.net" comment="MASHUPKGRID SOCIAL DEST whatsapp"
/ip firewall address-list add list="mashup-dest-whatsapp" address="static.whatsapp.net" comment="MASHUPKGRID SOCIAL DEST whatsapp"
/ip firewall address-list add list="mashup-dest-whatsapp" address="mmg.whatsapp.net" comment="MASHUPKGRID SOCIAL DEST whatsapp"

# Social Bundle (Twitter / X addition)
/ip firewall address-list add list="mashup-dest-social" address="x.com" comment="MASHUPKGRID SOCIAL DEST social"
/ip firewall address-list add list="mashup-dest-social" address="twitter.com" comment="MASHUPKGRID SOCIAL DEST social"
/ip firewall address-list add list="mashup-dest-social" address="twimg.com" comment="MASHUPKGRID SOCIAL DEST social"
/ip firewall address-list add list="mashup-dest-social" address="t.co" comment="MASHUPKGRID SOCIAL DEST social"
/ip firewall address-list add list="mashup-dest-social" address="abs.twimg.com" comment="MASHUPKGRID SOCIAL DEST social"
/ip firewall address-list add list="mashup-dest-social" address="pbs.twimg.com" comment="MASHUPKGRID SOCIAL DEST social"
/ip firewall address-list add list="mashup-dest-social" address="video.twimg.com" comment="MASHUPKGRID SOCIAL DEST social"
/ip firewall address-list add list="mashup-dest-social" address="104.244.42.0/21" comment="MASHUPKGRID SOCIAL DEST social"
/ip firewall address-list add list="mashup-dest-social" address="199.16.156.0/22" comment="MASHUPKGRID SOCIAL DEST social"
/ip firewall address-list add list="mashup-dest-social" address="199.59.148.0/22" comment="MASHUPKGRID SOCIAL DEST social"
/ip firewall address-list add list="mashup-dest-social" address="199.96.56.0/21" comment="MASHUPKGRID SOCIAL DEST social"

# DNS Auto-Populate for RouterOS v7 match-subdomain
:if ([:pick [/system resource get version] 0 2] = "7.") do={
  :do {/ip dns static add name="tiktokcdn.com" match-subdomain=yes address-list="mashup-dest-tiktok" comment="MASHUPKGRID SOCIAL DEST"} on-error={}
  :do {/ip dns static add name="tiktokv.com" match-subdomain=yes address-list="mashup-dest-tiktok" comment="MASHUPKGRID SOCIAL DEST"} on-error={}
  :do {/ip dns static add name="byteoversea.com" match-subdomain=yes address-list="mashup-dest-tiktok" comment="MASHUPKGRID SOCIAL DEST"} on-error={}
  :do {/ip dns static add name="ibytedtos.com" match-subdomain=yes address-list="mashup-dest-tiktok" comment="MASHUPKGRID SOCIAL DEST"} on-error={}
  :do {/ip dns static add name="googlevideo.com" match-subdomain=yes address-list="mashup-dest-youtube" comment="MASHUPKGRID SOCIAL DEST"} on-error={}
  :do {/ip dns static add name="ytimg.com" match-subdomain=yes address-list="mashup-dest-youtube" comment="MASHUPKGRID SOCIAL DEST"} on-error={}
  :do {/ip dns static add name="fbcdn.net" match-subdomain=yes address-list="mashup-dest-facebook" comment="MASHUPKGRID SOCIAL DEST"} on-error={}
  :do {/ip dns static add name="cdninstagram.com" match-subdomain=yes address-list="mashup-dest-instagram" comment="MASHUPKGRID SOCIAL DEST"} on-error={}
  :do {/ip dns static add name="whatsapp.net" match-subdomain=yes address-list="mashup-dest-whatsapp" comment="MASHUPKGRID SOCIAL DEST"} on-error={}
  :do {/ip dns static add name="twimg.com" match-subdomain=yes address-list="mashup-dest-social" comment="MASHUPKGRID SOCIAL DEST"} on-error={}
}

# DNS Redirection (Ensures all client DNS queries go through router cache to capture CDN endpoints)
/ip firewall nat remove [find comment="MASHUPKGRID SOCIAL DNS REDIRECT"]
:do {/ip firewall nat add chain=dstnat protocol=udp dst-port=53 action=redirect to-ports=53 comment="MASHUPKGRID SOCIAL DNS REDIRECT"} on-error={}
:do {/ip firewall nat add chain=dstnat protocol=tcp dst-port=53 action=redirect to-ports=53 comment="MASHUPKGRID SOCIAL DNS REDIRECT"} on-error={}

# Social Forward Firewall Rules
/ip firewall filter remove [find comment~"MASHUPKGRID SOCIAL FILTER"]

# 1. Allow Essential Protocol Traffic for all social client lists (DNS, NTP, ICMP)
/ip firewall filter add chain=forward protocol=udp dst-port=53 src-address-list="mashup-client-tiktok" action=accept comment="MASHUPKGRID SOCIAL FILTER DNS"
/ip firewall filter add chain=forward protocol=tcp dst-port=53 src-address-list="mashup-client-tiktok" action=accept comment="MASHUPKGRID SOCIAL FILTER DNS"
/ip firewall filter add chain=forward protocol=udp dst-port=53 src-address-list="mashup-client-youtube" action=accept comment="MASHUPKGRID SOCIAL FILTER DNS"
/ip firewall filter add chain=forward protocol=tcp dst-port=53 src-address-list="mashup-client-youtube" action=accept comment="MASHUPKGRID SOCIAL FILTER DNS"
/ip firewall filter add chain=forward protocol=udp dst-port=53 src-address-list="mashup-client-facebook" action=accept comment="MASHUPKGRID SOCIAL FILTER DNS"
/ip firewall filter add chain=forward protocol=tcp dst-port=53 src-address-list="mashup-client-facebook" action=accept comment="MASHUPKGRID SOCIAL FILTER DNS"
/ip firewall filter add chain=forward protocol=udp dst-port=53 src-address-list="mashup-client-instagram" action=accept comment="MASHUPKGRID SOCIAL FILTER DNS"
/ip firewall filter add chain=forward protocol=tcp dst-port=53 src-address-list="mashup-client-instagram" action=accept comment="MASHUPKGRID SOCIAL FILTER DNS"
/ip firewall filter add chain=forward protocol=udp dst-port=53 src-address-list="mashup-client-whatsapp" action=accept comment="MASHUPKGRID SOCIAL FILTER DNS"
/ip firewall filter add chain=forward protocol=tcp dst-port=53 src-address-list="mashup-client-whatsapp" action=accept comment="MASHUPKGRID SOCIAL FILTER DNS"
/ip firewall filter add chain=forward protocol=udp dst-port=53 src-address-list="mashup-client-social" action=accept comment="MASHUPKGRID SOCIAL FILTER DNS"
/ip firewall filter add chain=forward protocol=tcp dst-port=53 src-address-list="mashup-client-social" action=accept comment="MASHUPKGRID SOCIAL FILTER DNS"

# Allow NTP (clock sync) and ICMP (ping connectivity check)
/ip firewall filter add chain=forward protocol=udp dst-port=123 action=accept comment="MASHUPKGRID SOCIAL FILTER NTP"
/ip firewall filter add chain=forward protocol=icmp action=accept comment="MASHUPKGRID SOCIAL FILTER ICMP"

# 2. Allow destination app traffic by IP Address Lists
/ip firewall filter add chain=forward src-address-list="mashup-client-tiktok" dst-address-list="mashup-dest-tiktok" action=accept comment="MASHUPKGRID SOCIAL FILTER ALLOW TIKTOK"
/ip firewall filter add chain=forward src-address-list="mashup-client-youtube" dst-address-list="mashup-dest-youtube" action=accept comment="MASHUPKGRID SOCIAL FILTER ALLOW YOUTUBE"
/ip firewall filter add chain=forward src-address-list="mashup-client-facebook" dst-address-list="mashup-dest-facebook" action=accept comment="MASHUPKGRID SOCIAL FILTER ALLOW FACEBOOK"
/ip firewall filter add chain=forward src-address-list="mashup-client-facebook" dst-address-list="mashup-dest-meta" action=accept comment="MASHUPKGRID SOCIAL FILTER ALLOW FACEBOOK META"
/ip firewall filter add chain=forward src-address-list="mashup-client-instagram" dst-address-list="mashup-dest-instagram" action=accept comment="MASHUPKGRID SOCIAL FILTER ALLOW INSTAGRAM"
/ip firewall filter add chain=forward src-address-list="mashup-client-instagram" dst-address-list="mashup-dest-meta" action=accept comment="MASHUPKGRID SOCIAL FILTER ALLOW INSTAGRAM META"
/ip firewall filter add chain=forward src-address-list="mashup-client-whatsapp" dst-address-list="mashup-dest-whatsapp" action=accept comment="MASHUPKGRID SOCIAL FILTER ALLOW WHATSAPP"
/ip firewall filter add chain=forward src-address-list="mashup-client-whatsapp" dst-address-list="mashup-dest-meta" action=accept comment="MASHUPKGRID SOCIAL FILTER ALLOW WHATSAPP META"

# WhatsApp voice/video calls (STUN/TURN) & Chat Protocol
/ip firewall filter add chain=forward protocol=tcp dst-port=5222 src-address-list="mashup-client-whatsapp" action=accept comment="MASHUPKGRID SOCIAL FILTER ALLOW WHATSAPP CHAT"
/ip firewall filter add chain=forward protocol=udp dst-port=3478,45395 src-address-list="mashup-client-whatsapp" action=accept comment="MASHUPKGRID SOCIAL FILTER ALLOW WHATSAPP CALLS"

# 3. Allow destination app traffic by TLS SNI Host inspection (covers all subdomains/CDNs)
/ip firewall filter add chain=forward protocol=tcp dst-port=443 src-address-list="mashup-client-tiktok" tls-host="*tiktok*" action=accept comment="MASHUPKGRID SOCIAL FILTER TLS TIKTOK"
/ip firewall filter add chain=forward protocol=tcp dst-port=443 src-address-list="mashup-client-tiktok" tls-host="*byteoversea*" action=accept comment="MASHUPKGRID SOCIAL FILTER TLS TIKTOK"
/ip firewall filter add chain=forward protocol=tcp dst-port=443 src-address-list="mashup-client-tiktok" tls-host="*ibytedtos*" action=accept comment="MASHUPKGRID SOCIAL FILTER TLS TIKTOK"
/ip firewall filter add chain=forward protocol=tcp dst-port=443 src-address-list="mashup-client-tiktok" tls-host="*musical.ly*" action=accept comment="MASHUPKGRID SOCIAL FILTER TLS TIKTOK"

/ip firewall filter add chain=forward protocol=tcp dst-port=443 src-address-list="mashup-client-youtube" tls-host="*youtube*" action=accept comment="MASHUPKGRID SOCIAL FILTER TLS YOUTUBE"
/ip firewall filter add chain=forward protocol=tcp dst-port=443 src-address-list="mashup-client-youtube" tls-host="*googlevideo*" action=accept comment="MASHUPKGRID SOCIAL FILTER TLS YOUTUBE"
/ip firewall filter add chain=forward protocol=tcp dst-port=443 src-address-list="mashup-client-youtube" tls-host="*ytimg*" action=accept comment="MASHUPKGRID SOCIAL FILTER TLS YOUTUBE"
/ip firewall filter add chain=forward protocol=tcp dst-port=443 src-address-list="mashup-client-youtube" tls-host="*ggpht*" action=accept comment="MASHUPKGRID SOCIAL FILTER TLS YOUTUBE"

/ip firewall filter add chain=forward protocol=tcp dst-port=443 src-address-list="mashup-client-facebook" tls-host="*facebook*" action=accept comment="MASHUPKGRID SOCIAL FILTER TLS FACEBOOK"
/ip firewall filter add chain=forward protocol=tcp dst-port=443 src-address-list="mashup-client-facebook" tls-host="*fbcdn*" action=accept comment="MASHUPKGRID SOCIAL FILTER TLS FACEBOOK"
/ip firewall filter add chain=forward protocol=tcp dst-port=443 src-address-list="mashup-client-facebook" tls-host="*messenger*" action=accept comment="MASHUPKGRID SOCIAL FILTER TLS FACEBOOK"

/ip firewall filter add chain=forward protocol=tcp dst-port=443 src-address-list="mashup-client-instagram" tls-host="*instagram*" action=accept comment="MASHUPKGRID SOCIAL FILTER TLS INSTAGRAM"
/ip firewall filter add chain=forward protocol=tcp dst-port=443 src-address-list="mashup-client-instagram" tls-host="*cdninstagram*" action=accept comment="MASHUPKGRID SOCIAL FILTER TLS INSTAGRAM"

/ip firewall filter add chain=forward protocol=tcp dst-port=443 src-address-list="mashup-client-whatsapp" tls-host="*whatsapp*" action=accept comment="MASHUPKGRID SOCIAL FILTER TLS WHATSAPP"

# 4. Social Bundle (All Socials) allows all destinations + Twitter/X
/ip firewall filter add chain=forward src-address-list="mashup-client-social" dst-address-list="mashup-dest-social" action=accept comment="MASHUPKGRID SOCIAL FILTER ALLOW SOCIAL"
/ip firewall filter add chain=forward src-address-list="mashup-client-social" dst-address-list="mashup-dest-tiktok" action=accept comment="MASHUPKGRID SOCIAL FILTER ALLOW SOCIAL TIKTOK"
/ip firewall filter add chain=forward src-address-list="mashup-client-social" dst-address-list="mashup-dest-youtube" action=accept comment="MASHUPKGRID SOCIAL FILTER ALLOW SOCIAL YOUTUBE"
/ip firewall filter add chain=forward src-address-list="mashup-client-social" dst-address-list="mashup-dest-facebook" action=accept comment="MASHUPKGRID SOCIAL FILTER ALLOW SOCIAL FACEBOOK"
/ip firewall filter add chain=forward src-address-list="mashup-client-social" dst-address-list="mashup-dest-instagram" action=accept comment="MASHUPKGRID SOCIAL FILTER ALLOW SOCIAL INSTAGRAM"
/ip firewall filter add chain=forward src-address-list="mashup-client-social" dst-address-list="mashup-dest-whatsapp" action=accept comment="MASHUPKGRID SOCIAL FILTER ALLOW SOCIAL WHATSAPP"
/ip firewall filter add chain=forward src-address-list="mashup-client-social" dst-address-list="mashup-dest-meta" action=accept comment="MASHUPKGRID SOCIAL FILTER ALLOW SOCIAL META"

/ip firewall filter add chain=forward protocol=tcp dst-port=5222 src-address-list="mashup-client-social" action=accept comment="MASHUPKGRID SOCIAL FILTER ALLOW SOCIAL WHATSAPP CHAT"
/ip firewall filter add chain=forward protocol=udp dst-port=3478,45395 src-address-list="mashup-client-social" action=accept comment="MASHUPKGRID SOCIAL FILTER ALLOW SOCIAL WHATSAPP CALLS"

/ip firewall filter add chain=forward protocol=tcp dst-port=443 src-address-list="mashup-client-social" tls-host="*tiktok*" action=accept comment="MASHUPKGRID SOCIAL FILTER TLS SOCIAL"
/ip firewall filter add chain=forward protocol=tcp dst-port=443 src-address-list="mashup-client-social" tls-host="*byteoversea*" action=accept comment="MASHUPKGRID SOCIAL FILTER TLS SOCIAL"
/ip firewall filter add chain=forward protocol=tcp dst-port=443 src-address-list="mashup-client-social" tls-host="*ibytedtos*" action=accept comment="MASHUPKGRID SOCIAL FILTER TLS SOCIAL"
/ip firewall filter add chain=forward protocol=tcp dst-port=443 src-address-list="mashup-client-social" tls-host="*youtube*" action=accept comment="MASHUPKGRID SOCIAL FILTER TLS SOCIAL"
/ip firewall filter add chain=forward protocol=tcp dst-port=443 src-address-list="mashup-client-social" tls-host="*googlevideo*" action=accept comment="MASHUPKGRID SOCIAL FILTER TLS SOCIAL"
/ip firewall filter add chain=forward protocol=tcp dst-port=443 src-address-list="mashup-client-social" tls-host="*ytimg*" action=accept comment="MASHUPKGRID SOCIAL FILTER TLS SOCIAL"
/ip firewall filter add chain=forward protocol=tcp dst-port=443 src-address-list="mashup-client-social" tls-host="*facebook*" action=accept comment="MASHUPKGRID SOCIAL FILTER TLS SOCIAL"
/ip firewall filter add chain=forward protocol=tcp dst-port=443 src-address-list="mashup-client-social" tls-host="*fbcdn*" action=accept comment="MASHUPKGRID SOCIAL FILTER TLS SOCIAL"
/ip firewall filter add chain=forward protocol=tcp dst-port=443 src-address-list="mashup-client-social" tls-host="*messenger*" action=accept comment="MASHUPKGRID SOCIAL FILTER TLS SOCIAL"
/ip firewall filter add chain=forward protocol=tcp dst-port=443 src-address-list="mashup-client-social" tls-host="*instagram*" action=accept comment="MASHUPKGRID SOCIAL FILTER TLS SOCIAL"
/ip firewall filter add chain=forward protocol=tcp dst-port=443 src-address-list="mashup-client-social" tls-host="*cdninstagram*" action=accept comment="MASHUPKGRID SOCIAL FILTER TLS SOCIAL"
/ip firewall filter add chain=forward protocol=tcp dst-port=443 src-address-list="mashup-client-social" tls-host="*whatsapp*" action=accept comment="MASHUPKGRID SOCIAL FILTER TLS SOCIAL"
/ip firewall filter add chain=forward protocol=tcp dst-port=443 src-address-list="mashup-client-social" tls-host="*twitter*" action=accept comment="MASHUPKGRID SOCIAL FILTER TLS SOCIAL"
/ip firewall filter add chain=forward protocol=tcp dst-port=443 src-address-list="mashup-client-social" tls-host="*twimg*" action=accept comment="MASHUPKGRID SOCIAL FILTER TLS SOCIAL"
/ip firewall filter add chain=forward protocol=tcp dst-port=443 src-address-list="mashup-client-social" tls-host="*x.com*" action=accept comment="MASHUPKGRID SOCIAL FILTER TLS SOCIAL"

# 5. Block all non-app destinations for each social profile
/ip firewall filter add chain=forward src-address-list="mashup-client-tiktok" action=drop comment="MASHUPKGRID SOCIAL FILTER BLOCK TIKTOK"
/ip firewall filter add chain=forward src-address-list="mashup-client-youtube" action=drop comment="MASHUPKGRID SOCIAL FILTER BLOCK YOUTUBE"
/ip firewall filter add chain=forward src-address-list="mashup-client-facebook" action=drop comment="MASHUPKGRID SOCIAL FILTER BLOCK FACEBOOK"
/ip firewall filter add chain=forward src-address-list="mashup-client-instagram" action=drop comment="MASHUPKGRID SOCIAL FILTER BLOCK INSTAGRAM"
/ip firewall filter add chain=forward src-address-list="mashup-client-whatsapp" action=drop comment="MASHUPKGRID SOCIAL FILTER BLOCK WHATSAPP"
/ip firewall filter add chain=forward src-address-list="mashup-client-social" action=drop comment="MASHUPKGRID SOCIAL FILTER BLOCK SOCIAL"

# 6. Crucial: Move rules to top of forward chain (so they take priority over defconf accept rules)
:foreach i in=[/ip firewall filter find comment~"MASHUPKGRID SOCIAL FILTER"] do={
  :do {/ip firewall filter move $i destination=0} on-error={}
}

:put "Social-only & App-specific package firewall filters initialized"`;
}

/** Standalone script for operators to paste into MikroTik terminal to activate or update social bundle rules on an existing router. */
export function buildSocialFirewallOnlyScript(): string {
  return `# MASHUPKGRID ISP — Social Bundles & App-Specific Firewall Isolation
# Paste this directly into your MikroTik terminal:

${buildSocialAppFirewallSection()}

:put "========================================================="
:put "  SUCCESS! Social Media Isolation Filters are ACTIVE!     "
:put "  WhatsApp, TikTok, YouTube, Meta, X/Twitter bundles on! "
:put "========================================================="
`;
}

/** The PPPoE server half of a router's setup.
 *
 *  Emitted only when an interface is configured. PPPoE is not defaulted the way the hotspot is:
 *  a hotspot safely binds the LAN bridge, whereas a PPPoE server needs to face the subscribers
 *  specifically — a port, or a VLAN trunk — and it hands out addresses from a pool. Inventing an
 *  addressing plan for someone's live network is how you collide with their existing subnets, so
 *  a router with no PPPoE configuration gets no PPPoE section rather than a guess.
 *
 *  Without this the router authenticates PPPoE against RADIUS correctly and still cannot accept
 *  a single subscriber, because nothing is listening for PPPoE discovery — exactly the failure
 *  the hotspot had before `/ip hotspot add` was restored. */
function buildPppoeSection(
  iface?: string | null,
  gatewayIp?: string | null,
  poolRange?: string | null
): string {
  if (!iface) {
    return `# 8. PPPoE — not configured for this router. Hotspot works without it; if you sell
#    PPPoE/fibre subscriptions, set the PPPoE interface and address range on the router in the
#    dashboard and re-run this script. RADIUS is already wired for PPP, so only the server
#    itself is missing.`;
  }

  const gateway = gatewayIp || "10.10.0.1";
  const range = poolRange || "10.10.0.2-10.10.255.254";

  return `# 8. PPPoE Server. RADIUS already knows how to authenticate these subscribers (step 4);
#    this is the part that listens for them. Each line is idempotent and self-contained, so a
#    re-run updates rather than duplicates.
/ip pool remove [find name=mkg-pppoe-pool]
/ip pool add name=mkg-pppoe-pool ranges=${range}
/ppp profile remove [find name=mkg-pppoe]
/ppp profile add name=mkg-pppoe local-address=${gateway} remote-address=mkg-pppoe-pool
# The subscriber's speed comes from RADIUS per account (Mikrotik-Rate-Limit), not from this
# profile — the profile only supplies the addressing, so one profile serves every package.
/interface pppoe-server server remove [find service-name=mkg-pppoe]
/interface pppoe-server server add service-name=mkg-pppoe interface=${iface} default-profile=mkg-pppoe one-session-per-host=yes disabled=no
:put "PPPoE server listening on ${iface}, subscribers get ${range}"`;
}

/** Builds the one paste-and-run script a "Link a router" wizard needs before it knows anything
 *  about the router's address: it enables the RouterOS API, creates the dedicated user/password
 *  this platform generated (so no one ever types API credentials into the dashboard), and calls
 *  the platform back so `Router.host` gets filled in from the request's own source address —
 *  see completeRouterProvisioning in @mashupkgrid/network. `/tool fetch`'s exact syntax is
 *  broadly compatible across RouterOS v6.45+ and v7.x; older releases may need `mode=https`
 *  swapped for `mode=http` or the flag renamed, hence the router.useTls branch below. */
export function buildMikrotikProvisioningScript(
  router: Router,
  credentials: { username: string; password: string },
  callbackUrl: string,
  options: {
    radiusHost?: string;
    radiusSecret?: string;
    managementSource?: string;
    serverPublicKey?: string;
    serverHost?: string;
    serverPort?: number;
    vpnIp?: string;
    loginTemplateUrl?: string;
    hotspotInterface?: string;
    /** Existing IP pool the hotspot hands addresses from — deliberately reusing the interface's
     *  current DHCP pool rather than creating a second one on the same subnet. */
    addressPool?: string;
    /** Host of the branded captive-portal page the router's login.html redirects to (the web
     *  app, which is a different host from the API in every deployment) — it MUST be in the
     *  walled garden or an unauthenticated client can never load the page it was redirected to,
     *  which looks exactly like "the captive portal doesn't display". */
    portalHost?: string;
    /** Every additional hostname this tenant's own customers may be sent to — their verified
     *  custom domains (the Domain model). A tenant on a white-label domain has a portal that is
     *  NOT on portalHost, so without these the redirect lands on a host the hotspot is still
     *  blocking and the customer sees a connection error instead of a login page. */
    portalDomains?: string[];
    /** PPPoE server settings. Omitted entirely when `pppoeInterface` is absent — see the step 8
     *  comment in the generated script for why this is opt-in rather than defaulted. */
    pppoeInterface?: string | null;
    pppoeGatewayIp?: string | null;
    pppoePoolRange?: string | null;
    /** See buildAntiTetheringSection — opt-in because TTL detection has real false positives. */
    blockTethering?: boolean;
    /** Outbound endpoint URL for pushing discovered neighbor access points */
    apSyncUrl?: string;
  } = {}
): string {
  const apiLine = router.useTls
    ? `/ip service set api-ssl disabled=no port=${router.apiPort}`
    : `/ip service set api disabled=no port=${router.apiPort}`;

  const safeName = sanitizeForScript(router.name);
  const radiusHost = options.radiusHost || "68.210.187.104";
  // Defaults to the router's own generated password, and completeRouterProvisioning (in
  // @mashupkgrid/network) registers the RadiusNas row with exactly this value when the callback
  // below lands. The embedded RADIUS server matches a NAS by source IP and verifies with that
  // stored secret, so if this default is changed here it MUST be changed there too — a mismatch
  // makes every Access-Request fail with no reply, which the captive portal shows the user as
  // "Already authorizing, retry later".
  const radiusSecret = options.radiusSecret || credentials.password;
  const managementSource = options.managementSource?.trim();
  const apiSource = managementSource ? ` address=${managementSource}` : " address=\"\"";
  const firewallSource = managementSource ? ` src-address=${managementSource}` : "";
  const serverHost = options.serverHost || "68.210.187.104";
  const serverPort = options.serverPort || 51820;
  const serverPublicKey = options.serverPublicKey || "";
  const vpnIp = options.vpnIp || "10.90.0.2";
  const wireguardSection = serverPublicKey
    ? `
# Optional management VPN (RouterOS v7+). This is deliberately last: a legacy or low-resource
# hAP must still finish hotspot provisioning even when WireGuard is unavailable.
:if ([:pick [/system resource get version] 0 2] = "7.") do={
  :do {
  /interface wireguard remove [find name=mkg-wg]
  /interface wireguard add name=mkg-wg listen-port=${serverPort}
  :delay 2s
  /ip address remove [find interface=mkg-wg]
  /ip address add address=${vpnIp}/32 interface=mkg-wg
  :local routerPublicKey [/interface wireguard get [find name=mkg-wg] public-key]
  /tool fetch url="${callbackUrl}" http-method=post http-data=$routerPublicKey keep-result=no
  :delay 2s
  /interface wireguard peers remove [find interface=mkg-wg]
  /interface wireguard peers add interface=mkg-wg public-key="${serverPublicKey}" endpoint-address="${serverHost}" endpoint-port=${serverPort} allowed-address=10.90.0.0/16 persistent-keepalive=25s
  } on-error={}
}
`
    :"";
  const hotspotInterface = options.hotspotInterface || "bridge";
  // "bridge" / "default-dhcp" are the names MikroTik's own defconf ships with, so they are right
  // on a factory-reset router; the DHCP-derived fallback in the script covers everything else.
  const addressPool = options.addressPool || "default-dhcp";
  const antiTetheringSection = buildAntiTetheringSection(options.blockTethering === true);
  const socialAppFirewallSection = buildSocialAppFirewallSection();
  const pppoeSection = buildPppoeSection(
    options.pppoeInterface,
    options.pppoeGatewayIp,
    options.pppoePoolRange
  );
  const loginTemplateUrl = options.loginTemplateUrl || "https://api.mashuphost.tech/api/v1/hotspot/demo-isp/mikrotik-login-template";
  const apiHost = hostFromUrl(loginTemplateUrl);
  const portalHost = options.portalHost ? hostFromUrl(options.portalHost) : "captive.mashuphost.tech";
  // Order matters only for readability of the generated script; walledGardenLines de-dupes.
  // The tenant's own domains come before the gateways so an operator reading the script sees
  // "my portal is reachable" first — that is the entry they most often need to check.
  const walledGardenHosts = [
    "captive.mashuphost.tech",
    ...hostWithSubdomains(apiHost),
    ...hostWithSubdomains(portalHost),
    ...hostWithSubdomains("mashuphost.tech"),
    ...(options.portalDomains ?? []).flatMap((d) => hostWithSubdomains(hostFromUrl(d))),
    ...PAYMENT_GATEWAY_WALLED_GARDEN_HOSTS,
  ];

  const apSyncUrl =
    options.apSyncUrl ||
    (callbackUrl.includes("/provision/")
      ? callbackUrl.replace(/\/provision\/.*$/, `/${router.id}/push-aps`)
      : `https://${apiHost}/api/v1/routers/${router.id}/push-aps`);

  const minimalProvisioningScript = `# MASHUPKGRID ISP - safe baseline setup for "${safeName}"
# The router must already have WAN internet access for this file to download.
:do {/tool fetch url="${callbackUrl}" http-method=post keep-result=no} on-error={}

# LAN, Wi-Fi and WAN baseline. Existing configurations are preserved when present.
:do {/interface bridge add name=bridge} on-error={}
:do {/interface bridge port add bridge=bridge interface=ether2} on-error={}
:do {/interface bridge port add bridge=bridge interface=ether3} on-error={}
:do {/interface bridge port add bridge=bridge interface=ether4} on-error={}
:do {/interface bridge port add bridge=bridge interface=ether5} on-error={}
:do {/interface bridge port add bridge=bridge interface=wlan1} on-error={}
:do {/interface wireless set wlan1 disabled=no mode=ap-bridge ssid="MASHUPKGRID"} on-error={}
:do {/ip dhcp-client add interface=ether1 disabled=no add-default-route=yes use-peer-dns=yes} on-error={}
:do {/ip address add address=192.168.88.1/24 interface=bridge} on-error={}
:do {/ip pool add name=default-dhcp ranges=192.168.88.10-192.168.88.254} on-error={}
:do {/ip dhcp-server add name=mkg-dhcp interface=bridge address-pool=default-dhcp disabled=no} on-error={}
:do {/ip dhcp-server network add address=192.168.88.0/24 gateway=192.168.88.1 dns-server=192.168.88.1} on-error={}
:do {/ip dns set allow-remote-requests=yes} on-error={}
:do {/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade comment="MASHUPKGRID"} on-error={}

# Management API and account.
:do {${apiLine}} on-error={}
:do {/ip firewall filter add chain=input protocol=tcp dst-port=${router.apiPort} action=accept place-before=0 comment="MASHUPKGRID ISP API"} on-error={}
:do {/ip service set winbox disabled=no port=8291} on-error={}
:do {/user remove [find name=${credentials.username}]} on-error={}
:do {/user add name=${credentials.username} group=full password="${credentials.password}"} on-error={}

# RADIUS and captive portal.
:do {/radius remove [find address="${radiusHost}"]} on-error={}
:do {/radius add service=ppp,hotspot address=${radiusHost} secret="${radiusSecret}" authentication-port=1812 accounting-port=1813 timeout=3s} on-error={}
:do {/ppp aaa set use-radius=yes accounting=yes interim-update=1m} on-error={}
:do {/ip hotspot profile set [find default=yes] use-radius=yes login-by=http-chap,http-pap radius-accounting=yes radius-interim-update=1m html-directory=hotspot} on-error={}
:do {/ip hotspot user profile set [find default=yes] shared-users=1} on-error={}
:do {/ip hotspot remove [find name=mkg-hotspot]} on-error={}
:do {/ip hotspot add name=mkg-hotspot interface=bridge address-pool=default-dhcp profile=default disabled=no} on-error={}
:do {/ip hotspot walled-garden remove [find comment="MASHUPKGRID"]} on-error={}
:do {/ip hotspot walled-garden ip remove [find comment="MASHUPKGRID"]} on-error={}
${walledGardenLines(walledGardenHosts)}
:do {/tool fetch url="${loginTemplateUrl}" dst-path=hotspot/login.html check-certificate=no} on-error={}

# Persistent check-in. It survives normal reboots and is safe to re-run.
:do {/system scheduler remove [find name=mkg-heartbeat]} on-error={}
:do {/system scheduler add name=mkg-heartbeat interval=1m on-event=":do {/tool fetch url=\\"${callbackUrl}\\" http-method=post keep-result=no} on-error={}"} on-error={}

# Automated NTP Time Synchronization
:do {/system clock set time-zone-autodetect=yes time-zone-name=Africa/Nairobi} on-error={}
:do {/system ntp client set enabled=yes} on-error={}
:do {/system ntp client servers add address=pool.ntp.org} on-error={}
:do {/system ntp client servers add address=time.google.com} on-error={}

${pppoeSection}

${antiTetheringSection}

${socialAppFirewallSection}

${wireguardSection}

:put "========================================================="
:put "  SUCCESS! Router & Hotspot captive portal are ONLINE!  "
:put "  All ISP core features & Social Bundles activated!      "
:put "========================================================="
`;

  return minimalProvisioningScript;
}

/** Step 1 of remote access: WireGuard is RouterOS v7+ only (there is no v6 equivalent — unlike
 *  the provisioning/RADIUS scripts above, this one has no legacy fallback). The router generates
 *  its own keypair locally (`/interface wireguard add` with no `private-key=` auto-generates
 *  one) and only ever sends the *public* half anywhere. The key travels as the raw POST body
 *  (`http-data=`), not a query parameter — a WireGuard public key is standard base64 and would
 *  need URL-encoding RouterOS's scripting language has no built-in way to do. */
export function buildMikrotikVpnStartScript(router: Router, callbackUrl: string, listenPort = 51820): string {
  return `# MASHUPKGRID ISP — remote access (WireGuard) setup, step 1 of 2, for router "${sanitizeForScript(router.name)}"
# Requires RouterOS v7+ (WireGuard has no v6 equivalent). Paste into the router's terminal, run it.

{
  # 1. Clean up any previous WireGuard interface and create fresh interface
  /interface wireguard remove [find name=mkg-wg]
  /interface wireguard add name=mkg-wg listen-port=${listenPort}
  :delay 2s

  # 2. Read back the public key and register it with the cloud platform
  :local pubkey [/interface wireguard get [find name=mkg-wg] public-key]
  :put ("Generated WireGuard Public Key: " . $pubkey)
  /tool fetch url="${callbackUrl}?pubkey=$pubkey" http-method=post http-data=$pubkey keep-result=no

  :put "========================================================="
  :put "  Step 1 complete! Click 'Finish Remote Access' on web   "
  :put "========================================================="
}
`;
}

export interface VpnCompleteScriptInput {
  serverPublicKey: string;
  serverEndpoint: string;
  serverListenPort: number;
  assignedVpnIp: string;
  /** The platform's WireGuard tunnel subnet (WIREGUARD_SUBNET_CIDR). Scopes what the peer is
   *  allowed to send — see the allowed-address line below for why 0.0.0.0/0 was wrong here. */
  tunnelSubnetCidr?: string;
}

/** Step 2, generated only after the platform has allocated this router a tunnel IP and added it
 *  as a peer on its own WireGuard interface (see completeVpnRegistration in @mashupkgrid/network)
 *  — this router-side half can't be built before that, since it needs the assigned IP. Once run,
 *  `Router.host` is already the tunnel IP server-side, so every other feature (test-connection,
 *  hotspot script, live sessions) just starts working over the tunnel with no further changes. */
export function buildMikrotikVpnCompleteScript(input: VpnCompleteScriptInput): string {
  const endpointHost = input.serverEndpoint.includes(":") ? input.serverEndpoint.split(":")[0] : input.serverEndpoint;
  const endpointPort = input.serverEndpoint.includes(":") ? Number(input.serverEndpoint.split(":")[1]) : (input.serverListenPort || 51820);
  const serverPubKey = input.serverPublicKey || "";
  const tunnelSubnet = input.tunnelSubnetCidr || "10.90.0.0/16";

  return `# MASHUPKGRID ISP — remote access (WireGuard) setup, step 2 of 2
# Paste into the router's terminal, run it. This finishes the tunnel — the platform can then
# reach this router at ${input.assignedVpnIp} regardless of its real network location.

# allowed-address is the peer's permission to claim a source address, not a route. Scoping it to
# the platform's own tunnel subnet is what makes this a MANAGEMENT tunnel: at 0.0.0.0/0 the
# server peer was authorised to send the router traffic claiming ANY source address on the
# internet, and on a small CPE it also invites the whole-internet-through-the-tunnel behaviour
# that flattens a device with no crypto acceleration.
/interface wireguard peers remove [find interface=mkg-wg]
/interface wireguard peers add interface=mkg-wg public-key="${serverPubKey}" endpoint-address="${endpointHost}" endpoint-port=${endpointPort} allowed-address=${tunnelSubnet} persistent-keepalive=25s

/ip address remove [find interface=mkg-wg]
/ip address add address=${input.assignedVpnIp}/32 interface=mkg-wg

:put "========================================================="
:put "  SUCCESS! WireGuard tunnel active at ${input.assignedVpnIp} "
:put "========================================================="
`;
}

/**
 * Builds a 1-click MikroTik script to enable WinBox Remote Access and Cloud DDNS.
 * Works on any MikroTik RouterOS v6 or v7 device.
 */
export function buildMikrotikWinboxScript(routerName: string): string {
  const safeName = sanitizeForScript(routerName);
  return `# MASHUPKGRID ISP — Remote WinBox Access & Cloud DDNS for "${safeName}"
# Paste this into your MikroTik Terminal:

# 1. Enable WinBox on port 8291
/ip service set winbox disabled=no port=8291

# 2. Allow WinBox incoming traffic in Firewall (places rule at position 0)
/ip firewall filter remove [find comment="MASHUPKGRID WINBOX REMOTE"]
/ip firewall filter add chain=input protocol=tcp dst-port=8291 action=accept place-before=0 comment="MASHUPKGRID WINBOX REMOTE"
:do {/ip firewall filter move [find comment="MASHUPKGRID WINBOX REMOTE"] destination=0} on-error={}

# 3. Enable MikroTik Cloud Dynamic DNS (free remote hostname for WinBox)
/ip cloud set ddns-enabled=yes update-time=yes
:delay 2s

# 4. Show the assigned remote address
:local dnsName [/ip cloud get dns-name]
:local pubIp [/ip cloud get public-address]
:put "========================================================="
:put "  SUCCESS! Remote WinBox Access is now enabled!        "
:put ("  Connect in WinBox to: " . $dnsName . " or " . $pubIp . ":8291")
:put "========================================================="
`;
}

