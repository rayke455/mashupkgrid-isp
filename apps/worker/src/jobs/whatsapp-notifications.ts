import {
  sendWhatsappVoucherJobSchema,
  sendWhatsappTenantWelcomeJobSchema,
} from "@mashupkgrid/shared";
import { sendWhatsAppMessage, type WASocket } from "@mashupkgrid/whatsapp";
import { resolveSocket } from "../lib/whatsapp-runtime.js";
import { formatMoney, formatDuration } from "../lib/format.js";

/** Same contract as send-whatsapp-otp.ts: a missing session is a real failure (retried with
 *  backoff) rather than a silent no-op, so an undelivered message is visible instead of lost. */
function requireSocket(tenantId: string | null): WASocket {
  const sock = resolveSocket(tenantId);
  if (!sock) {
    throw new Error("No connected WhatsApp session available — cannot send notification");
  }
  return sock;
}

/**
 * Delivers a freshly-purchased hotspot voucher to the customer who just paid. Branded with the
 * ISP's own company name rather than this platform's: the customer bought Wi-Fi from that ISP and
 * has no relationship with (or awareness of) the billing platform underneath.
 */
export async function handleSendWhatsappVoucher(payload: unknown): Promise<void> {
  const data = sendWhatsappVoucherJobSchema.parse(payload);
  const socket = requireSocket(data.tenantId);

  const lines = [
    `🎉 Thank you for choosing *${data.tenantName}*!`,
    "",
    "Your Wi-Fi voucher is ready:",
    "",
    `🔑 Code: *${data.voucherCode}*`,
  ];
  if (data.packageName) lines.push(`📦 Plan: ${data.packageName}`);
  if (data.durationMinutes) lines.push(`⏱️ Valid for: ${formatDuration(data.durationMinutes)}`);
  if (data.dataCapMb) lines.push(`📶 Data: ${data.dataCapMb} MB`);
  lines.push(`💰 Paid: ${formatMoney(data.amountMinor, data.currency)}`);
  lines.push(
    "",
    "Connect to the Wi-Fi network and enter this code to get online.",
    "",
    `We appreciate your business — enjoy your browsing! 🚀`
  );

  await sendWhatsAppMessage(socket, data.phone, lines.join("\n"));
}

/**
 * Welcomes a new ISP owner right after their tenant is provisioned, with the username they'll
 * sign in with and where to sign in.
 *
 * Deliberately does NOT include their password. The plaintext is only ever briefly in memory
 * during registration (it's Argon2-hashed before storage, so it is not retrievable afterwards
 * even if we wanted it), and putting a live credential into a WhatsApp thread would persist it
 * in the phone's chat history and its cloud backups, and in this job's payload sitting in Redis —
 * turning a password the owner alone knows into one that leaks with any of those. The owner just
 * chose that password moments earlier, and the reset link covers forgetting it.
 */
export async function handleSendWhatsappTenantWelcome(payload: unknown): Promise<void> {
  const data = sendWhatsappTenantWelcomeJobSchema.parse(payload);
  const socket = requireSocket(data.tenantId);

  const message = [
    `🎉 Welcome aboard, ${data.ownerName}!`,
    "",
    `*${data.companyName}* is now live on MASHUPKGRID ISP.`,
    "",
    `👤 Username: ${data.username}`,
    `🔗 Dashboard: ${data.dashboardUrl}`,
    `🌐 Your captive portal: ${data.portalUrl}`,
    "",
    "🔐 Sign in with the password you just created. For your security we never send passwords over WhatsApp — use \"Forgot password\" on the sign-in page if you ever need to reset it.",
    "",
    "Thank you for trusting us to power your network. Let's get your subscribers online! 🚀",
  ].join("\n");

  await sendWhatsAppMessage(socket, data.phone, message);
}
