import { prisma } from "@mashupkgrid/database";

/**
 * Remembers which phone (MAC address) used which voucher, so a customer who has paid is logged
 * straight back in when their phone reconnects, without the portal or their code.
 *
 * The router tries "login by MAC" first for every device (see the hotspot profile in
 * setup-script.ts): it sends an Access-Request whose User-Name is the MAC. If that MAC last logged
 * in with a voucher that still has time and data left, the RADIUS server accepts it with what is
 * LEFT of that voucher. Anything else is rejected and the phone sees the sign-in page as before.
 *
 * Usage: every new session's byte counters start at zero, so each device keeps the voucher's usage
 * at the moment its session began (the baseline). The voucher's usage is baseline + session bytes;
 * without this, a reconnect would wipe the usage already counted and hand out data twice.
 */

/** "aa-bb-cc-dd-ee-ff", "AABBCCDDEEFF", "aa:bb:…" → "AA:BB:CC:DD:EE:FF"; anything else → null. */
export function normalizeMac(value: string | undefined | null): string | null {
  if (!value) return null;
  const hex = value.trim().replace(/[:.\-\s]/g, "");
  if (!/^[0-9a-fA-F]{12}$/.test(hex)) return null;
  return hex.toUpperCase().match(/.{2}/g)!.join(":");
}

/** Records that this phone started a session on this voucher, and the usage it started from. */
export async function rememberDevice(tenantId: string, macAddress: string | undefined | null, voucherCode: string): Promise<void> {
  const mac = normalizeMac(macAddress);
  if (!mac) return;
  // Only real hotspot vouchers: a PPPoE or account username must never become a MAC login.
  const voucher = await prisma.hotspotVoucher.findUnique({
    where: { tenantId_code: { tenantId, code: voucherCode } },
    select: { bytesIn: true, bytesOut: true },
  });
  if (!voucher) return;
  const baseline = { baselineBytesIn: voucher.bytesIn ?? 0n, baselineBytesOut: voucher.bytesOut ?? 0n };
  await prisma.hotspotDevice.upsert({
    where: { tenantId_macAddress: { tenantId, macAddress: mac } },
    create: { tenantId, macAddress: mac, voucherCode, ...baseline },
    update: { voucherCode, ...baseline, lastSeenAt: new Date() },
  });
}

export interface MacLogin {
  voucherCode: string;
  /** Seconds left on the voucher; null for a voucher with no time limit. */
  remainingSeconds: number | null;
  /** Bytes left on the voucher; null for unlimited data. */
  remainingBytes: number | null;
}

export interface MacLoginCheck extends MacLogin {
  deviceId: string;
  hotspotPackageId: string | null;
  usedBytesIn: bigint;
  usedBytesOut: bigint;
}

/** Whether a returning phone may be logged back in, and with what, WITHOUT changing anything.
 *  The portal's "Reconnect" button asks this before offering itself. */
export async function checkMacLogin(tenantId: string, macAddress: string, now = new Date()): Promise<MacLoginCheck | null> {
  const mac = normalizeMac(macAddress);
  if (!mac) return null;
  const device = await prisma.hotspotDevice.findUnique({ where: { tenantId_macAddress: { tenantId, macAddress: mac } } });
  if (!device) return null;

  const voucher = await prisma.hotspotVoucher.findUnique({ where: { tenantId_code: { tenantId, code: device.voucherCode } } });
  if (!voucher || voucher.status !== "ACTIVE") return null;
  // Deleted or disabled on the RADIUS side: the code itself would no longer log in either.
  const password = await prisma.radCheck.findFirst({ where: { username: voucher.code, attribute: "Cleartext-Password" }, select: { id: true } });
  if (!password) return null;

  let remainingSeconds: number | null = null;
  if (voucher.expiresAt) {
    remainingSeconds = Math.floor((voucher.expiresAt.getTime() - now.getTime()) / 1000);
    if (remainingSeconds < 60) return null; // expired, or not worth a session
  }

  const usedBytesIn = voucher.bytesIn ?? 0n;
  const usedBytesOut = voucher.bytesOut ?? 0n;
  let remainingBytes: number | null = null;
  if (voucher.dataCapMb) {
    remainingBytes = voucher.dataCapMb * 1024 * 1024 - Number(usedBytesIn + usedBytesOut);
    if (remainingBytes <= 0) return null;
  }
  return {
    deviceId: device.id,
    voucherCode: voucher.code,
    hotspotPackageId: voucher.hotspotPackageId,
    remainingSeconds,
    remainingBytes,
    usedBytesIn,
    usedBytesOut,
  };
}

