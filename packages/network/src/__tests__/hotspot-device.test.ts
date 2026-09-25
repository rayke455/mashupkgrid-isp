import { beforeEach, describe, expect, it, vi } from "vitest";

type Voucher = { tenantId: string; code: string; status: string; expiresAt: Date | null; dataCapMb: number | null; bytesIn: bigint | null; bytesOut: bigint | null };
type Device = { id: string; tenantId: string; macAddress: string; voucherCode: string; baselineBytesIn: bigint; baselineBytesOut: bigint; lastSeenAt: Date };

const db = vi.hoisted(() => ({ vouchers: [] as Voucher[], devices: [] as Device[], passwords: new Set<string>() }));

vi.mock("@mashupkgrid/database", () => {
  const byKey = (tenantId: string, mac: string) => db.devices.find((d) => d.tenantId === tenantId && d.macAddress === mac) ?? null;
  return {
    prisma: {
      hotspotVoucher: {
        findUnique: async ({ where }: { where: { tenantId_code: { tenantId: string; code: string } } }) =>
          db.vouchers.find((v) => v.tenantId === where.tenantId_code.tenantId && v.code === where.tenantId_code.code) ?? null,
      },
      radCheck: {
        findFirst: async ({ where }: { where: { username: string } }) => (db.passwords.has(where.username) ? { id: "x" } : null),
      },
      hotspotDevice: {
        findUnique: async ({ where }: { where: { tenantId_macAddress: { tenantId: string; macAddress: string } } }) =>
          byKey(where.tenantId_macAddress.tenantId, where.tenantId_macAddress.macAddress),
        findMany: async ({ where }: { where: { tenantId: string; voucherCode: string } }) =>
          db.devices.filter((d) => d.tenantId === where.tenantId && d.voucherCode === where.voucherCode),
        upsert: async ({ where, create, update }: { where: { tenantId_macAddress: { tenantId: string; macAddress: string } }; create: Omit<Device, "id" | "lastSeenAt">; update: Partial<Device> }) => {
          const existing = byKey(where.tenantId_macAddress.tenantId, where.tenantId_macAddress.macAddress);
          if (existing) Object.assign(existing, update);
          else db.devices.push({ id: `d${db.devices.length}`, lastSeenAt: new Date(), ...create });
        },
        update: async ({ where, data }: { where: { id: string }; data: Partial<Device> }) => Object.assign(db.devices.find((d) => d.id === where.id)!, data),
        create: async ({ data }: { data: { tenantId: string; macAddress: string; voucherCode: string } }) =>
          db.devices.push({ id: `d${db.devices.length}`, baselineBytesIn: 0n, baselineBytesOut: 0n, lastSeenAt: new Date(), ...data }),
      },
    },
  };
});

const { normalizeMac, rememberDevice, rememberActiveDevices, findMacLogin, voucherUsageForSession, sessionNamesForVoucher } = await import("../hotspot-device.service.js");

const T = "tenant-1";
const PHONE = "AA:BB:CC:DD:EE:01";
const now = new Date("2026-09-25T12:00:00Z");

beforeEach(() => {
  db.vouchers = [];
  db.devices = [];
  db.passwords = new Set();
});

function voucher(v: Partial<Voucher> & { code: string }) {
  db.vouchers.push({ tenantId: T, status: "ACTIVE", expiresAt: null, dataCapMb: null, bytesIn: null, bytesOut: null, ...v });
  db.passwords.add(v.code);
}

describe("MAC addresses", () => {
  it("reads every format a router or phone uses", () => {
    expect(normalizeMac("aa-bb-cc-dd-ee-01")).toBe(PHONE);
    expect(normalizeMac("AABBCCDDEE01")).toBe(PHONE);
    expect(normalizeMac("aa:bb:cc:dd:ee:01")).toBe(PHONE);
    expect(normalizeMac("ABCD2345")).toBeNull(); // a voucher code is not a MAC
    expect(normalizeMac(undefined)).toBeNull();
  });
});

