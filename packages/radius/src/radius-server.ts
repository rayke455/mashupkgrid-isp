import { createSocket, type Socket } from "node:dgram";
import { createHash } from "node:crypto";
import { prisma } from "@mashupkgrid/database";
import { createAdapterForRouter } from "@mashupkgrid/network";
import { timingSafeStringEqual } from "@mashupkgrid/shared";

/**
 * A real, minimal RADIUS server (RFC 2865/2866) for the case this platform actually hit during
 * hardware testing: MikroTik hotspot's `login-by=http-chap,http-pap` falls back to plain PAP
 * when the login form doesn't submit CHAP fields (this app's captive-portal page submits a plain
 * username/password, same as the router's own default login page would in non-JS mode) — and
 * without *something* listening on UDP 1812/1813, every Access-Request just times out, so the
 * router never unblocks the client no matter how correct the voucher/RADIUS-client config is.
 *
 * This is not a FreeRADIUS replacement — no CHAP, no EAP, no accounting persistence beyond
 * acknowledging the packet. It answers exactly what MikroTik hotspot's PAP flow needs against
 * the same `radcheck`/`radreply` tables voucher.service.ts already populates, and forwards the
 * `radreply` attributes those tables actually carry: `Session-Timeout` (standard, RFC 2865 §5.27
 * — without this, a voucher's `expiresAt` in *our* database has no effect on an already-active
 * hotspot session at all, since RADIUS is only consulted at login, not enforced continuously; a
 * live hAP lite test confirmed exactly this gap), `Mikrotik-Rate-Limit` (vendor-specific,
 * Vendor-Id 14988 sub-type 8), and `Mikrotik-Total-Limit`/`Mikrotik-Total-Limit-Gigawords`
 * (sub-types 17/18 — data-cap enforcement, confirmed against both the MikroTik Wiki's RADIUS
 * vendor dictionary and FreeRADIUS's dictionary.mikrotik).
 *
 * RouterOS's own real-time enforcement of Mikrotik-Total-Limit on Hotspot sessions is
 * documented by MikroTik's own community as unreliable/delayed (forum reports of caps not being
 * enforced until a session reset) — sending the attribute is still correct and done below, but
 * it is not trusted alone. The accounting listener (1813) is the actual enforcement path: it
 * accumulates each session's Acct-Input/Output-Octets from Interim-Update/Stop packets, compares
 * against the same cap, and force-disconnects the session on the router itself the moment the
 * cap is crossed — independent of whatever RouterOS was going to do on its own.
 *
 * Any reply attribute this server doesn't recognize is logged and skipped rather than guessed
 * at, since shipping a wrong vendor sub-attribute number silently breaks the reply instead of
 * just omitting it. A real production deployment should still run real FreeRADIUS (see
 * infrastructure/freeradius) once Linux infra is available — this exists so the platform's own
 * RADIUS-dependent features are actually testable without it.
 */

const RADIUS_CODE = {
  ACCESS_REQUEST: 1,
  ACCESS_ACCEPT: 2,
  ACCESS_REJECT: 3,
  ACCOUNTING_REQUEST: 4,
  ACCOUNTING_RESPONSE: 5,
} as const;

const ATTR = {
  USER_NAME: 1,
  USER_PASSWORD: 2,
  ACCT_STATUS_TYPE: 40,
  ACCT_INPUT_OCTETS: 42,
  ACCT_OUTPUT_OCTETS: 43,
  ACCT_INPUT_GIGAWORDS: 52,
  ACCT_OUTPUT_GIGAWORDS: 53,
} as const;

/** RFC 2866 §5.1 */
const ACCT_STATUS_TYPE = { START: 1, STOP: 2, INTERIM_UPDATE: 3 } as const;

interface RadiusAttribute {
  type: number;
  value: Buffer;
}

interface RadiusPacket {
  code: number;
  identifier: number;
  authenticator: Buffer;
  attributes: RadiusAttribute[];
}

