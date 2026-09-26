import { describe, it, expect, beforeEach, vi } from "vitest";

/** Devices the push service reports as gone are deleted; working ones are stamped; nothing is
 *  sent at all when the server has no VAPID keys. */

const h = vi.hoisted(() => ({
  env: { VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv", VAPID_SUBJECT: "mailto:a@b.c" },
  send: vi.fn(),
  prisma: { pushSubscription: { findMany: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() } },
}));

vi.mock("@mashupkgrid/config", () => ({ env: h.env }));
vi.mock("@mashupkgrid/database", () => ({ prisma: h.prisma }));
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: h.send } }));

import { pushToTenantStaff, isPushConfigured } from "../index.js";

const device = (id: string) => ({ id, endpoint: `https://push.example.com/${id}`, p256dh: "k", auth: "a" });

describe("push", () => {
  beforeEach(() => {
    h.env.VAPID_PUBLIC_KEY = "pub";
    h.env.VAPID_PRIVATE_KEY = "priv";
    for (const m of [h.send, h.prisma.pushSubscription.findMany, h.prisma.pushSubscription.deleteMany, h.prisma.pushSubscription.updateMany]) m.mockReset();
  });

  it("deletes gone devices, stamps delivered ones, and scopes to the tenant's permitted staff", async () => {
    h.prisma.pushSubscription.findMany.mockResolvedValue([device("ok"), device("gone"), device("flaky")]);
    h.send
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }))
      .mockRejectedValueOnce(Object.assign(new Error("busy"), { statusCode: 503 }));

    const sent = await pushToTenantStaff("t1", "routers.manage", { title: "Router down", body: "x" });

    expect(sent).toBe(1);
    const where = h.prisma.pushSubscription.findMany.mock.calls[0]![0].where;
    expect(where.user.tenantId).toBe("t1");
    expect(JSON.stringify(where)).toContain("routers.manage");
    expect(h.prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["gone"] } } });
    expect(h.prisma.pushSubscription.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["ok"] } }, data: { lastSuccessAt: expect.any(Date) } });
  });

  it("sends nothing without VAPID keys", async () => {
    h.env.VAPID_PRIVATE_KEY = "";
    expect(isPushConfigured()).toBe(false);
    expect(await pushToTenantStaff("t1", "payments.read", { title: "x", body: "y" })).toBe(0);
    expect(h.prisma.pushSubscription.findMany).not.toHaveBeenCalled();
  });
});
