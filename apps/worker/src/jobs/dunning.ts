import {
  listInvoicesDueSoon,
  listOverdueInvoicesNeedingNotice,
  listInvoicesNeedingFinalNotice,
  markDunningStage,
  type DunningCandidate,
} from "@mashupkgrid/billing";
import { prisma } from "@mashupkgrid/database";
import { sendTenantSms } from "@mashupkgrid/sms";
import { sendWhatsAppMessage } from "@mashupkgrid/whatsapp";
import { resolveSocket } from "../lib/whatsapp-runtime.js";
import { sendEmail } from "../lib/email.js";
import { renderReminderTemplate, resolveTenantPreferences, type AutomationSummary, type TenantPreferences } from "@mashupkgrid/shared";

function formatMoney(minorUnits: number, currency: string): string {
  return `${currency} ${(minorUnits / 100).toFixed(2)}`;
}

function balanceDue(invoice: DunningCandidate): number {
  return invoice.totalMinor - invoice.amountPaidMinor;
}

type Stage = "dueSoon" | "overdue" | "final";

interface TenantContext {
  name: string;
  prefs: TenantPreferences;
}

/** Each ISP's own reminder settings (Settings → Reminders and tickets), read once per run. */
async function loadTenantContexts(candidates: DunningCandidate[]): Promise<Map<string, TenantContext>> {
  const ids = [...new Set(candidates.map((c) => c.tenantId))];
  if (ids.length === 0) return new Map();
  const tenants = await prisma.tenant.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, preferences: true } });
  return new Map(tenants.map((t) => [t.id, { name: t.name, prefs: resolveTenantPreferences(t.preferences) }]));
}

function buildMessages(invoice: DunningCandidate, ctx: TenantContext, stage: Stage) {
  const t = ctx.prefs.reminders.templates;
  const values = {
    name: invoice.customer.fullName,
    invoice: invoice.invoiceNumber,
    amount: formatMoney(balanceDue(invoice), invoice.currency),
    due: invoice.dueDate.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }),
    isp: ctx.name,
  };
  const pick = {
    dueSoon: { sms: t.dueSoonSms, subject: t.dueSoonEmailSubject, body: t.dueSoonEmailBody },
    overdue: { sms: t.overdueSms, subject: t.overdueEmailSubject, body: t.overdueEmailBody },
    final: { sms: t.finalSms, subject: t.finalEmailSubject, body: t.finalEmailBody },
  }[stage];
  const text = renderReminderTemplate(pick.body, values);
  return {
    sms: renderReminderTemplate(pick.sms, values),
    email: {
      subject: renderReminderTemplate(pick.subject, values),
      text,
      html: text
        .split("\n\n")
        .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
        .join(""),
    },
  };
}

/**
 * Every dunning stage shares the same shape: try the channels the ISP turned on — email if one is
 * on file, SMS (Customer.phone is required, unlike email) — and mark the stage once, regardless
 * of whether either channel actually delivered. That mirrors sendEmail's own "log, don't fail"
 * posture for an unconfigured transport (see lib/email.ts) and sendTenantSms's matching one: a
 * delivery failure must not re-send the same notice on every future tick forever, and one
 * tenant's broken gateway must not stop this batch from reaching every other tenant's customers.
 */
async function processCandidates(
  candidates: DunningCandidate[],
  stageNumber: 1 | 2 | 3,
  stage: Stage
): Promise<{ processed: number; emailSent: number; smsSent: number; smsFailed: number; whatsappSent: number }> {
  let emailSent = 0;
  let smsSent = 0;
  let smsFailed = 0;
  let whatsappSent = 0;
  const contexts = await loadTenantContexts(candidates);

  for (const invoice of candidates) {
    const ctx = contexts.get(invoice.tenantId);
    if (!ctx) continue;
    const { email, sms } = buildMessages(invoice, ctx, stage);

    if (ctx.prefs.reminders.email && invoice.customer.email) {
      await sendEmail({ to: invoice.customer.email, ...email });
      emailSent += 1;
    }

    if (ctx.prefs.reminders.sms) {
      try {
        const result = await sendTenantSms(invoice.tenantId, invoice.customer.phone, sms);
        if (result.delivered) smsSent += 1;
        else smsFailed += 1;
      } catch (err) {
        smsFailed += 1;
        console.error(`[dunning] SMS send failed for invoice ${invoice.id}`, err);
      }
    }

    // WhatsApp goes out from the ISP's own linked number. No linked number means no message,
    // not a failure: most ISPs start with SMS only.
    if (ctx.prefs.reminders.whatsapp) {
      const socket = resolveSocket(invoice.tenantId);
      if (socket) {
        try {
          await sendWhatsAppMessage(socket, invoice.customer.phone, sms);
          whatsappSent += 1;
        } catch (err) {
          console.error(`[dunning] WhatsApp send failed for invoice ${invoice.id}`, err);
        }
      }
    }

    await markDunningStage(invoice.id, stageNumber);
  }

  return { processed: candidates.length, emailSent, smsSent, smsFailed, whatsappSent };
}

export async function handleSendDueSoonReminders(): Promise<AutomationSummary> {
  // Fetch the widest window any ISP may ask for, then keep each invoice only once it is inside
  // its own ISP's window (0 days means that ISP sends no due-soon reminder).
  const all = await listInvoicesDueSoon(14);
  const contexts = await loadTenantContexts(all);
  const now = Date.now();
  const candidates = all.filter((invoice) => {
    const days = contexts.get(invoice.tenantId)?.prefs.reminders.daysBeforeDue ?? 0;
    return days > 0 && invoice.dueDate.getTime() - now <= days * 86_400_000;
  });
  const result = await processCandidates(candidates, 1, "dueSoon");
  console.log(
    `[dunning] due-soon-reminders: processed=${result.processed} emailSent=${result.emailSent} smsSent=${result.smsSent} smsFailed=${result.smsFailed} whatsappSent=${result.whatsappSent}`
  );
  return result;
}

export async function handleSendOverdueNotices(): Promise<AutomationSummary> {
  const candidates = await listOverdueInvoicesNeedingNotice();
  const result = await processCandidates(candidates, 2, "overdue");
  console.log(
    `[dunning] overdue-notices: processed=${result.processed} emailSent=${result.emailSent} smsSent=${result.smsSent} smsFailed=${result.smsFailed} whatsappSent=${result.whatsappSent}`
  );
  return result;
}

export async function handleSendFinalDunningNotices(): Promise<AutomationSummary> {
  const candidates = await listInvoicesNeedingFinalNotice();
  const result = await processCandidates(candidates, 3, "final");
  console.log(
    `[dunning] final-notices: processed=${result.processed} emailSent=${result.emailSent} smsSent=${result.smsSent} smsFailed=${result.smsFailed} whatsappSent=${result.whatsappSent}`
  );
  return result;
}