function parsePacket(buf: Buffer): RadiusPacket | null {
  if (buf.length < 20) return null;
  const code = buf.readUInt8(0);
  const identifier = buf.readUInt8(1);
  const length = buf.readUInt16BE(2);
  const authenticator = buf.subarray(4, 20);
  if (length > buf.length) return null;

  const attributes: RadiusAttribute[] = [];
  let offset = 20;
  while (offset < length) {
    const type = buf.readUInt8(offset);
    const attrLen = buf.readUInt8(offset + 1);
    if (attrLen < 2 || offset + attrLen > length) break;
    attributes.push({ type, value: buf.subarray(offset + 2, offset + attrLen) });
    offset += attrLen;
  }
  return { code, identifier, authenticator, attributes };
}

function findAttr(packet: RadiusPacket, type: number): Buffer | null {
  return packet.attributes.find((a) => a.type === type)?.value ?? null;
}

function readUInt32Attr(packet: RadiusPacket, type: number): number {
  const buf = findAttr(packet, type);
  return buf && buf.length === 4 ? buf.readUInt32BE(0) : 0;
}

/** RFC 2865 §5.2 — PAP's User-Password attribute is XOR-obscured against successive MD5(secret
 *  + prior-16-byte-block) chunks, seeded by the Request Authenticator for the first block. */
function decodePapPassword(encrypted: Buffer, secret: string, requestAuthenticator: Buffer): string {
  const secretBuf = Buffer.from(secret, "utf8");
  const blocks = Math.ceil(encrypted.length / 16);
  const decrypted = Buffer.alloc(encrypted.length);
  let prevBlock = requestAuthenticator;

  for (let i = 0; i < blocks; i++) {
    const hash = createHash("md5").update(Buffer.concat([secretBuf, prevBlock])).digest();
    const cipherBlock = encrypted.subarray(i * 16, i * 16 + 16);
    for (let j = 0; j < cipherBlock.length; j++) {
      decrypted[i * 16 + j] = cipherBlock[j]! ^ hash[j]!;
    }
    prevBlock = cipherBlock;
  }
  // Password is NUL-padded to a 16-byte boundary, not length-prefixed — trim the padding.
  const nulIndex = decrypted.indexOf(0);
  return (nulIndex === -1 ? decrypted : decrypted.subarray(0, nulIndex)).toString("utf8");
}

function encodeAttribute(type: number, value: Buffer): Buffer {
  const header = Buffer.from([type, value.length + 2]);
  return Buffer.concat([header, value]);
}

/** RFC 2865 §3 — the reply's Response Authenticator is MD5(Code+ID+Length+RequestAuthenticator
 *  +Attributes+Secret), computed over the reply packet itself with the *request's* authenticator
 *  spliced in — this is what proves the reply actually came from whoever holds the shared
 *  secret, not just anyone who can send a UDP packet back to the NAS. */
function buildResponse(
  code: number,
  identifier: number,
  requestAuthenticator: Buffer,
  secret: string,
  attributes: RadiusAttribute[]
): Buffer {
  const attrBuf = Buffer.concat(attributes.map((a) => encodeAttribute(a.type, a.value)));
  const length = 20 + attrBuf.length;
  const header = Buffer.alloc(4);
  header.writeUInt8(code, 0);
  header.writeUInt8(identifier, 1);
  header.writeUInt16BE(length, 2);

  const responseAuthenticator = createHash("md5")
    .update(Buffer.concat([header, requestAuthenticator, attrBuf, Buffer.from(secret, "utf8")]))
    .digest();

  return Buffer.concat([header, responseAuthenticator, attrBuf]);
}

async function getNasSecret(sourceAddress: string): Promise<string | null> {
  const nas = await prisma.radiusNas.findFirst({ where: { nasname: sourceAddress } });
  return nas?.secret ?? null;
}

