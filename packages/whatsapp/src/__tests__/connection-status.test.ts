import { beforeEach, describe, expect, it, vi } from "vitest";

let tenantRow: { status: string; phoneNumber?: string | null } | null = null;
let platformRow: { status: string } | null = null;

vi.mock("@mashupkgrid/database", () => ({
  prisma: {
    whatsappConnection: {
      findUnique: async () => tenantRow,
      findFirst: async () => platformRow,
    },
  },
}));
// The pairing QR/code live in Redis and neither affects the flag under test, but the module
// opens a connection at import time — so this stands in for one that answers "nothing cached".
vi.mock("ioredis", () => ({
  Redis: class {
    on() {}
    async get() {
      return null;
    }
    async set() {
      return "OK";
    }
    async setex() {
      return "OK";
    }
    async del() {
      return 1;
    }
  },
}));

vi.mock("@mashupkgrid/config", () => ({ env: { REDIS_URL: "redis://localhost:6379" } }));

const mod = await import("../connection.service.js");

beforeEach(() => {
  tenantRow = null;
  platformRow = null;
});

describe("deliveringOnPlatformLine", () => {
  it("is true when the tenant is not connected but the platform line is", async () => {
    tenantRow = { status: "DISCONNECTED" };
    platformRow = { status: "CONNECTED" };
    const view = await mod.getConnectionStatus("t1");
    expect(view.deliveringOnPlatformLine).toBe(true);
  });

  it("is false once the tenant links their own number", async () => {
    tenantRow = { status: "CONNECTED" };
    platformRow = { status: "CONNECTED" };
    const view = await mod.getConnectionStatus("t1");
    expect(view.deliveringOnPlatformLine).toBe(false);
  });

  it("is false when nothing is connected — no messages are going anywhere to warn about", async () => {
    tenantRow = { status: "DISCONNECTED" };
    platformRow = { status: "DISCONNECTED" };
    const view = await mod.getConnectionStatus("t1");
    expect(view.deliveringOnPlatformLine).toBe(false);
  });

  it("is true for a tenant whose session was logged out from the phone", async () => {
    // LOGGED_OUT is the case most likely to catch an operator out: it worked yesterday, and
    // today their customers are quietly being messaged from someone else's number.
    tenantRow = { status: "LOGGED_OUT" };
    platformRow = { status: "CONNECTED" };
    const view = await mod.getConnectionStatus("t1");
    expect(view.deliveringOnPlatformLine).toBe(true);
  });

  it("is always false for the platform scope itself", async () => {
    tenantRow = { status: "DISCONNECTED" };
    platformRow = { status: "DISCONNECTED" };
    const view = await mod.getConnectionStatus(null);
    expect(view.deliveringOnPlatformLine).toBe(false);
  });
});
