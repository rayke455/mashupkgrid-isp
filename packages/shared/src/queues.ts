import { z } from "zod";

/**
 * Shared queue-name and job-payload contract between `apps/api` (producer) and `apps/worker`
 * (consumer) — both import from here so the payload shape can never drift between enqueue and
 * process (docs/architecture/05-maintenance-and-queues.md).
 */
export const QUEUE_NAMES = {
  email: "email",
  maintenance: "maintenance",
  cleanup: "cleanup",
  billing: "billing",
  mpesa: "mpesa",
  network: "network",
  webhooks: "webhooks",
  whatsapp: "whatsapp",
} as const;

export const sendVerificationEmailJobSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  verificationToken: z.string(),
});
export type SendVerificationEmailJob = z.infer<typeof sendVerificationEmailJobSchema>;

export const sendPasswordResetEmailJobSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  resetToken: z.string(),
});
export type SendPasswordResetEmailJob = z.infer<typeof sendPasswordResetEmailJobSchema>;

export const sendPaymentConfirmationEmailJobSchema = z.object({
  email: z.string().email(),
  customerName: z.string(),
  amountMinor: z.number().int(),
  receiptNumber: z.string(),
});
export type SendPaymentConfirmationEmailJob = z.infer<typeof sendPaymentConfirmationEmailJobSchema>;

export const applyScheduledMaintenanceJobSchema = z.object({});
export type ApplyScheduledMaintenanceJob = z.infer<typeof applyScheduledMaintenanceJobSchema>;

export const cleanupExpiredTokensJobSchema = z.object({});
export type CleanupExpiredTokensJob = z.infer<typeof cleanupExpiredTokensJobSchema>;

/** `code` travels as plaintext here (worker -> WhatsApp) since the worker is the only place
 *  that actually has to speak it to the user — the API process that enqueues this never persists
 *  the plaintext itself, only its hash (see apps/api's whatsapp-otp.ts), matching how
 *  emailVerificationToken/passwordResetToken already only ever store a hash. */
export const sendWhatsappOtpJobSchema = z.object({
  /** Which tenant's WhatsApp session sends this. Null for platform-level messages that belong to
   *  no particular ISP — notably ISP-registration OTPs, which are sent *before* the tenant that
   *  would own a session exists at all. */
  tenantId: z.string().uuid().nullable(),
  phone: z.string(),
  code: z.string().length(6),
});
export type SendWhatsappOtpJob = z.infer<typeof sendWhatsappOtpJobSchema>;

/** Sent to a hotspot customer the moment their payment completes — their voucher code plus a
 *  thank-you branded with the ISP's own company name (never this platform's), since to that
 *  customer the ISP *is* the brand they bought from. */
export const sendWhatsappVoucherJobSchema = z.object({
  tenantId: z.string().uuid(),
  phone: z.string(),
  voucherCode: z.string(),
  /** The tenant's (ISP's) company name — what the customer actually recognizes. */
  tenantName: z.string(),
  packageName: z.string().nullable(),
  amountMinor: z.number().int(),
  currency: z.string(),
  durationMinutes: z.number().int().nullable(),
  dataCapMb: z.number().int().nullable(),
});
export type SendWhatsappVoucherJob = z.infer<typeof sendWhatsappVoucherJobSchema>;

/** Sent to a new ISP owner right after their tenant is created. Deliberately carries the
 *  username but NOT the password — see the handler for why that line is drawn here. */
export const sendWhatsappTenantWelcomeJobSchema = z.object({
  /** Null like the OTP above: a brand-new ISP has not linked a WhatsApp account yet, so their
   *  own welcome message can only go out over the platform session. */
  tenantId: z.string().uuid().nullable(),
  phone: z.string(),
  ownerName: z.string(),
  companyName: z.string(),
  username: z.string(),
  dashboardUrl: z.string(),
  portalUrl: z.string(),
});
export type SendWhatsappTenantWelcomeJob = z.infer<typeof sendWhatsappTenantWelcomeJobSchema>;

/** Pairing is driven from the dashboard but can only happen in the worker (the only process that
 *  holds WhatsApp sockets), so the API asks for it through the queue rather than doing it. */
export const whatsappConnectJobSchema = z.object({ tenantId: z.string().uuid().nullable() });
export type WhatsappConnectJob = z.infer<typeof whatsappConnectJobSchema>;

export const whatsappDisconnectJobSchema = z.object({ tenantId: z.string().uuid().nullable() });
export type WhatsappDisconnectJob = z.infer<typeof whatsappDisconnectJobSchema>;

export const deliverWebhookEventJobSchema = z.object({
  webhookEndpointId: z.string().uuid(),
  eventType: z.string(),
  payload: z.record(z.unknown()),
});
export type DeliverWebhookEventJob = z.infer<typeof deliverWebhookEventJobSchema>;

export const JOB_NAMES = {
  sendVerificationEmail: "send-verification-email",
  sendPasswordResetEmail: "send-password-reset-email",
  sendPaymentConfirmationEmail: "send-payment-confirmation-email",
  applyScheduledMaintenance: "apply-scheduled-maintenance",
  cleanupExpiredTokens: "cleanup-expired-tokens",
  // Phase 2 — core ISP billing (docs/architecture/09-phase2-plan.md). Each is CRITICAL-adjacent
  // (financial state) so the worker runs them regardless of maintenance level, same as
  // apply-scheduled-maintenance.
  generateInvoices: "generate-invoices",
  markOverdueInvoices: "mark-overdue-invoices",
  suspendOverdueCustomers: "suspend-overdue-customers",
  reactivateClearedCustomers: "reactivate-cleared-customers",
  // Trial lifecycle — same billing queue/cadence as customer suspension, since it's the same
  // shape of concern one level up (tenant, not customer).
  expireTrials: "expire-trials",
  // Phase 3 — M-Pesa (docs/architecture/10-phase3-plan.md).
  pollPendingStkRequests: "poll-pending-stk-requests",
  // Phase 4 — network/MikroTik/RADIUS (docs/architecture/13-phase4-plan.md).
  retryPendingSyncTasks: "retry-pending-sync-tasks",
  pollRouterHealth: "poll-router-health",
  expireOverdueVouchers: "expire-overdue-vouchers",
  // Dunning — escalating payment reminders ahead of suspendOverdueCustomers, not just the
  // status flip itself.
  sendDueSoonReminders: "send-due-soon-reminders",
  sendOverdueNotices: "send-overdue-notices",
  sendFinalDunningNotices: "send-final-dunning-notices",
  // Developer platform — outbound webhook delivery, one job per (endpoint, event) pair, enqueued
  // by the API and consumed by the worker so a slow/unreachable third-party endpoint can never
  // add latency to the request that triggered the event.
  deliverWebhookEvent: "deliver-webhook-event",
  sendWhatsappOtp: "send-whatsapp-otp",
  sendWhatsappVoucher: "send-whatsapp-voucher",
  sendWhatsappTenantWelcome: "send-whatsapp-tenant-welcome",
  whatsappConnect: "whatsapp-connect",
  whatsappDisconnect: "whatsapp-disconnect",
} as const;

/** Webhook event types a tenant can subscribe an endpoint to. Kept in `shared` (not just the API)
 *  so the worker's delivery job and any future consumer validate against the same catalog. Only
 *  events actually emitted somewhere in apps/api belong here — see the `emitWebhookEvent` call
 *  sites for where each one fires. */
export const WEBHOOK_EVENT_TYPES = ["customer.created", "payment.received"] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];