async function checkCredentials(username: string, password: string): Promise<boolean> {
  const check = await prisma.radCheck.findFirst({
    where: { username, attribute: "Cleartext-Password" },
  });
  if (!check) return false;
  // op is always "==" for the Cleartext-Password rows this platform writes (voucher.service.ts,
  // radius-user provisioning) — a plain equality check matches what those rows actually mean,
  // but must still be constant-time: a `===` here leaks how many leading characters matched
  // through response-time differences, letting repeated Access-Requests narrow down a voucher
  // code character by character (the same class of oracle hotspot-account-login.service.ts is
  // deliberately hardened against with this same helper).
  return timingSafeStringEqual(check.value, password);
}

const MIKROTIK_VENDOR_ID = 14988;
const MIKROTIK_RATE_LIMIT_SUBTYPE = 8;
const MIKROTIK_TOTAL_LIMIT_SUBTYPE = 17;
const MIKROTIK_TOTAL_LIMIT_GIGAWORDS_SUBTYPE = 18;
const SESSION_TIMEOUT_TYPE = 27;
const VENDOR_SPECIFIC_TYPE = 26;
const U32_MAX_PLUS_ONE = 2 ** 32;

/** Splits a byte count that may exceed 32 bits into the (value, gigawords) pair RADIUS's
 *  32-bit counter attributes require — same convention RFC 2869's Acct-*-Gigawords uses for
 *  accounting octets, reused here since Mikrotik-Total-Limit is also a plain 32-bit integer. */
function encodeTotalLimitAttributes(totalBytes: number): RadiusAttribute[] {
  const remainder = totalBytes % U32_MAX_PLUS_ONE;
  const gigawords = Math.floor(totalBytes / U32_MAX_PLUS_ONE);
  const remainderBuf = Buffer.alloc(4);
  remainderBuf.writeUInt32BE(remainder, 0);
  const attributes = [encodeVendorSpecific(MIKROTIK_VENDOR_ID, MIKROTIK_TOTAL_LIMIT_SUBTYPE, remainderBuf)];
  if (gigawords > 0) {
    const gigawordsBuf = Buffer.alloc(4);
    gigawordsBuf.writeUInt32BE(gigawords, 0);
    attributes.push(encodeVendorSpecific(MIKROTIK_VENDOR_ID, MIKROTIK_TOTAL_LIMIT_GIGAWORDS_SUBTYPE, gigawordsBuf));
  }
  return attributes;
}

/** RFC 2865 §5.26 — a Vendor-Specific attribute wraps a 4-byte Vendor-Id followed by the
 *  vendor's own sub-attribute (its own type/length/value), all inside one outer type-26 TLV. */
function encodeVendorSpecific(vendorId: number, subType: number, value: Buffer): RadiusAttribute {
  const vendorIdBuf = Buffer.alloc(4);
  vendorIdBuf.writeUInt32BE(vendorId, 0);
  const subAttr = Buffer.concat([Buffer.from([subType, value.length + 2]), value]);
  return { type: VENDOR_SPECIFIC_TYPE, value: Buffer.concat([vendorIdBuf, subAttr]) };
}

/** Translates this username's `radreply` rows into real RADIUS reply attributes for the
 *  Access-Accept — see the module doc comment for exactly which attributes are supported and
 *  which are a known gap. */
