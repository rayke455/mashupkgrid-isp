import QRCode from "qrcode";
import { Redis } from "ioredis";
import { prisma, type WhatsappConnection, type WhatsappConnectionStatus } from "@mashupkgrid/database";
import { env } from "@mashupkgrid/config";

/**
 * Shared state for a tenant's WhatsApp link, split across two stores on purpose:
 *
 *  - Postgres (`WhatsappConnection`) holds the durable, tenant-visible facts — is it linked, to
 *    which number, when, and what went wrong last. This is what the dashboard reads.
 *  - Redis holds the pairing QR code, which is short-lived (WhatsApp rotates it every ~20s) and
 *    worthless once scanned. It also crosses a process boundary: the QR is produced by the worker
 *    (which owns the socket) but has to be rendered by the browser, which only talks to the API.
 *
 * Storing a rotating QR in Postgres would mean a write every 20 seconds per pairing tenant for
 * data that is garbage a moment later; a Redis key with a matching TTL expires itself.
 */

const QR_TTL_SECONDS = 60;
/** Longer than the QR's: a phone-number code is typed by hand, not scanned by a camera. */
const PAIRING_CODE_TTL_SECONDS = 180;

const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });
redis.on("error", (err) => console.error("[whatsapp-connection] redis error", err));

/** Redis key segment standing in for the platform line, which has no tenant id. Matches
 *  PLATFORM_SESSION_ID in the worker so both processes address the same session. */
export const PLATFORM_SCOPE = "platform";

/** A null tenantId means the platform-level line throughout this module. */
export type ConnectionScope = string | null;

function scopeKey(tenantId: ConnectionScope): string {
  return tenantId ?? PLATFORM_SCOPE;
}

function qrKey(tenantId: ConnectionScope): string {
  return `wa-qr:${scopeKey(tenantId)}`;
}

function pairingCodeKey(tenantId: ConnectionScope): string {
  return `wa-pair-code:${scopeKey(tenantId)}`;
}

/** Stores the pairing QR as a rendered PNG data URL rather than the raw Baileys string, so the
 *  dashboard can show it with a plain `<img src>` and no client-side QR library. */
export async function publishPairingQr(tenantId: ConnectionScope, rawQr: string): Promise<void> {
  const dataUrl = await QRCode.toDataURL(rawQr, { margin: 1, width: 320 });
  await redis.set(qrKey(tenantId), dataUrl, "EX", QR_TTL_SECONDS);
}

export async function readPairingQr(tenantId: ConnectionScope): Promise<string | null> {
  return redis.get(qrKey(tenantId));
}

export async function clearPairingQr(tenantId: ConnectionScope): Promise<void> {
  await redis.del(qrKey(tenantId), pairingCodeKey(tenantId));
}

/** The 8-character code shown for "link with phone number" pairing. WhatsApp gives it a short
 *  life of its own, so this TTL is generous rather than exact -- an expired code simply fails to
 *  work when typed, and the operator requests another. */
export async function publishPairingCode(tenantId: ConnectionScope, code: string): Promise<void> {
  await redis.set(pairingCodeKey(tenantId), code, "EX", PAIRING_CODE_TTL_SECONDS);
}

export async function readPairingCode(tenantId: ConnectionScope): Promise<string | null> {
  return redis.get(pairingCodeKey(tenantId));
}

export async function setConnectionStatus(
  tenantId: ConnectionScope,
  status: WhatsappConnectionStatus,
  fields: { phoneNumber?: string | null; lastError?: string | null } = {}
): Promise<WhatsappConnection> {
  const data = {
    status,
    ...(fields.phoneNumber !== undefined ? { phoneNumber: fields.phoneNumber } : {}),
    ...(fields.lastError !== undefined ? { lastError: fields.lastError } : {}),
    ...(status === "CONNECTED" ? { lastConnectedAt: new Date(), lastError: null } : {}),
  };
  if (tenantId !== null) {
    return prisma.whatsappConnection.upsert({
      where: { tenantId },
      update: data,
      create: { tenantId, ...data },
    });
  }

  // Prisma's `where` on a unique column cannot match NULL, so the platform row is addressed by
  // id instead. Two concurrent creates would race here, but the partial unique index added in
  // migration 20260830153000 rejects the loser rather than leaving two platform rows behind.
  const existing = await prisma.whatsappConnection.findFirst({ where: { tenantId: null } });
  if (existing) {
    return prisma.whatsappConnection.update({ where: { id: existing.id }, data });
  }
  return prisma.whatsappConnection.create({ data: { tenantId: null, ...data } });
}

export interface WhatsappConnectionStatusView {
  status: WhatsappConnectionStatus;
  phoneNumber: string | null;
  lastConnectedAt: Date | null;
  lastError: string | null;
  /** Present only while pairing — a PNG data URL to render directly. */
  qr: string | null;
  /** Present only while pairing by phone number — the 8-character code to type into WhatsApp.
   *  Mutually exclusive with `qr` in practice: WhatsApp issues one or the other per attempt. */
  pairingCode: string | null;
  /** True when this tenant is NOT connected but the platform line is, which is exactly when
   *  resolveSocket (apps/worker/src/lib/whatsapp-runtime.ts) silently sends this tenant's
   *  customer messages out on the platform's own number.
   *
   *  Surfaced because the tenant otherwise has no way to know it is happening: their status reads
   *  "Not connected", so they reasonably assume WhatsApp is simply unused — while their customers
   *  are receiving vouchers and OTPs from a number that is not theirs, and any reply those
   *  customers send is logged and discarded rather than reaching the tenant's support queue.
   *
   *  Always false for the platform scope itself, which has nothing to fall back to. */
  deliveringOnPlatformLine: boolean;
}

export async function getConnectionStatus(tenantId: ConnectionScope): Promise<WhatsappConnectionStatusView> {
  const [row, qr, pairingCode, platformRow] = await Promise.all([
    tenantId !== null
      ? prisma.whatsappConnection.findUnique({ where: { tenantId } })
      : prisma.whatsappConnection.findFirst({ where: { tenantId: null } }),
    readPairingQr(tenantId),
    readPairingCode(tenantId),
    // Only needed to answer "is my traffic going out on someone else's line right now"; skipped
    // for the platform scope, which is that line.
    tenantId !== null
      ? prisma.whatsappConnection.findFirst({ where: { tenantId: null }, select: { status: true } })
      : Promise.resolve(null),
  ]);

  const status = row?.status ?? "DISCONNECTED";

  return {
    status,
    phoneNumber: row?.phoneNumber ?? null,
    lastConnectedAt: row?.lastConnectedAt ?? null,
    lastError: row?.lastError ?? null,
    qr,
    pairingCode,
    deliveringOnPlatformLine: status !== "CONNECTED" && platformRow?.status === "CONNECTED",
  };
}

/** Tenants the worker should bring back up on boot: anything that was linked before the restart.
 *  LOGGED_OUT is excluded deliberately — those credentials are dead and retrying them just
 *  produces a QR nobody is watching for. */
export async function listTenantsToRestore(): Promise<string[]> {
  const rows = await prisma.whatsappConnection.findMany({
    // tenantId: not null excludes the platform row, which the worker starts separately from
    // ENABLE_WHATSAPP_BOT rather than restoring like a tenant's.
    where: { status: { in: ["CONNECTED", "CONNECTING"] }, tenantId: { not: null } },
    select: { tenantId: true },
  });
  return rows.flatMap((r) => (r.tenantId === null ? [] : [r.tenantId]));
}
