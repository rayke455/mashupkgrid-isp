import { sendTenantWelcomeEmailJobSchema } from "@mashupkgrid/shared";
import { sendEmail } from "../lib/email.js";

export async function handleSendTenantWelcomeEmail(payload: unknown): Promise<void> {
  const data = sendTenantWelcomeEmailJobSchema.parse(payload);

  const subject = `Welcome to MASHUPKGRID ISP — Your Tenant Credentials for ${data.companyName}`;
  const text = [
    `Hi ${data.ownerName},`,
    "",
    `Your ISP organization "${data.companyName}" has been successfully provisioned on MASHUPKGRID ISP Platform.`,
    "",
    "--- YOUR ACCOUNT & SUBDOMAIN DETAILS ---",
    `• Organization: ${data.companyName}`,
    `• Subdomain: ${data.subdomain}`,
    `• Login Email / Username: ${data.email}`,
    ...(data.temporaryPassword ? [`• Temporary Password: ${data.temporaryPassword}`] : []),
    `• Dashboard Login URL: ${data.dashboardUrl}`,
    `• Captive Portal URL: ${data.portalUrl}`,
    "",
    "Please sign in to your dashboard to complete setting up your routers, hotspot packages, and M-Pesa billing integration.",
    "If you received a temporary password, make sure to change it under your Profile settings upon first login.",
    "",
    "Welcome aboard,",
    "The MASHUPKGRID Team"
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0;">
      <h2 style="color: #6366f1; margin-top: 0;">Welcome to MASHUPKGRID ISP, ${data.ownerName}!</h2>
      <p style="font-size: 15px; line-height: 1.5;">Your ISP organization <strong>${data.companyName}</strong> is now live on the platform.</p>
      
      <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 16px; margin: 20px 0;">
        <h3 style="margin-top: 0; font-size: 14px; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px;">Your Account & Subdomain Details</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Subdomain:</td>
            <td style="padding: 6px 0; font-weight: 600; font-family: monospace;">${data.subdomain}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Username / Email:</td>
            <td style="padding: 6px 0; font-weight: 600;">${data.email}</td>
          </tr>
          ${data.temporaryPassword ? `
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Temporary Password:</td>
            <td style="padding: 6px 0; font-weight: 600; font-family: monospace; color: #4338ca;">${data.temporaryPassword}</td>
          </tr>` : ""}
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Dashboard URL:</td>
            <td style="padding: 6px 0;"><a href="${data.dashboardUrl}" style="color: #6366f1; text-decoration: underline;">${data.dashboardUrl}</a></td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Hotspot Portal:</td>
            <td style="padding: 6px 0;"><a href="${data.portalUrl}" style="color: #6366f1; text-decoration: underline;">${data.portalUrl}</a></td>
          </tr>
        </table>
      </div>

      <div style="text-align: center; margin: 28px 0;">
        <a href="${data.dashboardUrl}" style="background-color: #6366f1; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Access Your Dashboard</a>
      </div>

      <p style="font-size: 13px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 24px;">
        For security, keep this email confidential. If you ever need to reset your password, visit the sign-in page and click "Forgot password".
      </p>
    </div>
  `;

  await sendEmail({
    to: data.email,
    subject,
    text,
    html,
  });
}