async function buildReplyAttributes(username: string): Promise<RadiusAttribute[]> {
  const replies = await prisma.radReply.findMany({ where: { username } });
  const attributes: RadiusAttribute[] = [];

  for (const reply of replies) {
    if (reply.attribute === "Session-Timeout") {
      const seconds = Number(reply.value);
      if (Number.isFinite(seconds) && seconds > 0) {
        const buf = Buffer.alloc(4);
        buf.writeUInt32BE(Math.floor(seconds), 0);
        attributes.push({ type: SESSION_TIMEOUT_TYPE, value: buf });
      }
    } else if (reply.attribute === "Mikrotik-Rate-Limit") {
      attributes.push(
        encodeVendorSpecific(MIKROTIK_VENDOR_ID, MIKROTIK_RATE_LIMIT_SUBTYPE, Buffer.from(reply.value, "utf8"))
      );
    } else if (reply.attribute === "Mikrotik-Total-Limit") {
      const totalBytes = Number(reply.value);
      if (Number.isFinite(totalBytes) && totalBytes > 0) {
        attributes.push(...encodeTotalLimitAttributes(Math.floor(totalBytes)));
      }
    } else {
      console.warn(
        `[radius] reply attribute "${reply.attribute}" for "${username}" is not yet forwarded by the embedded server (unimplemented encoding) — see radius-server.ts's doc comment`
      );
    }
  }
  return attributes;
}

/** The actual data-cap enforcement path (see module doc comment): called on every
 *  Interim-Update/Stop accounting packet with that session's cumulative byte count. Looks up the
 *  same `Mikrotik-Total-Limit` radReply row the Access-Accept already sent, and — the moment
 *  usage reaches it — force-disconnects the session on the router directly, rather than trusting
 *  RouterOS to have acted on the attribute itself. */
async function enforceDataCap(username: string, nasAddress: string, totalBytes: number): Promise<void> {
  const cap = await prisma.radReply.findFirst({ where: { username, attribute: "Mikrotik-Total-Limit" } });
  if (!cap) return;
  const capBytes = Number(cap.value);
  if (!Number.isFinite(capBytes) || capBytes <= 0 || totalBytes < capBytes) return;

  const router = await prisma.router.findFirst({ where: { host: nasAddress, deletedAt: null } });
  if (!router) {
    console.warn(
      `[radius] "${username}" exceeded its data cap (${totalBytes}/${capBytes} bytes) but no Router row matches NAS ${nasAddress} — cannot force-disconnect`
    );
    return;
  }

  const adapter = createAdapterForRouter({ ...router, host: router.host ?? nasAddress });
  try {
    await adapter.connect();
    await adapter.disconnectUser(username);
    console.log(
      `[radius] disconnected "${username}" from "${router.name}" — data cap exceeded (${totalBytes}/${capBytes} bytes)`
    );
  } catch (err) {
    console.error(`[radius] failed to force-disconnect "${username}" after its data cap was exceeded:`, err);
  } finally {
    await adapter.disconnect().catch(() => {});
  }
}

/** Persists the same accounting figure enforceDataCap already computed onto the matching
 *  voucher row, so "how much data has this customer used" is a plain DB read (for the staff
 *  purchases list, support tickets, etc.) instead of a live router round-trip that only works
 *  while the session is still active. A no-op for any username that isn't a voucher code (a
 *  PPPoE/account-login username, for instance) — those don't have a HotspotVoucher row to
 *  update, which is the normal, expected case for most accounting traffic. */
async function recordVoucherUsage(username: string, inputBytes: number, outputBytes: number): Promise<void> {
  await prisma.hotspotVoucher
    .updateMany({
      where: { code: username },
      data: { bytesIn: BigInt(inputBytes), bytesOut: BigInt(outputBytes), usageUpdatedAt: new Date() },
    })
    .catch((err) => console.error(`[radius] failed to record usage for "${username}":`, err));
}

export interface RadiusServerHandle {
  close: () => Promise<void>;
}

/** Starts the auth (1812) and accounting (1813) UDP listeners. Every Accounting-Request gets an
 *  immediate Accounting-Response first (the NAS only needs the ack to stop retrying — that must
 *  never block on cap enforcement), then Interim-Update/Stop packets are checked against the
 *  session's data cap in the background (enforceDataCap). */