describe("logging a returning phone straight back in", () => {
  it("remembers the phone at its code login and lets it back in with the time left", async () => {
    voucher({ code: "ABCD2345", expiresAt: new Date(now.getTime() + 40 * 60_000) });
    await rememberDevice(T, "aa-bb-cc-dd-ee-01", "ABCD2345");
    const login = await findMacLogin(T, PHONE, now);
    expect(login).toEqual({ voucherCode: "ABCD2345", remainingSeconds: 40 * 60, remainingBytes: null });
  });

  it("gives only the data that is left", async () => {
    voucher({ code: "DATA1111", dataCapMb: 100, bytesIn: 30n * 1024n * 1024n, bytesOut: 10n * 1024n * 1024n });
    await rememberDevice(T, PHONE, "DATA1111");
    expect((await findMacLogin(T, PHONE, now))?.remainingBytes).toBe(60 * 1024 * 1024);
  });

  it("sends the phone to the sign-in page when the voucher is expired, used up, spent or deleted", async () => {
    voucher({ code: "OLD11111", expiresAt: new Date(now.getTime() - 1000) });
    await rememberDevice(T, PHONE, "OLD11111");
    expect(await findMacLogin(T, PHONE, now)).toBeNull();

    voucher({ code: "FULL1111", dataCapMb: 10, bytesIn: 10n * 1024n * 1024n, bytesOut: 0n });
    await rememberDevice(T, PHONE, "FULL1111");
    expect(await findMacLogin(T, PHONE, now)).toBeNull();

    voucher({ code: "USED1111", status: "USED" });
    await rememberDevice(T, PHONE, "USED1111");
    expect(await findMacLogin(T, PHONE, now)).toBeNull();

    voucher({ code: "GONE1111" });
    await rememberDevice(T, PHONE, "GONE1111");
    db.passwords.delete("GONE1111");
    expect(await findMacLogin(T, PHONE, now)).toBeNull();
  });

  it("never logs in a phone it hasn't seen, or one from another ISP", async () => {
    voucher({ code: "ABCD2345" });
    await rememberDevice(T, PHONE, "ABCD2345");
    expect(await findMacLogin(T, "AA:BB:CC:DD:EE:99", now)).toBeNull();
    expect(await findMacLogin("tenant-2", PHONE, now)).toBeNull();
  });

  it("only remembers phones for real hotspot vouchers, not PPPoE or account usernames", async () => {
    await rememberDevice(T, PHONE, "pppoe-customer-7");
    expect(db.devices).toHaveLength(0);
  });
});

describe("usage across reconnects", () => {
  it("adds a new session's bytes to what the voucher had already used", async () => {
    voucher({ code: "DATA2222", dataCapMb: 500, bytesIn: 100n, bytesOut: 50n });
    await rememberDevice(T, PHONE, "DATA2222");
    await findMacLogin(T, PHONE, now);
    // The returning phone's session runs under its MAC, with counters starting from zero.
    expect(await voucherUsageForSession(T, PHONE, PHONE, 10, 5)).toEqual({ voucherCode: "DATA2222", bytesIn: 110, bytesOut: 55 });
    // A code login's session runs under the code; the phone's MAC comes in Calling-Station-Id.
    expect(await voucherUsageForSession(T, "DATA2222", PHONE, 1, 1)).toEqual({ voucherCode: "DATA2222", bytesIn: 101, bytesOut: 51 });
  });

  it("leaves other usernames as they are", async () => {
    expect(await voucherUsageForSession(T, "pppoe-customer-7", PHONE, 7, 8)).toEqual({ voucherCode: "pppoe-customer-7", bytesIn: 7, bytesOut: 8 });
  });

  it("counts a voucher's sessions under its code and every phone logged back in with it", async () => {
    voucher({ code: "SHARE111" });
    await rememberDevice(T, PHONE, "SHARE111");
    await rememberDevice(T, "AA:BB:CC:DD:EE:02", "SHARE111");
    expect(await sessionNamesForVoucher(T, "SHARE111")).toEqual(["SHARE111", PHONE, "AA:BB:CC:DD:EE:02"]);
  });
});

describe("learning phones that are already online", () => {
  it("remembers voucher sessions from the router, and skips PPPoE, MAC logins and known phones", async () => {
    voucher({ code: "LIVE1111", expiresAt: new Date(now.getTime() + 30 * 60_000) });
    await rememberDevice(T, "AA:BB:CC:DD:EE:05", "LIVE1111");
    const added = await rememberActiveDevices(T, [
      { username: "LIVE1111", callerId: "aa:bb:cc:dd:ee:01" }, // new phone on a voucher
      { username: "pppoe-customer-7", callerId: "AA:BB:CC:DD:EE:02" }, // PPPoE: never a MAC login
      { username: "AA:BB:CC:DD:EE:03", callerId: "AA:BB:CC:DD:EE:03" }, // already a MAC login
      { username: "LIVE1111", callerId: "AA:BB:CC:DD:EE:05" }, // already known
    ]);
    expect(added).toBe(1);
    expect((await findMacLogin(T, PHONE, now))?.voucherCode).toBe("LIVE1111");
  });
});
