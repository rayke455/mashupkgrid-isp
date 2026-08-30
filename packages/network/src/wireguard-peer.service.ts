import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ValidationError, ConflictError } from "@mashupkgrid/shared";

const execFileAsync = promisify(execFile);

/**
 * Platform-side WireGuard peer management — the other half of a router's remote-access tunnel
 * (see the RouterOS-side scripts in packages/radius/src/setup-script.ts, buildMikrotikVpn*).
 * This shells out to the real `wg` command-line tool rather than reimplementing the WireGuard
 * protocol, the same way a production deployment would manage peers on its `wg0` interface.
 *
 * Requires: a running WireGuard interface on the host (created by `wg-quick` or equivalent,
 * outside this app's control — provisioning a VPN server itself is real Linux system
 * administration, not something an ISP billing platform should own) and the `wireguard-tools`
 * package installed (`wg` on PATH). Neither is available in every environment this code might
 * run in (notably: this project's own Windows dev setup, which has no admin rights to install a
 * WireGuard kernel driver) — every function here throws a clear, typed error rather than
 * crashing when that's the case, so the rest of the app can degrade to "VPN unavailable on this
 * deployment" instead of a raw 500.
 */

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".");
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)) {
    throw new ValidationError(`Not a valid IPv4 address: "${ip}"`);
  }
  return parts.reduce((acc, p) => (acc << 8) + Number(p), 0) >>> 0;
}

function intToIpv4(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

/** Finds the next unassigned IPv4 address in `subnetCidr`, skipping the network address (.0)
 *  and .1 (reserved for the WireGuard server itself). Doesn't materialize the whole range —
 *  matters for a pool as large as the default /16 (65k+ addresses). */
export function allocateNextVpnIp(subnetCidr: string, usedIps: string[]): string {
  const match = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/.exec(subnetCidr.trim());
  if (!match || !match[1] || !match[2]) {
    throw new ValidationError(`Not a valid IPv4 CIDR block: "${subnetCidr}"`);
  }
  const prefixLength = Number(match[2]);
  const base = ipv4ToInt(match[1]);
  const hostBits = 32 - prefixLength;
  const size = hostBits >= 32 ? 0xffffffff : (1 << hostBits) >>> 0;
  const network = hostBits >= 32 ? 0 : (base & ~(size - 1)) >>> 0;
  const usable = size - 2; // exclude network + broadcast

  const used = new Set(usedIps);
  // Offset 1 is reserved for the server itself — candidates start at offset 2.
  for (let offset = 2; offset <= usable; offset++) {
    const candidate = intToIpv4((network + offset) >>> 0);
    if (!used.has(candidate)) return candidate;
  }
  throw new ConflictError(`WireGuard address pool "${subnetCidr}" is exhausted`);
}

function wireguardUnavailableError(err: unknown): ConflictError {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  if (code === "ENOENT") {
    return new ConflictError(
      "WireGuard remote access isn't available on this server — the `wg` command-line tool isn't installed."
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  return new ConflictError(`Failed to update the WireGuard server's peer list: ${message}`);
}

/** Adds or updates a peer on the platform's WireGuard interface — idempotent, `wg set` upserts
 *  by public key. */
export async function registerWireguardPeer(
  wgInterface: string,
  publicKey: string,
  vpnIp: string
): Promise<void> {
  try {
    await execFileAsync("wg", ["set", wgInterface, "peer", publicKey, "allowed-ips", `${vpnIp}/32`]);
  } catch (err) {
    throw wireguardUnavailableError(err);
  }
}

/** Removes a peer — called when a VPN-linked router is deleted, so its slot in the address pool
 *  and the server's peer table don't linger forever. Best-effort: a missing `wg` binary or an
 *  already-absent peer shouldn't block the router deletion it's cleaning up after. */
export async function removeWireguardPeer(wgInterface: string, publicKey: string): Promise<void> {
  try {
    await execFileAsync("wg", ["set", wgInterface, "peer", publicKey, "remove"]);
  } catch {
    // Best-effort — see doc comment.
  }
}