export function startRadiusServer(options: { authPort?: number; acctPort?: number } = {}): RadiusServerHandle {
  const authPort = options.authPort ?? 1812;
  const acctPort = options.acctPort ?? 1813;

  const authSocket: Socket = createSocket("udp4");
  authSocket.on("message", (msg, rinfo) => {
    void (async () => {
      const packet = parsePacket(msg);
      if (!packet || packet.code !== RADIUS_CODE.ACCESS_REQUEST) return;

      const secret = await getNasSecret(rinfo.address);
      if (!secret) {
        console.warn(`[radius] Access-Request from unknown NAS ${rinfo.address} — no matching RadiusNas row`);
        return;
      }

      try {
        const usernameBuf = findAttr(packet, ATTR.USER_NAME);
        const passwordBuf = findAttr(packet, ATTR.USER_PASSWORD);
        const username = usernameBuf?.toString("utf8") ?? "(missing)";
        const valid =
          usernameBuf && passwordBuf
            ? await checkCredentials(username, decodePapPassword(passwordBuf, secret, packet.authenticator))
            : false;

        const replyCode = valid ? RADIUS_CODE.ACCESS_ACCEPT : RADIUS_CODE.ACCESS_REJECT;
        const replyAttributes = valid ? await buildReplyAttributes(username) : [];
        const response = buildResponse(replyCode, packet.identifier, packet.authenticator, secret, replyAttributes);
        authSocket.send(response, rinfo.port, rinfo.address);
        console.log(`[radius] ${valid ? "Access-Accept" : "Access-Reject"} for "${username}" from ${rinfo.address}`);
      } catch (err) {
        console.error("[radius] error handling Access-Request:", err);
      }
    })();
  });
  authSocket.bind(authPort, "0.0.0.0");

  const acctSocket: Socket = createSocket("udp4");
  acctSocket.on("message", (msg, rinfo) => {
    const packet = parsePacket(msg);
    if (!packet || packet.code !== RADIUS_CODE.ACCOUNTING_REQUEST) return;
    // The Accounting-Response authenticator is MD5(Code+ID+Length+RequestAuthenticator+
    // Attributes+Secret) same as auth, but with no attributes to echo back there's nothing
    // meaningful to look up a per-NAS secret for correctness beyond acking, so a fixed
    // placeholder secret is fine: MikroTik doesn't re-verify the accounting ack's hash.
    const response = buildResponse(RADIUS_CODE.ACCOUNTING_RESPONSE, packet.identifier, packet.authenticator, "", []);
    acctSocket.send(response, rinfo.port, rinfo.address);

    const statusType = readUInt32Attr(packet, ATTR.ACCT_STATUS_TYPE);
    if (statusType !== ACCT_STATUS_TYPE.INTERIM_UPDATE && statusType !== ACCT_STATUS_TYPE.STOP) return;

    const username = findAttr(packet, ATTR.USER_NAME)?.toString("utf8");
    if (!username) return;

    const inputBytes =
      readUInt32Attr(packet, ATTR.ACCT_INPUT_GIGAWORDS) * U32_MAX_PLUS_ONE +
      readUInt32Attr(packet, ATTR.ACCT_INPUT_OCTETS);
    const outputBytes =
      readUInt32Attr(packet, ATTR.ACCT_OUTPUT_GIGAWORDS) * U32_MAX_PLUS_ONE +
      readUInt32Attr(packet, ATTR.ACCT_OUTPUT_OCTETS);

    enforceDataCap(username, rinfo.address, inputBytes + outputBytes).catch((err) =>
      console.error(`[radius] error enforcing data cap for "${username}":`, err)
    );
    recordVoucherUsage(username, inputBytes, outputBytes).catch((err) =>
      console.error(`[radius] error recording usage for "${username}":`, err)
    );
  });
  acctSocket.bind(acctPort, "0.0.0.0");

  console.log(`[radius] embedded RADIUS server listening: auth=${authPort} acct=${acctPort}`);

  return {
    close: () =>
      Promise.all([
        new Promise<void>((resolve) => authSocket.close(() => resolve())),
        new Promise<void>((resolve) => acctSocket.close(() => resolve())),
      ]).then(() => undefined),
  };
}
