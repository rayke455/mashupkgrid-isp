import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  prisma: {
    campaign: { findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    campaignRecipient: { findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
  },
  billing: { attributeCampaignPayments: vi.fn().mockResolvedValue(0), snapshotRecipients: vi.fn().mockResolvedValue(2) },
  sms: vi.fn(),
  wa: vi.fn(),
  socket: vi.fn(),
  redis: { set: vi.fn(), del: vi.fn() },
}));

vi.mock("@mashupkgrid/database", () => ({ prisma: h.prisma }));
vi.mock("@mashupkgrid/billing", () => h.billing);
vi.mock("@mashupkgrid/sms", () => ({ sendTenantSms: h.sms }));
vi.mock("@mashupkgrid/whatsapp", () => ({ sendWhatsAppMessage: h.wa }));
vi.mock("../../lib/redis.js", () => ({ redis: h.redis }));
vi.mock("../../lib/whatsapp-runtime.js", () => ({ resolveSocket: h.socket }));

import { handleSendCampaigns } from "../campaigns.js";

const campaign = (channel: "SMS" | "WHATSAPP" | "BOTH") => ({ id: "c1", tenantId: "t1", channel, status: "SENDING" });
const recipients = [
  { id: "r1", phone: "+254700000001", message: "Hi Jane" },
  { id: "r2", phone: "+254700000002", message: "Hi Brian" },
];

describe("handleSendCampaigns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.redis.set.mockResolvedValue("OK");
    h.prisma.campaign.findMany.mockImplementation(async ({ where }: { where: { status: string } }) => (where.status === "SCHEDULED" ? [{ id: "c1", status: "SCHEDULED" }] : [campaign("BOTH")]));
    h.prisma.campaign.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.campaignRecipient.findMany.mockResolvedValue(recipients);
    h.prisma.campaignRecipient.count.mockResolvedValue(0);
  });

  it("starts due campaigns, sends each recipient, and finishes the campaign", async () => {
    h.socket.mockReturnValue({});
    h.sms.mockResolvedValueOnce({ delivered: true }).mockResolvedValueOnce({ delivered: false, reason: "no credit" });
    h.wa.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("not on WhatsApp"));
    const res = await handleSendCampaigns(new Date());
    expect(res).toMatchObject({ started: 1, sent: 1, failed: 1, finished: 1 });
    expect(h.billing.snapshotRecipients).toHaveBeenCalledTimes(1);
    expect(h.prisma.campaignRecipient.update.mock.calls[1]![0].data).toMatchObject({ status: "FAILED", error: "SMS: no credit; WhatsApp: not on WhatsApp" });
    expect(h.prisma.campaign.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: expect.objectContaining({ status: "SENT" }) });
  });

  it("counts WhatsApp-only messages as failed when no number is linked", async () => {
    h.prisma.campaign.findMany.mockImplementation(async ({ where }: { where: { status: string } }) => (where.status === "SCHEDULED" ? [] : [campaign("WHATSAPP")]));
    h.socket.mockReturnValue(null);
    const res = await handleSendCampaigns(new Date());
    expect(res).toMatchObject({ sent: 0, failed: 2 });
    expect(h.sms).not.toHaveBeenCalled();
  });

  it("does nothing while another worker holds the lock", async () => {
    h.redis.set.mockResolvedValue(null);
    await handleSendCampaigns(new Date());
    expect(h.prisma.campaign.findMany).not.toHaveBeenCalled();
    expect(h.redis.del).not.toHaveBeenCalled();
  });
});
