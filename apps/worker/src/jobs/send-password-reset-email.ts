import { env } from "@mashupkgrid/config";
import { sendPasswordResetEmailJobSchema } from "@mashupkgrid/shared";
import { sendEmail } from "../lib/email.js";

export async function handleSendPasswordResetEmail(payload: unknown): Promise<void> {
  const data = sendPasswordResetEmailJobSchema.parse(payload);
  const resetUrl = `${env.APP_WEB_URL}/reset-password?token=${encodeURIComponent(data.resetToken)}`;

  const subject = "Reset your MASHUPKGRID ISP password";
  const text = [
    "Password Reset Request",
    "",
    "We received a request to reset your password for your MASHUPKGRID ISP account.",
    "",
    `Reset your password by opening this link in your browser:`,
    resetUrl,
    "",
    "This link will expire in 1 hour.",
    "If you did not request a password reset, please ignore this email. Your password will remain unchanged.",
    "",
    "— The MASHUPKGRID Team",
    "https://mashuphost.tech"
  ].join("\n");

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset your password</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
      <div style="max-width: 560px; margin: 32px auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
        <div style="background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%); padding: 28px 32px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">MASHUPKGRID ISP</h1>
          <p style="color: #c7d2fe; margin: 6px 0 0 0; font-size: 13px;">Security & Account Management</p>
        </div>
        <div style="padding: 32px;">
          <h2 style="font-size: 18px; color: #0f172a; margin-top: 0; font-weight: 600;">Reset your password</h2>
          <p style="font-size: 14px; line-height: 1.6; color: #475569;">
            We received a request to reset the password for your account (<strong>${data.email}</strong>). Click the button below to choose a new password:
          </p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${resetUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 28px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px; display: inline-block; box-shadow: 0 2px 4px rgba(79, 70, 229, 0.3);">
              Reset Password
            </a>
          </div>
          <p style="font-size: 13px; line-height: 1.6; color: #64748b; margin-bottom: 24px;">
            This link is valid for <strong>1 hour</strong>. If the button above doesn't work, copy and paste this link into your browser:
            <br>
            <a href="${resetUrl}" style="color: #4f46e5; word-break: break-all; font-size: 12px;">${resetUrl}</a>
          </p>
          <div style="border-top: 1px solid #f1f5f9; padding-top: 20px;">
            <p style="font-size: 12px; line-height: 1.5; color: #94a3b8; margin: 0;">
              If you didn't request a password reset, you can safely ignore this email. Your account remains secure and no changes have been made.
            </p>
          </div>
        </div>
        <div style="background-color: #f8fafc; padding: 16px 32px; text-align: center; border-top: 1px solid #f1f5f9;">
          <p style="font-size: 12px; color: #94a3b8; margin: 0;">
            &copy; ${new Date().getFullYear()} MASHUPKGRID ISP Platform &bull; <a href="https://mashuphost.tech" style="color: #64748b; text-decoration: none;">mashuphost.tech</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendEmail({
    to: data.email,
    subject,
    text,
    html,
  });
}