/** The voucher a returning phone is logged back in with (called by the RADIUS server as it
 *  accepts the phone), or null: the sign-in page as usual. Records where this session's usage
 *  starts from. */
export async function findMacLogin(tenantId: string, macAddress: string, now = new Date()): Promise<MacLogin | null> {
  const check = await checkMacLogin(tenantId, macAddress, now);
  if (!check) return null;
  await prisma.hotspotDevice.update({
    where: { id: check.deviceId },
    data: { lastSeenAt: now, baselineBytesIn: check.usedBytesIn, baselineBytesOut: check.usedBytesOut },
  });
  return { voucherCode: check.voucherCode, remainingSeconds: check.remainingSeconds, remainingBytes: check.remainingBytes };
}

/** Turns one session's accounting into the voucher it belongs to and that voucher's total usage.
 *  A MAC login's session runs under the MAC; a code login's under the code. */
export async function voucherUsageForSession(
  tenantId: string,
  username: string,
  callingStationId: string | undefined,
  sessionBytesIn: number,
  sessionBytesOut: number
): Promise<{ voucherCode: string; bytesIn: number; bytesOut: number }> {
  const usernameMac = normalizeMac(username);
  const mac = usernameMac ?? normalizeMac(callingStationId);
  const device = mac
    ? await prisma.hotspotDevice.findUnique({ where: { tenantId_macAddress: { tenantId, macAddress: mac } } })
    : null;
  const voucherCode = usernameMac ? device?.voucherCode ?? username : username;
  if (!device || device.voucherCode !== voucherCode) return { voucherCode, bytesIn: sessionBytesIn, bytesOut: sessionBytesOut };
  return {
    voucherCode,
    bytesIn: Number(device.baselineBytesIn) + sessionBytesIn,
    bytesOut: Number(device.baselineBytesOut) + sessionBytesOut,
  };
}

/** Learns phones that are online right now from the router's active hotspot list, so customers
 *  who logged in before this feature (or whose login the server missed) get reconnected too.
 *  Only adds phones it doesn't know yet: rewriting a known phone mid-session would disturb the
 *  usage baseline its current session is counted against. */
export async function rememberActiveDevices(
  tenantId: string,
  sessions: { username: string; callerId?: string }[]
): Promise<number> {
  let added = 0;
  for (const session of sessions) {
    const mac = normalizeMac(session.callerId);
    // A MAC login already runs under the MAC; its phone is known by definition.
    if (!mac || normalizeMac(session.username)) continue;
    const known = await prisma.hotspotDevice.findUnique({ where: { tenantId_macAddress: { tenantId, macAddress: mac } }, select: { id: true } });
    if (known) continue;
    const voucher = await prisma.hotspotVoucher.findUnique({ where: { tenantId_code: { tenantId, code: session.username } }, select: { id: true } });
    if (!voucher) continue; // PPPoE and account logins are never MAC logins
    // Baseline 0: the usage recorded so far came from this same session's counters.
    await prisma.hotspotDevice.create({ data: { tenantId, macAddress: mac, voucherCode: session.username } }).catch(() => undefined);
    added += 1;
  }
  return added;
}

/** Every username a voucher's sessions may run under: its code, and the MACs logged in with it. */
export async function sessionNamesForVoucher(tenantId: string, voucherCode: string): Promise<string[]> {
  const devices = await prisma.hotspotDevice.findMany({ where: { tenantId, voucherCode }, select: { macAddress: true } });
  return [voucherCode, ...devices.map((d) => d.macAddress)];
}
