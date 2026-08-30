import { ValidationError } from "@mashupkgrid/shared";

/** Cap on how many individual /32 addresses an IPv4 pool expands into — protects against
 *  someone typing "10.0.0.0/8" and generating 16 million rows by accident. IPv6 pools are never
 *  expanded (see ip-pool.service.ts). */
const MAX_IPV4_POOL_SIZE = 4096;

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

/** Expands an IPv4 CIDR block into its usable host addresses (network and broadcast addresses
 *  excluded, matching how a router's DHCP/PPP pool would treat the block). */
export function expandIpv4Cidr(cidr: string): string[] {
  const match = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/.exec(cidr.trim());
  if (!match || !match[1] || !match[2]) {
    throw new ValidationError(`Not a valid IPv4 CIDR block: "${cidr}"`);
  }
  const prefixLength = Number(match[2]);
  if (prefixLength < 0 || prefixLength > 32) {
    throw new ValidationError(`Not a valid IPv4 prefix length: "${cidr}"`);
  }

  const base = ipv4ToInt(match[1]);
  const hostBits = 32 - prefixLength;
  const size = hostBits >= 32 ? 0xffffffff : (1 << hostBits) >>> 0;
  const network = hostBits >= 32 ? 0 : (base & ~(size - 1)) >>> 0;

  if (prefixLength >= 31) {
    return [intToIpv4(network)];
  }

  const usableCount = size - 2;
  if (usableCount > MAX_IPV4_POOL_SIZE) {
    throw new ValidationError(
      `CIDR block "${cidr}" would expand to ${usableCount} addresses, over the ${MAX_IPV4_POOL_SIZE} pool limit`
    );
  }

  const addresses: string[] = [];
  for (let i = 1; i <= usableCount; i++) {
    addresses.push(intToIpv4((network + i) >>> 0));
  }
  return addresses;
}
