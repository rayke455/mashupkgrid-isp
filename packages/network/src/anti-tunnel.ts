/**
 * "Block tunnelling apps": stops phones that haven't logged in to the hotspot (hotspot=!auth)
 * from getting online through a tunnel before paying. Paying customers are never touched.
 *
 * What it does, honestly:
 *  - DNS tunnels (SlowDNS, dnstt, iodine): the hotspot already sends every client's DNS to its
 *    own resolver on port 64872 and accepts it in hs-input. These rules sit in pre-hs-input, the
 *    chain RouterOS runs just before that, and drop oversized queries and cap how many a
 *    logged-out phone may send. Tunnels need long names and many queries; a phone opening the
 *    sign-in page needs a few short ones. (Rules on port 53 in the input chain never see this
 *    traffic, and redirecting DNS alone does nothing: the resolver forwards tunnel queries on.)
 *  - The forward-chain rules only ever see what the hotspot lets a logged-out phone reach, i.e.
 *    walled-garden hosts, which is exactly the path tunnels abuse.
 *  - No UDP, ICMP or common VPN/proxy ports before login.
 *  - Plain-text tunnel handshakes (websocket upgrade, SSH banner, HTTP CONNECT). Tunnels wrapped
 *    in TLS, as HA Tunnel and most HTTP Injector configs are, can't be seen this way; the
 *    per-connection data cap and connection limit below are what bound those.
 */

export const ANTI_TUNNEL_TAG = "MASHUPKGRID ANTI-TUNNEL";

export interface FirewallRule {
  menu: "filter" | "nat";
  /** RouterOS API attribute words, without the comment. */
  words: string[];
  /** What the rule is for, in the words an operator would use. */
  purpose: string;
}

// from-client matters: "!auth" alone is true for every packet that is not from a logged-in hotspot
// client, including replies from the internet to paying customers and all PPPoE traffic.
const notLoggedIn = "=hotspot=from-client,!auth";
/** Where the hotspot sends its clients' DNS (fixed in RouterOS). */
const HOTSPOT_DNS_PORT = 64872;

/** In order: within a chain, an accept must come before the matching drop. */
export function antiTunnelRules(): FirewallRule[] {
  return [
    { menu: "filter", purpose: "drop oversized DNS queries (tunnel data)", words: ["=chain=pre-hs-input", "=protocol=udp", `=dst-port=${HOTSPOT_DNS_PORT}`, notLoggedIn, "=packet-size=181-65535", "=action=drop"] },
    { menu: "filter", purpose: "allow normal DNS", words: ["=chain=pre-hs-input", "=protocol=udp", `=dst-port=${HOTSPOT_DNS_PORT}`, notLoggedIn, "=dst-limit=20,60,src-address/1m", "=action=accept"] },
    { menu: "filter", purpose: "drop DNS floods", words: ["=chain=pre-hs-input", "=protocol=udp", `=dst-port=${HOTSPOT_DNS_PORT}`, notLoggedIn, "=action=drop"] },
    { menu: "filter", purpose: "allow occasional DNS over TCP", words: ["=chain=pre-hs-input", "=protocol=tcp", `=dst-port=${HOTSPOT_DNS_PORT}`, notLoggedIn, "=connection-state=new", "=dst-limit=5,15,src-address/1m", "=action=accept"] },
    { menu: "filter", purpose: "drop DNS-over-TCP floods", words: ["=chain=pre-hs-input", "=protocol=tcp", `=dst-port=${HOTSPOT_DNS_PORT}`, notLoggedIn, "=connection-state=new", "=action=drop"] },

    { menu: "filter", purpose: "no UDP before login (VPNs, QUIC, outside DNS)", words: ["=chain=forward", "=protocol=udp", notLoggedIn, "=action=drop"] },
    { menu: "filter", purpose: "no ping tunnels", words: ["=chain=forward", "=protocol=icmp", notLoggedIn, "=action=drop"] },
    { menu: "filter", purpose: "no VPN or proxy ports", words: ["=chain=forward", "=protocol=tcp", "=dst-port=22,1194,1723,3128,8080,8888,9000-65535", notLoggedIn, "=action=drop"] },
    { menu: "filter", purpose: "no websocket tunnels over plain HTTP", words: ["=chain=forward", "=protocol=tcp", "=content=Upgrade: websocket", notLoggedIn, "=action=drop"] },
    { menu: "filter", purpose: "no SSH tunnels", words: ["=chain=forward", "=protocol=tcp", "=content=SSH-2.0", notLoggedIn, "=action=drop"] },
    { menu: "filter", purpose: "no HTTP proxy tunnels", words: ["=chain=forward", "=protocol=tcp", "=content=CONNECT ", notLoggedIn, "=action=drop"] },
    { menu: "filter", purpose: "cap each connection at 3 MB before login", words: ["=chain=forward", "=protocol=tcp", "=connection-bytes=3000000-0", notLoggedIn, "=action=drop"] },
    // Generous on purpose: the sign-in page and payment pages open a burst of connections, and
    // this must never stop someone paying. It only stops phones opening dozens of tunnels.
    { menu: "filter", purpose: "limit new connections per phone", words: ["=chain=forward", "=protocol=tcp", "=connection-state=new", "=connection-limit=40,32", notLoggedIn, "=action=drop"] },
  ];
}

