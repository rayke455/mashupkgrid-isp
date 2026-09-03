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
    lines.push(
      `/ip hotspot walled-garden ip add dst-host=${host} protocol=tcp dst-port=80,443 action=accept comment="MASHUPKGRID"`
    );
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
    return `# 10. Anti-tethering is OFF for this router. Enable it in the dashboard if customers are
#     sharing one voucher across a room via their phone's hotspot.`;
  }

  return `# 10. Anti-tethering. Drops traffic that reached this router through a customer's own
#     hotspot or travel router, identified by a TTL one hop below the device's own. Scoped to
#     authenticated hotspot clients: an unauthenticated device is already blocked, and PPPoE
#     subscribers are not touched.
/ip firewall filter remove [find comment="MASHUPKGRID ANTI-TETHER"]
/ip firewall filter add chain=forward hotspot=auth ttl=equal:63 action=drop comment="MASHUPKGRID ANTI-TETHER"
/ip firewall filter add chain=forward hotspot=auth ttl=equal:127 action=drop comment="MASHUPKGRID ANTI-TETHER"
:do {/ip firewall filter move [find comment="MASHUPKGRID ANTI-TETHER"] destination=0} on-error={}
:put "Anti-tethering active — one device per voucher enforced at the network level"`;
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
  const hotspotInterface = options.hotspotInterface || "bridge";
  // "bridge" / "default-dhcp" are the names MikroTik's own defconf ships with, so they are right
  // on a factory-reset router; the DHCP-derived fallback in the script covers everything else.
  const addressPool = options.addressPool || "default-dhcp";
  const antiTetheringSection = buildAntiTetheringSection(options.blockTethering === true);
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

  return `# MASHUPKGRID ISP — Automated Setup for "${safeName}"
# 1. API Service
${apiLine}
/ip firewall filter remove [find comment="MASHUPKGRID ISP API"]
/ip firewall filter add chain=input protocol=tcp dst-port=${router.apiPort}${firewallSource} action=accept comment="MASHUPKGRID ISP API"
:do {/ip firewall filter move [find comment="MASHUPKGRID ISP API"] destination=0} on-error={}

# 2. Management User
/user remove [find name=${credentials.username}]
/user add name=${credentials.username} group=full password="${credentials.password}"

# 3. Heartbeat Scheduler & Instant Handshake (Links router immediately)
/system scheduler remove [find name=mkg-heartbeat]
/system scheduler add name=mkg-heartbeat interval=1m on-event="/tool fetch url=\\"${callbackUrl}\\" http-method=post keep-result=no"
/tool fetch url="${callbackUrl}" http-method=post keep-result=no

# 4. RADIUS Authentication (PPPoE & Hotspot)
/radius remove [find address="${radiusHost}"]
/radius add service=ppp,hotspot address=${radiusHost} secret="${radiusSecret}" authentication-port=1812 accounting-port=1813 timeout=3s
/ppp aaa set use-radius=yes accounting=yes interim-update=1m
/radius incoming set accept=yes port=3799

# 5. Hotspot Captive Portal Server — WITHOUT this nothing intercepts an unauthenticated
#    client's traffic, so no login page is ever shown no matter how the profile, RADIUS and
#    walled garden are configured. This is the single line whose removal (commit c9f944c) took
#    the whole captive portal offline.
#
#    Every line below is deliberately self-contained: NO ":local" variables, and no nested
#    ":if ... do={:if ... }". This script is delivered two ways — "/import setup.rsc" AND
#    copy-paste into a terminal — and in the terminal each pasted line is its own scope, so a
#    variable set on one line is already empty on the next. A confirmed hAP failure: interface
#    detection assigned to a ":local", then "/ip hotspot add interface=$hsif" on the next line
#    saw nothing and bound the hotspot to the WireGuard interface instead of the LAN bridge,
#    producing an INVALID hotspot and no portal. Nested :if blocks also plain syntax-error on
#    the RouterOS v6 console.
/ip hotspot profile set [find default=yes] use-radius=yes login-by=http-chap,http-pap radius-accounting=yes radius-interim-update=1m html-directory=hotspot
# One device per voucher. Without this a single code can be passed around a room and every device
# on it counts as the same paying customer — the most common way hotspot revenue leaks.
/ip hotspot user profile set [find default=yes] shared-users=1
/ip hotspot remove [find name=mkg-hotspot]
:do {/ip hotspot add name=mkg-hotspot interface=${hotspotInterface} address-pool=${addressPool} profile=default disabled=no} on-error={}
# Fallback for a router whose LAN bridge/pool aren't named the defconf defaults: derive both
# from whatever the existing DHCP server already serves. One self-contained statement, so it
# survives being pasted on its own line, and only runs if the line above created nothing.
:if ([:len [/ip hotspot find name=mkg-hotspot]] = 0) do={:do {/ip hotspot add name=mkg-hotspot interface=[/ip dhcp-server get [:pick [/ip dhcp-server find] 0] interface] address-pool=[/ip dhcp-server get [:pick [/ip dhcp-server find] 0] address-pool] profile=default disabled=no} on-error={}}

# 5b. The portal cannot appear without working DNS: the client's captive-portal probe, the
#     redirect to the branded page, and every walled-garden dst-host lookup all resolve names.
:if ([:len [/ip dns get servers]] = 0) do={/ip dns set servers=8.8.8.8,1.1.1.1}
/ip dns set allow-remote-requests=yes

# 5c. Hotspot clients need source NAT to reach the internet once they authenticate. MikroTik's
#     defconf ships a masquerade rule, but a router that has been reset to a blank config, or
#     had its firewall rebuilt by hand, has none -- and the symptom is the worst kind: login
#     succeeds, then every page still fails. Only added when no masquerade rule exists at all,
#     so an operator's own NAT setup is never duplicated or overridden.
:if ([:len [/ip firewall nat find action=masquerade]] = 0) do={/ip firewall nat add chain=srcnat action=masquerade comment="MASHUPKGRID"}

# 6. Walled Garden (portal + payment gateway bypasses). Removed by comment first so re-running
#    this script doesn't stack duplicate entries.
/ip hotspot walled-garden remove [find comment="MASHUPKGRID"]
/ip hotspot walled-garden ip remove [find comment="MASHUPKGRID"]
${walledGardenLines(walledGardenHosts)}

# 7. Cloud Portal Login Template. Non-fatal: if the fetch fails the router keeps its stock
#    hotspot login page, which still authenticates against RADIUS — a plain login form beats
#    no page at all, and the import continues instead of aborting here.
:do {/tool fetch url="${loginTemplateUrl}" dst-path=hotspot/login.html check-certificate=no} on-error={:put "WARNING: portal login page fetch failed - stock RouterOS login page will be used."}

${pppoeSection}

# 9. Anti-tunnelling. A captive portal has to let an unauthenticated device do two things before
#    it has paid: resolve names (DNS) and, on most setups, ping. Those are exactly the two
#    channels used to carry IP traffic past the portal — iodine and dnscat tunnel over DNS,
#    various tools tunnel over ICMP echo — and someone doing it gets free internet on your link
#    while contributing nothing. Everything else is already blocked, because the hotspot drops
#    anything that is neither authenticated nor in the walled garden.
#
#    Both rules are scoped with hotspot=!auth so they apply ONLY to devices that have not logged
#    in. A paying customer is unaffected: their DNS is unlimited and their pings work.
# Clean up old rules
/ip firewall filter remove [find comment~"MASHUPKGRID ANTI-TUNNEL"]
/ip firewall filter remove [find comment~"MASHUPKGRID ANTI-VPN"]
/ip firewall nat remove [find comment~"MASHUPKGRID ANTI-VPN"]

# 1. DNS Hijack: Force unauthenticated DNS to router (stops SlowDNS, iodine, dnscat)
/ip firewall nat add chain=dstnat protocol=udp dst-port=53 hotspot=!auth action=redirect to-ports=53 comment="MASHUPKGRID ANTI-VPN"
/ip firewall nat add chain=dstnat protocol=tcp dst-port=53 hotspot=!auth action=redirect to-ports=53 comment="MASHUPKGRID ANTI-VPN"

# 2. Block direct outbound DNS queries (stops bypass attempts)
/ip firewall filter add chain=forward protocol=udp dst-port=53 hotspot=!auth action=drop comment="MASHUPKGRID ANTI-VPN"
/ip firewall filter add chain=forward protocol=tcp dst-port=53 hotspot=!auth action=drop comment="MASHUPKGRID ANTI-VPN"

# 3. Block UDP forwarding completely for unauth (kills WireGuard, OpenVPN UDP, V2Ray UDP, QUIC tunnels)
/ip firewall filter add chain=forward protocol=udp hotspot=!auth action=drop comment="MASHUPKGRID ANTI-VPN"

# 4. Block common VPN & Proxy ports
/ip firewall filter add chain=forward protocol=tcp dst-port=22,1194,3128,8080,8443,8888,51820,9000-65535 hotspot=!auth action=drop comment="MASHUPKGRID ANTI-VPN"

# 5. BLOCK WEBSOCKET TUNNELS (Kills HA Tunnel Plus & HTTP Injector over Cloudflare CDN)
/ip firewall filter add chain=forward protocol=tcp content="websocket" hotspot=!auth action=drop comment="MASHUPKGRID ANTI-VPN"
/ip firewall filter add chain=forward protocol=tcp content="Upgrade: websocket" hotspot=!auth action=drop comment="MASHUPKGRID ANTI-VPN"
/ip firewall filter add chain=forward protocol=tcp content="Sec-WebSocket" hotspot=!auth action=drop comment="MASHUPKGRID ANTI-VPN"

# 6. BLOCK SSH TUNNELS (Kills SSH over port 443/80)
/ip firewall filter add chain=forward protocol=tcp content="SSH-" hotspot=!auth action=drop comment="MASHUPKGRID ANTI-VPN"

# 7. BLOCK HTTP INJECTOR PROXY TUNNELS (Kills HTTP CONNECT proxying)
/ip firewall filter add chain=forward protocol=tcp content="CONNECT " hotspot=!auth action=drop comment="MASHUPKGRID ANTI-VPN"

# 8. LIMIT PERSISTENT DATA TRANSFERS (Captive portal never downloads large continuous data)
# Drops any single unauthenticated connection that transfers more than 3 Megabytes
/ip firewall filter add chain=forward protocol=tcp connection-bytes=3000000-0 hotspot=!auth action=drop comment="MASHUPKGRID ANTI-VPN"

# 9. LIMIT CONCURRENT CONNECTIONS (Stops multi-connection flood tunnels)
/ip firewall filter add chain=forward protocol=tcp hotspot=!auth connection-limit=6,32 action=drop comment="MASHUPKGRID ANTI-VPN"

# 10. BLOCK ICMP TUNNELS
/ip firewall filter add chain=forward protocol=icmp hotspot=!auth action=drop comment="MASHUPKGRID ANTI-VPN"

# 12. MOVE ALL RULES TO TOP OF CHAIN (Crucial: loop each item so RouterOS reliably moves them to position 0)
:foreach i in=[/ip firewall filter find comment~"MASHUPKGRID ANTI-VPN"] do={
  :do {/ip firewall filter move $i destination=0} on-error={}
}
:foreach i in=[/ip firewall nat find comment~"MASHUPKGRID ANTI-VPN"] do={
  :do {/ip firewall nat move $i destination=0} on-error={}
}
:put "Anti-VPN & Anti-tunnelling shield active (WebSocket tunnels, SSH, SlowDNS, UDP & VPN ports blocked)"

${antiTetheringSection}

:put "========================================================="
:put "  SUCCESS! Router & Hotspot captive portal are ONLINE!  "
:put "========================================================="
`;
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
