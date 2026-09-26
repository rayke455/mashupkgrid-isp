import { prisma } from "@mashupkgrid/database";
import type { AutomationSummary } from "@mashupkgrid/shared";
import { attributeCampaignPayments, snapshotRecipients } from "@mashupkgrid/billing";
import { sendTenantSms, type SendTenantSmsResult } from "@mashupkgrid/sms";
import { sendWhatsAppMessage } from "@mashupkgrid/whatsapp";
import { redis } from "../lib/redis.js";
import { resolveSocket } from "../lib/whatsapp-runtime.js";

/** Messages per run, across campaigns, so one big campaign can't hold the billing queue. */
const BATCH = 150;

/**
 * Starts campaigns whose time has come, sends the next batch of messages, marks finished ones,
 * and records payments made by recipients since their message.
 */
export async function handleSendCampaigns(now = new Date()): Promise<AutomationSummary> {
  // More than one worker process must never send the same batch twice.
  if (!(await redis.set("campaigns:lock", "1", "EX", 55, "NX"))) return { sent: 0, failed: 0, started: 0, finished: 0, attributed: 0 };
  try {
    const attributed = await attributeCampaignPayments(now);

    let started = 0;
    const due = await prisma.campaign.findMany({ where: { status: "SCHEDULED", scheduledAt: { lte: now } } });
    for (const c of due) {
      const claimed = await prisma.campaign.updateMany({ where: { id: c.id, status: "SCHEDULED" }, data: { status: "SENDING", startedAt: now } });
      if (!claimed.count) continue;
      await snapshotRecipients(c);
      started += 1;
    }

    let sent = 0;
    let failed = 0;
    let budget = BATCH;
    const sending = await prisma.campaign.findMany({ where: { status: "SENDING" }, orderBy: { startedAt: "asc" } });
    for (const c of sending) {
      if (budget <= 0) break;
      const batch = await prisma.campaignRecipient.findMany({ where: { campaignId: c.id, status: "PENDING" }, take: budget });
      budget -= batch.length;
      const socket = c.channel === "SMS" ? null : resolveSocket(c.tenantId);
      for (const r of batch) {
        let ok = false;
        const errors: string[] = [];
        if (c.channel !== "WHATSAPP") {
          const res: SendTenantSmsResult = await sendTenantSms(c.tenantId, r.phone, r.message).catch((err: unknown) => ({ delivered: false, reason: err instanceof Error ? err.message : String(err) }));
          if (res.delivered) ok = true;
          else errors.push(`SMS: ${res.reason ?? "not delivered"}`);
        }
        if (c.channel !== "SMS") {
          if (!socket) errors.push("WhatsApp: no linked number");
          else {
            try {
              await sendWhatsAppMessage(socket, r.phone, r.message);
              ok = true;
            } catch (err) {
              errors.push(`WhatsApp: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }
        await prisma.campaignRecipient.update({
          where: { id: r.id },
          data: ok ? { status: "SENT", sentAt: new Date(), error: errors.length ? errors.join("; ") : null } : { status: "FAILED", error: errors.join("; ").slice(0, 500) },
        });
        if (ok) sent += 1;
        else failed += 1;
      }
    }

    // Done once nothing is left waiting.
    let finished = 0;
    for (const c of sending) {
      if (await prisma.campaignRecipient.count({ where: { campaignId: c.id, status: "PENDING" } })) continue;
      await prisma.campaign.update({ where: { id: c.id }, data: { status: "SENT", finishedAt: new Date() } });
      finished += 1;
    }
    return { sent, failed, started, finished, attributed };
  } finally {
    await redis.del("campaigns:lock");
  }
}
