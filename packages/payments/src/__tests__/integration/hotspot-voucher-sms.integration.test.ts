import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@mashupkgrid/database";

const sms = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@mashupkgrid/sms", () => ({ sendHotspotVoucherSms: sms.send }));

import { completeStkRequest } from "../../mpesa/callback.service.js";
import { integrationEnabled, resetDb, seedPlatform, seedTenant } from "./harness.js";

/** The buyer is texted their code once, after the payment commits, and never on a replay. */
describe.skipIf(!integrationEnabled)("hotspot voucher SMS", () => {
  beforeEach(async () => {
    await resetDb();
    await seedPlatform();
    sms.send.mockReset().mockResolvedValue({ delivered: true });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function pendingHotspotPurchase(): Promise<{ tenantId: string; checkout: string }> {
    const t = await seedTenant("sms-isp");
    const pkg = await prisma.hotspotPackage.create({
      data: { tenantId: t.tenantId, name: "1 Hour", priceMinor: 1_000, durationMinutes: 60 },
    });
    const checkout = `ws_CO_${randomUUID()}`;
    await prisma.mpesaStkRequest.create({
      data: {
        tenantId: t.tenantId,
        hotspotPackageId: pkg.id,
        phone: "254712345678",
        amountMinor: 1_000,
        merchantRequestId: `m-${randomUUID()}`,
        checkoutRequestId: checkout,
        status: "PENDING",
        collectedBy: "PLATFORM",
      },
    });
    return { tenantId: t.tenantId, checkout };
  }

  const paid = { resultCode: 0, resultDesc: "ok", metadata: { mpesaReceiptNumber: "UIOSMS0001" }, raw: {} };

  it("texts the buyer the code that was issued, once", async () => {
    const { tenantId, checkout } = await pendingHotspotPurchase();
    const done = await completeStkRequest(tenantId, checkout, paid);
    await completeStkRequest(tenantId, checkout, paid); // Safaricom retries the callback

    expect(sms.send).toHaveBeenCalledTimes(1);
    expect(sms.send).toHaveBeenCalledWith(tenantId, "254712345678", { code: done.hotspotVoucherCode, packageName: "1 Hour" });
  });

  it("sends nothing for a cancelled payment", async () => {
    const { tenantId, checkout } = await pendingHotspotPurchase();
    await completeStkRequest(tenantId, checkout, { resultCode: 1032, resultDesc: "cancelled", metadata: {}, raw: {} });
    expect(sms.send).not.toHaveBeenCalled();
  });

  it("keeps the payment when the SMS gateway fails", async () => {
    sms.send.mockRejectedValue(new Error("gateway down"));
    const { tenantId, checkout } = await pendingHotspotPurchase();
    const done = await completeStkRequest(tenantId, checkout, paid);
    expect(done.status).toBe("COMPLETED");
    expect(await prisma.hotspotVoucher.count({ where: { tenantId } })).toBe(1);
  });
});
