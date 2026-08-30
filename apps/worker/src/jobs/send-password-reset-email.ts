import { env } from "@mashupkgrid/config";
import { sendPasswordResetEmailJobSchema } from "@mashupkgrid/shared";
import { sendEmail } from "../lib/email.js";

export async function handleSendPasswordResetEmail(payload: unknown): Promise<void> {
  const data = sendPasswordResetEmailJobSchema.parse(payload);
  const resetUrl = `${env.APP_WEB_URL}/reset-password?token=${encodeURIComponent(data.resetToken)}`;

  await sendEmail({
    to: data.email,
    subject: "Reset your MASHUPKGRID ISP password",
    text: `A password reset was requested for your account. Reset it here: ${resetUrl}\n\nThis link expires in 1 hour. If you did not request this, you can ignore this email.`,
    html: `<p>A password reset was requested for your account.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p>`,
  });
}
