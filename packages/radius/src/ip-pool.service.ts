import { prisma, type IPPool, type IPAddress } from "@mashupkgrid/database";
import { ConflictError, NotFoundError, ValidationError } from "@mashupkgrid/shared";
import type { Db } from "./db.js";
import { expandIpv4Cidr } from "./cidr.js";

export interface CreateIpPoolInput {
  tenantId: string;
  routerId?: string | null;
  name: string;
  version: "IPV4" | "IPV6";
  cidr: string;
  gateway?: string | null;
  dnsServers?: string[];
}

/** Creates the pool row and, for IPv4, eagerly materializes every usable host address as an
 *  `IPAddress` row so allocation is a plain row-claim rather than bit arithmetic at assignment
 *  time. IPv6 pools are *not* expanded — a delegated prefix (commonly a /64 or shorter) assigns
 *  as a whole prefix per customer via `Framed-IPv6-Prefix`, not as a set of individual /128s, so
 *  there is nothing useful to pre-populate (project instruction §21, dual-stack). */
export async function createIpPool(db: Db, input: CreateIpPoolInput): Promise<IPPool> {
  const existing = await db.iPPool.findUnique({
    where: { tenantId_name: { tenantId: input.tenantId, name: input.name } },
  });
  if (existing) throw new ConflictError(`An IP pool named "${input.name}" already exists`);

  const addresses = input.version === "IPV4" ? expandIpv4Cidr(input.cidr) : [];

  const pool = await db.iPPool.create({
    data: {
      tenantId: input.tenantId,
      routerId: input.routerId ?? null,
      name: input.name,
      version: input.version,
      cidr: input.cidr,
      gateway: input.gateway ?? null,
      dnsServers: input.dnsServers ?? [],
    },
  });

  if (addresses.length > 0) {
    await db.iPAddress.createMany({
      data: addresses.map((address) => ({ tenantId: input.tenantId, poolId: pool.id, address })),
    });
  }

  return pool;
}

export async function poolUsageSummary(
  tenantId: string,
  poolId: string
): Promise<{ total: number; assigned: number; reserved: number; available: number }> {
  const pool = await prisma.iPPool.findFirst({ where: { id: poolId, tenantId } });
  if (!pool) throw new NotFoundError("IP pool");

  const [total, assigned, reserved] = await Promise.all([
    prisma.iPAddress.count({ where: { poolId } }),
    prisma.iPAddress.count({ where: { poolId, status: "ASSIGNED" } }),
    prisma.iPAddress.count({ where: { poolId, status: "RESERVED" } }),
  ]);
  return { total, assigned, reserved, available: total - assigned - reserved };
}

/** Claims one AVAILABLE address from the pool for a RADIUS user and mirrors it into
 *  `RadReply` as `Framed-IP-Address` so FreeRADIUS hands it out on the next authentication.
 *  A user may hold at most one assigned address at a time (enforced by the unique
 *  `assignedToRadiusUserId` column) — releases the previous one first if any. */
export async function allocateIpAddress(
  tenantId: string,
  poolId: string,
  radiusUserId: string
): Promise<IPAddress> {
  const radiusUser = await prisma.radiusUser.findFirst({ where: { id: radiusUserId, tenantId } });
  if (!radiusUser) throw new NotFoundError("RADIUS user");

  return prisma.$transaction(async (tx) => {
    await releaseIpAddressWithDb(tx, tenantId, radiusUserId);

    const candidate = await tx.iPAddress.findFirst({
      where: { tenantId, poolId, status: "AVAILABLE" },
      orderBy: { address: "asc" },
    });
    if (!candidate) throw new ValidationError("No available addresses remain in this pool");

    const claimed = await tx.iPAddress.update({
      where: { id: candidate.id },
      data: { status: "ASSIGNED", assignedToRadiusUserId: radiusUserId },
    });

    await tx.radReply.deleteMany({
      where: { username: radiusUser.username, attribute: "Framed-IP-Address" },
    });
    await tx.radReply.create({
      data: {
        username: radiusUser.username,
        attribute: "Framed-IP-Address",
        op: "=",
        value: claimed.address,
      },
    });

    return claimed;
  });
}

async function releaseIpAddressWithDb(db: Db, tenantId: string, radiusUserId: string): Promise<void> {
  const current = await db.iPAddress.findFirst({ where: { tenantId, assignedToRadiusUserId: radiusUserId } });
  if (!current) return;

  await db.iPAddress.update({
    where: { id: current.id },
    data: { status: "AVAILABLE", assignedToRadiusUserId: null },
  });

  const radiusUser = await db.radiusUser.findUnique({ where: { id: radiusUserId } });
  if (radiusUser) {
    await db.radReply.deleteMany({
      where: { username: radiusUser.username, attribute: "Framed-IP-Address" },
    });
  }
}

export async function releaseIpAddress(tenantId: string, radiusUserId: string): Promise<void> {
  await prisma.$transaction((tx) => releaseIpAddressWithDb(tx, tenantId, radiusUserId));
}
