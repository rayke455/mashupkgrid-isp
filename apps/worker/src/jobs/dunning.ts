import {
  listInvoicesDueSoon,
  listOverdueInvoicesNeedingNotice,
  listInvoicesNeedingFinalNotice,
  markDunningStage,
  type DunningCandidate,
} from "@mashupkgrid/billing";
import { sendTenantSms } from "@mashupkgrid/sms";
import { sendEmail } from "../lib/email.js";

function formatMoney(minorUnits: number, currency: string): string {
  return `${currency} ${(minorUnits / 100).toFixed(2)}`;
}

function balanceDue(invoice: DunningCandidate): number {
  return invoice.totalMinor - invoice.amountPaidMinor;
}

interface DunningMessages {
  email: { subject: string; text: string; html: string };
  sms: string;
}

/**
 * Every dunning stage shares the same shape: try both channels for a candidate — email if one's
 * on file, SMS always (Customer.phone is required, unlike email) — and mark the stage once,
 * regardless of whether either channel actually delivered. That mirrors sendEmail's own "log,
 * don't fail" posture for an unconfigured transport (see lib/email.ts) and sendTenantSms's
 * matching one for an unconfigured/misbehaving SMS gateway: a delivery failure must not re-send
 * the same notice on every future tick forever, and one tenant's broken gateway must not stop
 * this batch from reaching every other tenant's candidates.
 */
async function processCandidates(
  candidates: DunningCandidate[],
  stage: 1 | 2 | 3,
  buildMessages: (invoice: DunningCandidate) => DunningMessages
): Promise<{ processed: number; emailSent: number; smsSent: number; smsFailed: number }> {
  let emailSent = 0;
  let smsSent = 0;
  let smsFailed = 0;

  for (const invoice of candidates) {
    const { email, sms } = buildMessages(invoice);

    if (invoice.customer.email) {
      await sendEmail({ to: invoice.customer.email, ...email });
      emailSent += 1;
    }

    try {
      const result = await sendTenantSms(invoice.tenantId, invoice.customer.phone, sms);
      if (result.delivered) smsSent += 1;
      else smsFailed += 1;
    } catch (err) {
      smsFailed += 1;
      console.error(`[dunning] SMS send failed for invoice ${invoice.id}`, err);
    }

    await markDunningStage(invoice.id, stage);
  }

  return { processed: candidates.length, emailSent, smsSent, smsFailed };
}

export async function handleSendDueSoonReminders(): Promise<void> {
  const candidates = await listInvoicesDueSoon();
  const result = await processCandidates(candidates, 1, (invoice) => {
    const amount = formatMoney(balanceDue(invoice), invoice.currency);
    const due = invoice.dueDate.toLocaleDateString();
    return {
      email: {
        subject: `Payment reminder — ${invoice.invoiceNumber} due ${due}`,
        text: `Hi ${invoice.customer.fullName},\n\nA friendly reminder that invoice ${invoice.invoiceNumber} for ${amount} is due on ${due}. Pay before then to keep your service uninterrupted.`,
        html: `<p>Hi ${invoice.customer.fullName},</p><p>A friendly reminder that invoice <strong>${invoice.invoiceNumber}</strong> for <strong>${amount}</strong> is due on ${due}. Pay before then to keep your service uninterrupted.</p>`,
      },
      sms: `Reminder: invoice ${invoice.invoiceNumber} for ${amount} is due ${due}. Pay before then to avoid interruption.`,
    };
  });
  console.log(
    `[dunning] due-soon-reminders: processed=${result.processed} emailSent=${result.emailSent} smsSent=${result.smsSent} smsFailed=${result.smsFailed}`
  );
}

export async function handleSendOverdueNotices(): Promise<void> {
  const candidates = await listOverdueInvoicesNeedingNotice();
  const result = await processCandidates(candidates, 2, (invoice) => {
    const amount = formatMoney(balanceDue(invoice), invoice.currency);
    const due = invoice.dueDate.toLocaleDateString();
    return {
      email: {
        subject: `Overdue — ${invoice.invoiceNumber} needs payment`,
        text: `Hi ${invoice.customer.fullName},\n\nInvoice ${invoice.invoiceNumber} for ${amount} was due on ${due} and is now overdue. Please pay as soon as possible to avoid your service being suspended.`,
        html: `<p>Hi ${invoice.customer.fullName},</p><p>Invoice <strong>${invoice.invoiceNumber}</strong> for <strong>${amount}</strong> was due on ${due} and is now overdue. Please pay as soon as possible to avoid your service being suspended.</p>`,
      },
      sms: `Overdue: invoice ${invoice.invoiceNumber} for ${amount} was due ${due}. Pay now to avoid suspension.`,
    };
  });
  console.log(
    `[dunning] overdue-notices: processed=${result.processed} emailSent=${result.emailSent} smsSent=${result.smsSent} smsFailed=${result.smsFailed}`
  );
}

export async function handleSendFinalDunningNotices(): Promise<void> {
  const candidates = await listInvoicesNeedingFinalNotice();
  const result = await processCandidates(candidates, 3, (invoice) => {
    const amount = formatMoney(balanceDue(invoice), invoice.currency);
    return {
      email: {
        subject: `Final notice — ${invoice.invoiceNumber} will suspend your service tomorrow`,
        text: `Hi ${invoice.customer.fullName},\n\nThis is a final notice: invoice ${invoice.invoiceNumber} for ${amount} remains unpaid, and your internet service will be suspended tomorrow if it isn't settled. Please pay now to avoid interruption.`,
        html: `<p>Hi ${invoice.customer.fullName},</p><p>This is a <strong>final notice</strong>: invoice <strong>${invoice.invoiceNumber}</strong> for <strong>${amount}</strong> remains unpaid, and your internet service will be suspended tomorrow if it isn't settled. Please pay now to avoid interruption.</p>`,
      },
      sms: `FINAL NOTICE: invoice ${invoice.invoiceNumber} for ${amount} is unpaid. Your service will be suspended tomorrow unless you pay now.`,
    };
  });
  console.log(
    `[dunning] final-notices: processed=${result.processed} emailSent=${result.emailSent} smsSent=${result.smsSent} smsFailed=${result.smsFailed}`
  );
}
