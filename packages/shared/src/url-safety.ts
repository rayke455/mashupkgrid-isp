import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ValidationError } from "./errors.js";

/**
 * SSRF guard for any URL a tenant supplies that the platform itself will later make an outbound
 * request to (currently: webhook endpoints — apps/api/src/routes/developer.ts at registration,
 * apps/worker/src/jobs/deliver-webhook.ts before every delivery). Without this, a tenant could
 * register `http://169.254.169.254/...` (cloud metadata), `http://127.0.0.1:...`, or an internal
 * `10.x`/`172.16.x`/`192.168.x` address, and the platform's own server would make that request on
 * their behalf — reachable from the public internet with no direct network access of their own.
 *
 * Re-run at delivery time as well as registration time: a hostname that resolved to a public IP
 * when first validated could be re-pointed at a private one later (DNS rebinding). This is a
 * resolve-then-check mitigation, not a full pinned-connection defense (the actual TCP connection
 * still does its own DNS lookup, so a rebind between this check and that connection is a narrow
 * remaining window) — reasonable for a webhook feature, not a substitute for network-level
 * egress controls if that narrow gap ever needs closing further.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ValidationError("Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ValidationError("URL must use http or https");
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new ValidationError("URL must not point at a local/internal address");
  }

  // If the hostname is itself an IP literal, check it directly; otherwise resolve it and check
  // every address returned — a hostname can have multiple A/AAAA records, and only one needs to
  // be private for this to be exploitable.
  const candidateIps: string[] = [];
  if (isIP(hostname)) {
    candidateIps.push(hostname);
  } else {
    let records: { address: string }[];
    try {
      records = await lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new ValidationError("Could not resolve this URL's hostname");
    }
    candidateIps.push(...records.map((r) => r.address));
  }

  for (const ip of candidateIps) {
    if (isPrivateOrReservedIp(ip)) {
      throw new ValidationError("URL must not point at a local/internal/reserved address");
    }
  }
}

function isPrivateOrReservedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true; // Not a recognizable IP at all — fail closed.
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const a = parts[0]!;
  const b = parts[1]!;

  if (a === 0) return true; // "this network"
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT, RFC6598
  if (a === 169 && b === 254) return true; // link-local, incl. 169.254.169.254 cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 0 && parts[2] === 0) return true; // IETF protocol assignments
  if (a === 192 && b === 0 && parts[2] === 2) return true; // TEST-NET-1
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && parts[2] === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && parts[2] === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast (224-239) + reserved (240-255)

  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  if (normalized === "::1") return true; // loopback
  if (normalized === "::") return true; // unspecified

  // IPv4-mapped (::ffff:a.b.c.d) — validate the embedded IPv4 address instead.
  const mapped = normalized.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateIPv4(mapped[1]!);

  if (normalized.startsWith("fe8") || normalized.startsWith("fe9")) return true; // link-local fe80::/10
  if (normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local fc00::/7
  if (normalized.startsWith("ff")) return true; // multicast

  return false;
}
