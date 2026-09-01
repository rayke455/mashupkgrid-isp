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

export interface MikrotikSetupScript {
  /** Paste directly into the router's terminal (WinBox "New Terminal", or SSH). */
  mikrotikScript: string;
  /** Add this `client { }` block to infrastructure/freeradius/raddb/clients.conf — dynamic
   *  SQL-backed client loading is off (see that file), so this router won't be trusted by
   *  FreeRADIUS until it's added there with the same secret. */
  freeradiusClientSnippet: string;
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
  } = {}
): string {
  const apiLine = router.useTls
    ? `/ip service set api-ssl disabled=no port=${router.apiPort}`
    : `/ip service set api disabled=no port=${router.apiPort}`;

  const safeName = sanitizeForScript(router.name);
  const radiusHost = options.radiusHost || "68.210.187.104";
  const radiusSecret = options.radiusSecret || credentials.password;
  const managementSource = options.managementSource?.trim();
  const apiSource = managementSource ? ` address=${managementSource}` : " address=\"\"";
  const firewallSource = managementSource ? ` src-address=${managementSource}` : "";
  const serverHost = options.serverHost || "68.210.187.104";
  const serverPort = options.serverPort || 51820;
  const serverPublicKey = options.serverPublicKey || "";
  const vpnIp = options.vpnIp || "10.90.0.2";
  const hotspotInterface = options.hotspotInterface || "bridge";
  const loginTemplateUrl = options.loginTemplateUrl || "https://api.mashuphost.tech/api/v1/hotspot/demo-isp/mikrotik-login-template";

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

# 5. Hotspot RADIUS Configuration
/ip hotspot profile set [find default=yes] use-radius=yes login-by=http-chap,http-pap radius-accounting=yes radius-interim-update=1m

# 6. Walled Garden (M-Pesa & Portal Bypasses)
/ip hotspot walled-garden ip add dst-host=api.mashuphost.tech action=accept
/ip hotspot walled-garden ip add dst-host=mashuphost.tech action=accept
/ip hotspot walled-garden ip add dst-host=*.safaricom.co.ke action=accept
/ip hotspot walled-garden ip add dst-host=*paystack.com action=accept

# 7. Cloud Portal Login Template
/tool fetch url="${loginTemplateUrl}" dst-path=hotspot/login.html

:put "========================================================="
:put "  SUCCESS! Router & Hotspot are 100% ONLINE!             "
:put "========================================================="
`;
}

/** Builds the RADIUS half of setup — separate from buildMikrotikProvisioningScript because it
 *  needs a real, known `router.host` (the FreeRADIUS clients.conf entry is keyed by the
 *  router's actual IP), which only exists after the provisioning callback above has landed. No
 *  local `/ppp secret` entries are created — this app is RADIUS-first (see the SyncTaskAction
 *  doc comment in schema.prisma), so the router only needs to know where to send
 *  Access-Requests, not who's allowed to log in. */
export function buildMikrotikSetupScript(
  router: Router & { host: string },
  nas: RadiusNas,
  radiusHost: string
): MikrotikSetupScript {
  const apiLine = router.useTls
    ? `/ip service set api-ssl disabled=no port=${router.apiPort}`
    : `/ip service set api disabled=no port=${router.apiPort}`;
  const safeName = sanitizeForScript(router.name);

  const mikrotikScript = `# MASHUPKGRID ISP — setup script for router "${safeName}" (${router.host})
# Paste this into the router's terminal (WinBox: New Terminal, or SSH), then run it.

# 1. Enable the API service the ISP platform uses to manage this router.
${apiLine}

# 2. Point PPP authentication at the ISP platform's RADIUS server.
/radius add service=ppp address=${radiusHost} secret=${nas.secret} comment="MASHUPKGRID ISP"
/ppp aaa set use-radius=yes accounting=yes interim-update=5m

# 3. If this router also runs a hotspot, point it at RADIUS too (safe to leave commented out
#    otherwise):
# /radius add service=hotspot address=${radiusHost} secret=${nas.secret} comment="MASHUPKGRID ISP"
# /ip hotspot profile set [find] use-radius=yes

:put "Done — this router now authenticates PPPoE users via MASHUPKGRID ISP."
`;

  const freeradiusClientSnippet = `client ${safeName.toLowerCase().replace(/[^a-z0-9-]+/g, "-")} {
\tipaddr = ${router.host}
\tsecret = ${nas.secret}
\tshortname = ${safeName}
}`;

  return { mikrotikScript, freeradiusClientSnippet };
}

export interface HotspotScriptInput {
  /** The bridge/interface the hotspot server binds to — reuse whatever already carries the
   *  router's WiFi/LAN clients (e.g. "bridge"), not a fresh one, so this coexists with any
   *  existing DHCP server there instead of fighting it. */
  interfaceName: string;
  /** Name of the router's EXISTING IP pool (e.g. "default-dhcp") to reuse for hotspot clients —
   *  deliberately not creating a new pool, since a second pool on the same subnet is how you get
   *  duplicate-IP conflicts with whatever DHCP server already serves this interface. */
  addressPoolName: string;
  /** Where unauthenticated clients get redirected — a page this platform serves that itself
   *  redirects into the router's own local login flow (see the login.html template below). */
  loginTemplateUrl: string;
  /** Everything the client needs walled-garden access to before authenticating: the platform's
   *  own host (to load the login page and call its API) — a bare IP in dev, a real domain once
   *  this is deployed. */
  platformHost: string;
  /** Where this router should send hotspot Access-Requests — the same FreeRADIUS server PPPoE
   *  uses, just a separate `/radius add service=hotspot` client entry, since RouterOS scopes
   *  RADIUS client config per service rather than sharing one entry across service types. */
  radiusHost: string;
  /** The RadiusNas row's shared secret (see getOrCreateNasForRouter) — reused as-is rather than
   *  generating a second one, since FreeRADIUS's clients.conf trusts this router by IP, not by
   *  service, so one secret already covers both PPP and hotspot traffic from it. */
  nasSecret: string;
}

/** Builds the RouterOS script that turns on an actual captive-portal hotspot server — distinct
 *  from the RADIUS `service=hotspot` line in buildMikrotikSetupScript, which only tells the
 *  router *where to check credentials*. Without this, connecting to the router's WiFi is just
 *  normal internet access with no login prompt at all, which is exactly the gap a real hAP lite
 *  test surfaced: RADIUS was wired up correctly, but nothing was actually intercepting
 *  unauthenticated traffic to redirect it anywhere.
 *
 *  Reuses the interface's existing DHCP/IP pool rather than provisioning a parallel one (see
 *  HotspotScriptInput doc comments) — the same thing RouterOS's own `/ip hotspot setup` wizard
 *  does when pointed at an interface that already has DHCP. Overwrites the router's local
 *  hotspot/login.html with a one-line redirect to `loginTemplateUrl`, which RouterOS serves with
 *  its own `$(...)` template variables substituted — those then flow through to the platform's
 *  hosted captive-portal page as query params so it can complete the login handshake back
 *  against the router (see apps/web's hotspot page and the `-esc` variable use there). */
export function buildMikrotikHotspotScript(router: Router, input: HotspotScriptInput): string {
  const profileName = "mkg-hotspot-profile";
  const hotspotName = "mkg-hotspot";
  const safeName = sanitizeForScript(router.name);

  return `# MASHUPKGRID ISP — hotspot captive-portal setup for router "${safeName}"
# Paste this into the router's terminal (WinBox: New Terminal, or SSH), then run it.
# Reuses the "${input.interfaceName}" interface's existing DHCP/IP pool — this does not
# create a second DHCP server or touch your existing LAN/WiFi client leases.

# 1. Walled garden — lets an unauthenticated client reach the platform & payment gateways
#    (M-Pesa STK, Paystack Checkout, Apple Pay, Visa/Mastercard 3DS) before logging in.
/ip hotspot walled-garden ip add dst-address=${input.platformHost} action=accept comment="MASHUPKGRID ISP platform"

# 1b. Paystack & Online Payment Gateway Walled Garden (Bypasses for guest checkout without active internet)
/ip hotspot walled-garden
add dst-host=*paystack.com comment="Paystack Main Portal"
add dst-host=*paystack.co comment="Paystack API & JS Checkout"
add dst-host=*pstk.it comment="Paystack Shortlinks"
add dst-host=*visa.com comment="Visa 3D-Secure Verification"
add dst-host=*mastercard.com comment="Mastercard Identity Check"
add dst-host=*cardinalcommerce.com comment="3DS Banking Verification"
add dst-host=*modirum.com comment="3DS Banking Verification"

/ip hotspot walled-garden ip
add dst-host=*paystack.com action=accept comment="Paystack IP Bypass"
add dst-host=*paystack.co action=accept comment="Paystack IP Bypass"
add dst-host=*pstk.it action=accept comment="Paystack IP Bypass"

# 2. Point hotspot authentication at the platform's RADIUS server (a separate client entry from
#    PPPoE's — RouterOS scopes RADIUS clients per service).
/radius add service=hotspot address=${input.radiusHost} secret=${input.nasSecret} comment="MASHUPKGRID ISP"

# 3. Hotspot profile — RADIUS-backed, so the same voucher/account credentials PPPoE uses work
#    here too. radius-accounting=yes is required or RouterOS never sends ANY accounting packets
#    (not even Start/Stop) — without it, enforceDataCap in radius-server.ts never runs, since it
#    only fires off accounting packets (confirmed live: cap enforcement silently did nothing until
#    this was set). radius-interim-update matters beyond just accounting hygiene too: without it
#    RouterOS only ever sends Start/Stop, so both live traffic reporting and data-cap enforcement
#    (Mikrotik-Total-Limit) would only ever see a session's usage once it's already over.
/ip hotspot profile add name=${profileName} use-radius=yes login-by=http-chap,http-pap radius-accounting=yes radius-interim-update=1m

# 4. The hotspot server itself, bound to "${input.interfaceName}" and reusing its existing
#    "${input.addressPoolName}" IP pool.
/ip hotspot add name=${hotspotName} interface=${input.interfaceName} address-pool=${input.addressPoolName} profile=${profileName} disabled=no

# 5. Replace the router's local login page with a one-line redirect to the platform's own
#    branded captive-portal page — RouterOS fills in $(mac)/$(ip)/$(link-login-only-esc)/
#    $(link-orig-esc) when it serves this file to a connecting client.
/tool fetch url="${input.loginTemplateUrl}" dst-path=hotspot/login.html

:put "Done — connect to this router's WiFi from another device to see the login page."
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

  return `# MASHUPKGRID ISP — remote access (WireGuard) setup, step 2 of 2
# Paste into the router's terminal, run it. This finishes the tunnel — the platform can then
# reach this router at ${input.assignedVpnIp} regardless of its real network location.

/interface wireguard peers remove [find interface=mkg-wg]
/interface wireguard peers add interface=mkg-wg public-key="${serverPubKey}" endpoint-address="${endpointHost}" endpoint-port=${endpointPort} allowed-address=0.0.0.0/0 persistent-keepalive=25s

/ip address remove [find interface=mkg-wg]
/ip address add address=${input.assignedVpnIp}/32 interface=mkg-wg

:put "========================================================="
:put "  SUCCESS! WireGuard tunnel active at ${input.assignedVpnIp} "
:put "========================================================="
`;
}
