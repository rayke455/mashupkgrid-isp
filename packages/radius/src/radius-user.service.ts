import { prisma, type RadiusUser } from "@mashupkgrid/database";
import { ConflictError, NotFoundError, encryptAtRest, decryptAtRest } from "@mashupkgrid/shared";
import { env } from "@mashupkgrid/config";
import type { Db } from "./db.js";
import { buildRadiusUsername, generateRadiusPassword } from "./username.js";
import { queueSyncTask } from "./sync.service.js";

export interface ProvisionRadiusUserInput {
  tenantId: string;
  tenantSlug: string;
  customerId: string;
  customerServiceId: string;
  customerNumber: string;
  downloadKbps: number;
  uploadKbps: number;
  connectionType?: "PPPOE" | "HOTSPOT";
}

export interface ProvisionRadiusUserResult {
  radiusUser: RadiusUser;
  /** The raw password, for one-time display to staff — never persisted or logged in plaintext. */
  plaintextPassword: string;
}

function mikrotikRateLimit(downloadKbps: number, uploadKbps: number): string {
  return `${uploadKbps}k/${downloadKbps}k`;
}

/** Writes the RadiusUser row plus its mirrored RadCheck (Cleartext-Password) and RadReply
 *  (Mikrotik-Rate-Limit) rows in one transaction — the app-level record and the AAA-visible
 *  rows must never drift apart (docs/architecture/06). */
export async function provisionRadiusUser(
  db: Db,
  input: ProvisionRadiusUserInput
): Promise<ProvisionRadiusUserResult> {
  const username = buildRadiusUsername(input.tenantSlug, input.customerNumber);
  const plaintextPassword = generateRadiusPassword();

  const existing = await db.radiusUser.findUnique({ where: { username } });
  if (existing) {
    throw new ConflictError(`A RADIUS user for "${username}" already exists`);
  }

  const radiusUser = await db.radiusUser.create({
    data: {
      tenantId: input.tenantId,
      customerId: input.customerId,
      customerServiceId: input.customerServiceId,
      username,
      passwordEncrypted: encryptAtRest(plaintextPassword, env.ENCRYPTION_KEY),
      status: "ACTIVE",
      connectionType: input.connectionType ?? "PPPOE",
      downloadKbps: input.downloadKbps,
      uploadKbps: input.uploadKbps,
    },
  });

  await db.radCheck.create({
    data: { username, attribute: "Cleartext-Password", op: ":=", value: plaintextPassword },
  });
  await db.radReply.create({
    data: {
      username,
      attribute: "Mikrotik-Rate-Limit",
      op: "=",
      value: mikrotikRateLimit(input.downloadKbps, input.uploadKbps),
    },
  });

  return { radiusUser, plaintextPassword };
}

export async function getRadiusUserByCustomerServiceOrThrow(
  tenantId: string,
  customerServiceId: string
): Promise<RadiusUser> {
  const radiusUser = await prisma.radiusUser.findFirst({ where: { tenantId, customerServiceId } });
  if (!radiusUser) throw new NotFoundError("RADIUS user");
  return radiusUser;
}

/** Suspension keeps the account and its accounting history in place — it adds an
 *  `Auth-Type := Reject` radcheck row rather than deleting `Cleartext-Password`, the standard
 *  FreeRADIUS idiom for "exists but may not authenticate" (see the schema's RadCheck comment).
 *  Also queues (and best-effort immediately applies) a router-side disable so an already-active
 *  session gets kicked, not just blocked from re-authenticating. */
export async function suspendRadiusUser(tenantId: string, customerServiceId: string): Promise<RadiusUser> {
  const radiusUser = await getRadiusUserByCustomerServiceOrThrow(tenantId, customerServiceId);
  if (radiusUser.status === "SUSPENDED") return radiusUser;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.radCheck.deleteMany({ where: { username: radiusUser.username, attribute: "Auth-Type" } });
    await tx.radCheck.create({
      data: { username: radiusUser.username, attribute: "Auth-Type", op: ":=", value: "Reject" },
    });
    return tx.radiusUser.update({ where: { id: radiusUser.id }, data: { status: "SUSPENDED" } });
  });

  // A RADIUS reject only blocks the *next* authentication — kick whatever session is already
  // active right now, on every router the tenant has (see sync.service.ts's doc comment).
  await queueSyncTask(tenantId, radiusUser.id, "DISCONNECT_USER");
  return updated;
}

export async function reactivateRadiusUser(tenantId: string, customerServiceId: string): Promise<RadiusUser> {
  const radiusUser = await getRadiusUserByCustomerServiceOrThrow(tenantId, customerServiceId);
  if (radiusUser.status === "ACTIVE") return radiusUser;

  // No router-side action needed: removing the Auth-Type reject row is sufficient — the
  // customer's next PPPoE connection attempt succeeds via RADIUS with no router involvement.
  return prisma.$transaction(async (tx) => {
    await tx.radCheck.deleteMany({ where: { username: radiusUser.username, attribute: "Auth-Type" } });
    return tx.radiusUser.update({ where: { id: radiusUser.id }, data: { status: "ACTIVE" } });
  });
}

export async function getDecryptedRadiusPassword(radiusUser: RadiusUser): Promise<string> {
  return decryptAtRest(radiusUser.passwordEncrypted, env.ENCRYPTION_KEY);
}
