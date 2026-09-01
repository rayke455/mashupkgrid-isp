import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createSocket } from "node:dgram";

const SECRET = "shared-secret";
const NAS_TENANT = "tenant-1";

const upserts: { where: { acctUniqueId: string }; create: Record<string, unknown>; update: Record<string, unknown> }[] = [];

vi.mock("@mashupkgrid/database", () => ({
  prisma: {
    radiusNas: { findFirst: async () => ({ secret: SECRET, tenantId: NAS_TENANT }) },
    radAcct: {
      upsert: async (args: (typeof upserts)[number]) => {
        upserts.push(args);
        return {};
      },
    },
    // Cap enforcement / voucher usage are separate concerns; stub them to no-ops so this test
    // isolates the accounting-persistence path.
    hotspotVoucher: { findFirst: async () => null, update: async () => ({}), updateMany: async () => ({ count: 0 }) },
    radCheck: { findFirst: async () => null },
    radReply: { findFirst: async () => null, findMany: async () => [] },
    router: { findFirst: async () => null },
  },
}));
vi.mock("@mashupkgrid/network", () => ({ createAdapterForRouter: () => ({}) }));

const { startRadiusServer } = await import("../radius-server.js");

const ATTR = {
  USER_NAME: 1,
  ACCT_STATUS_TYPE: 40,
  ACCT_INPUT_OCTETS: 42,
  ACCT_OUTPUT_OCTETS: 43,
  ACCT_SESSION_ID: 44,
  ACCT_SESSION_TIME: 46,
  ACCT_TERMINATE_CAUSE: 49,
  CALLING_STATION_ID: 31,
  FRAMED_IP_ADDRESS: 8,
};

function attr(type: number, value: Buffer): Buffer {
  return Buffer.concat([Buffer.from([type, value.length + 2]), value]);
}
function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}

/** RFC 2866 §3 — an Accounting-Request's authenticator is MD5 over the packet with the
 *  authenticator field zeroed, plus the shared secret. */
function buildAccountingRequest(id: number, attrs: Buffer): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt8(4, 0);
  header.writeUInt8(id, 1);
  header.writeUInt16BE(20 + attrs.length, 2);
  const authenticator = createHash("md5")
    .update(Buffer.concat([header, Buffer.alloc(16), attrs, Buffer.from(SECRET, "utf8")]))
    .digest();
  return Buffer.concat([header, authenticator, attrs]);
}

const AUTH_PORT = 18120;
const ACCT_PORT = 18130;
const server = startRadiusServer({ authPort: AUTH_PORT, acctPort: ACCT_PORT });
afterAll(async () => {
  await server.close();
});

/** Sends one packet and resolves with the server's reply. */
function send(packet: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const sock = createSocket("udp4");
    const timer = setTimeout(() => {
      sock.close();
      reject(new Error("no Accounting-Response within 2s"));
    }, 2000);
    sock.on("message", (msg) => {
      clearTimeout(timer);
      sock.close();
      resolve(msg);
    });
    sock.send(packet, ACCT_PORT, "127.0.0.1");
  });
}

/** Lets the fire-and-forget persistence promise settle after the response is sent. */
const settle = () => new Promise((r) => setTimeout(r, 60));

beforeEach(() => {
  upserts.length = 0;
});

describe("RADIUS accounting persistence", () => {
  it("writes a radacct row for Accounting-Start, so a running session is visible immediately", async () => {
    const attrs = Buffer.concat([
      attr(ATTR.USER_NAME, Buffer.from("VOUCHER1")),
      attr(ATTR.ACCT_STATUS_TYPE, u32(1)),
      attr(ATTR.ACCT_SESSION_ID, Buffer.from("81a00001")),
      attr(ATTR.FRAMED_IP_ADDRESS, Buffer.from([192, 168, 88, 252])),
      attr(ATTR.CALLING_STATION_ID, Buffer.from("0A:2C:85:53:36:27")),
    ]);
    const reply = await send(buildAccountingRequest(7, attrs));
    expect(reply.readUInt8(0)).toBe(5); // Accounting-Response
    await settle();

    expect(upserts).toHaveLength(1);
    expect(upserts[0]!.create).toMatchObject({
      tenantId: NAS_TENANT,
      username: "VOUCHER1",
      acctSessionId: "81a00001",
      framedIpAddress: "192.168.88.252",
      callingStationId: "0A:2C:85:53:36:27",
    });
    expect(upserts[0]!.create.acctStartTime).toBeInstanceOf(Date);
    expect(upserts[0]!.create).not.toHaveProperty("acctStopTime");
  });

  it("updates the SAME row on Interim-Update rather than creating a second session", async () => {
    const base = (statusType: number, octets: number) =>
      Buffer.concat([
        attr(ATTR.USER_NAME, Buffer.from("VOUCHER1")),
        attr(ATTR.ACCT_STATUS_TYPE, u32(statusType)),
        attr(ATTR.ACCT_SESSION_ID, Buffer.from("81a00001")),
        attr(ATTR.ACCT_INPUT_OCTETS, u32(octets)),
        attr(ATTR.ACCT_OUTPUT_OCTETS, u32(octets * 2)),
      ]);

    await send(buildAccountingRequest(8, base(1, 0)));
    await settle();
    await send(buildAccountingRequest(9, base(3, 5_000)));
    await settle();

    expect(upserts).toHaveLength(2);
    expect(upserts[0]!.where.acctUniqueId).toBe(upserts[1]!.where.acctUniqueId);
    expect(upserts[1]!.update).toMatchObject({
      acctInputOctets: 5000n,
      acctOutputOctets: 10000n,
    });
  });

  it("closes the session on Accounting-Stop with a readable terminate cause", async () => {
    const attrs = Buffer.concat([
      attr(ATTR.USER_NAME, Buffer.from("VOUCHER1")),
      attr(ATTR.ACCT_STATUS_TYPE, u32(2)),
      attr(ATTR.ACCT_SESSION_ID, Buffer.from("81a00001")),
      attr(ATTR.ACCT_SESSION_TIME, u32(600)),
      attr(ATTR.ACCT_TERMINATE_CAUSE, u32(5)),
    ]);
    await send(buildAccountingRequest(10, attrs));
    await settle();

    expect(upserts).toHaveLength(1);
    expect(upserts[0]!.update).toMatchObject({
      acctSessionTime: 600,
      acctTerminateCause: "Session-Timeout",
    });
    expect(upserts[0]!.update.acctStopTime).toBeInstanceOf(Date);
  });

  it("ignores an Accounting-Request whose authenticator does not verify", async () => {
    const attrs = Buffer.concat([
      attr(ATTR.USER_NAME, Buffer.from("VOUCHER1")),
      attr(ATTR.ACCT_STATUS_TYPE, u32(1)),
      attr(ATTR.ACCT_SESSION_ID, Buffer.from("81a00002")),
    ]);
    const forged = buildAccountingRequest(11, attrs);
    forged[4] = forged[4]! ^ 0xff; // corrupt the authenticator

    await expect(send(forged)).rejects.toThrow(/no Accounting-Response/);
    await settle();
    expect(upserts).toHaveLength(0);
  });
});
