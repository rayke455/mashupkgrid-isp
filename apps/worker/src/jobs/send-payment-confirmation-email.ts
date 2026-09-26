import { sendPaymentConfirmationEmailJobSchema } from "@mashupkgrid/shared";
import { findPaymentIdByReference, renderReceiptPdf } from "@mashupkgrid/billing";
import { sendEmail, type EmailAttachment } from "../lib/email.js";

function formatMoney(minorUnits: number): string {
  return `KES ${(minorUnits / 100).toFixed(2)}`;
}

export async function handleSendPaymentConfirmationEmail(payload: unknown): Promise<void> {
  const data = sendPaymentConfirmationEmailJobSchema.parse(payload);
  const amount = formatMoney(data.amountMinor);

  // Attach the receipt as a PDF when the payment can be found; the email goes out either way.
  let attachments: EmailAttachment[] | undefined;
  if (data.tenantId) {
    try {
      const paymentId = await findPaymentIdByReference(data.tenantId, data.receiptNumber);
      if (paymentId) {
        const pdf = await renderReceiptPdf(data.tenantId, paymentId);
        attachments = [{ filename: pdf.filename, content: pdf.bytes, contentType: "application/pdf" }];
      }
    } catch (err) {
      console.warn(`[payments] receipt PDF for ${data.receiptNumber} could not be generated`, err);
    }
  }

  await sendEmail({
    to: data.email,
    subject: `Payment received — ${amount}`,
    text: `Hi ${data.customerName},\n\nWe've received your payment of ${amount} (reference: ${data.receiptNumber}). ${attachments ? "Your receipt is attached. " : ""}Thank you!`,
    html: `<p>Hi ${data.customerName},</p><p>We've received your payment of <strong>${amount}</strong> (reference: ${data.receiptNumber}). ${attachments ? "Your receipt is attached. " : ""}Thank you!</p>`,
    attachments,
  });
}
