import { env } from "@mashupkgrid/config";
import { sendVerificationEmailJobSchema } from "@mashupkgrid/shared";
import { sendEmail } from "../lib/email.js";

export async function handleSendVerificationEmail(payload: unknown): Promise<void> {
  const data = sendVerificationEmailJobSchema.parse(payload);
  const verifyUrl = `${env.APP_WEB_URL}/verify-email?token=${encodeURIComponent(data.verificationToken)}`;

  await sendEmail({
    to: data.email,
    subject: "Verify your MASHUPKGRID ISP account",
    text: `Welcome to MASHUPKGRID ISP. Verify your email by visiting: ${verifyUrl}\n\nThis link expires in 24 hours.`,
    html: `<p>Welcome to MASHUPKGRID ISP.</p><p><a href="${verifyUrl}">Verify your email</a></p><p>This link expires in 24 hours.</p>`,
  });
}
