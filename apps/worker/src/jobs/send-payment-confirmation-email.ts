import { sendPaymentConfirmationEmailJobSchema } from "@mashupkgrid/shared";
import { sendEmail } from "../lib/email.js";

function formatMoney(minorUnits: number): string {
  return `KES ${(minorUnits / 100).toFixed(2)}`;
}

export async function handleSendPaymentConfirmationEmail(payload: unknown): Promise<void> {
  const data = sendPaymentConfirmationEmailJobSchema.parse(payload);
  const amount = formatMoney(data.amountMinor);

  await sendEmail({
    to: data.email,
    subject: `Payment received — ${amount}`,
    text: `Hi ${data.customerName},\n\nWe've received your payment of ${amount} (M-Pesa receipt: ${data.receiptNumber}). Thank you!`,
    html: `<p>Hi ${data.customerName},</p><p>We've received your payment of <strong>${amount}</strong> (M-Pesa receipt: ${data.receiptNumber}). Thank you!</p>`,
  });
}