/** One API word ("=content=Upgrade: websocket") as RouterOS script (content="Upgrade: websocket"). */
function toScriptArg(word: string): string {
  const [key, ...rest] = word.slice(1).split("=");
  const value = rest.join("=");
  return /^[A-Za-z0-9_.,:/!*-]+$/.test(value) ? `${key}=${value}` : `${key}="${value.replace(/(["\\$])/g, "\\$1")}"`;
}

/** Name of the script variable the router sets when the change has finished ("ok" or "failed"). */
export const ANTI_TUNNEL_RESULT_VAR = "mkgAntiTunnel";

/**
 * The whole change as one RouterOS script, run on the router in the background. On a hAP lite
 * every rule is a flash write, and adding them one API call at a time outlasts the API timeout.
 * All or nothing: if any line fails, everything this feature added is removed again, so a
 * half-applied set can never drop logged-out phones' DNS without the rule that lets normal
 * lookups through.
 */
export function buildAntiTunnelScript(enabled: boolean): string {
  const cleanup = [
    `:do {/ip firewall filter remove [find where comment~"ANTI-VPN|ANTI-TUNNEL"]} on-error={}`,
    `:do {/ip firewall nat remove [find where comment~"ANTI-VPN|ANTI-TUNNEL"]} on-error={}`,
  ];
  const lines = [`:global ${ANTI_TUNNEL_RESULT_VAR} "running"`, ...cleanup];
  if (!enabled) {
    lines.push(`:set ${ANTI_TUNNEL_RESULT_VAR} "ok"`);
    return lines.join("\n");
  }
  // Each rule goes straight in ahead of the router's own first rule, which keeps this order (an
  // accept stays before its drop). Adding then moving would double the firewall rewrites, and on a
  // hAP lite each one takes seconds.
  const adds = antiTunnelRules().map((r) => {
    const add = `/ip firewall ${r.menu} add ${r.words.map(toScriptArg).join(" ")} comment="${ANTI_TUNNEL_TAG}"`;
    const first = r.menu === "filter" ? "$firstFilter" : "$firstNat";
    return `:if ([:len ${first}] > 0) do={${add} place-before=${first}} else={${add}}`;
  });
  lines.push(
    `:local firstFilter [:pick [/ip firewall filter find where !dynamic] 0]`,
    `:local firstNat [:pick [/ip firewall nat find where !dynamic] 0]`,
    `:do {`,
    ...adds.map((a) => `  ${a}`),
    `  :set ${ANTI_TUNNEL_RESULT_VAR} "ok"`,
    `} on-error={`,
    ...cleanup.map((c) => `  ${c}`),
    `  :set ${ANTI_TUNNEL_RESULT_VAR} "failed"`,
    `  :log warning "MASHUPKGRID tunnel blocking could not be applied; nothing was changed"`,
    `}`
  );
  return lines.join("\n");
}

/** Comments that mark this feature's rules, including the older "Anti-VPN Shield" ones. */
export function isAntiTunnelComment(comment: string | undefined): boolean {
  const c = (comment ?? "").toLowerCase();
  return c.includes("anti-tunnel") || c.includes("anti-vpn");
}
