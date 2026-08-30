import nodemailer, { type Transporter } from "nodemailer";
import { env, emailTransportConfigured } from "@mashupkgrid/config";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    });
  }
  return transporter;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Sends a real email via SMTP when credentials are configured. When they are not (e.g. a bare
 * local dev environment), this does NOT pretend the email was sent — it logs the content to
 * the console, clearly labeled, so nothing silently disappears and no one mistakes console
 * output for a delivered email (project instruction §78 — never fake a completed integration).
 */
export async function sendEmail(params: SendEmailParams): Promise<{ delivered: boolean }> {
  if (!emailTransportConfigured) {
    console.warn(
      `[email] SMTP is not configured — email NOT sent. To: ${params.to} | Subject: ${params.subject}\n` +
        `${params.text}`
    );
    return { delivered: false };
  }

  await getTransporter().sendMail({
    from: env.SMTP_FROM,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });
  return { delivered: true };
}
