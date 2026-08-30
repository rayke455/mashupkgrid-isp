import { Queue } from "bullmq";
import { env } from "@mashupkgrid/config";
import {
  QUEUE_NAMES,
  JOB_NAMES,
  type SendVerificationEmailJob,
  type SendPasswordResetEmailJob,
  type SendPaymentConfirmationEmailJob,
  type DeliverWebhookEventJob,
  type SendWhatsappOtpJob,
  type SendWhatsappVoucherJob,
  type SendWhatsappTenantWelcomeJob,
  type WhatsappConnectJob,
  type WhatsappDisconnectJob,
} from "@mashupkgrid/shared";

const connection = { url: env.REDIS_URL };

const emailQueue = new Queue(QUEUE_NAMES.email, { connection });
const webhooksQueue = new Queue(QUEUE_NAMES.webhooks, { connection });
const whatsappQueue = new Queue(QUEUE_NAMES.whatsapp, { connection });

export async function enqueueSendVerificationEmail(data: SendVerificationEmailJob): Promise<void> {
  await emailQueue.add(JOB_NAMES.sendVerificationEmail, data, {
    attempts: 5,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });
}

export async function enqueueSendPasswordResetEmail(data: SendPasswordResetEmailJob): Promise<void> {
  await emailQueue.add(JOB_NAMES.sendPasswordResetEmail, data, {
    attempts: 5,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });
}

export async function enqueueSendPaymentConfirmationEmail(data: SendPaymentConfirmationEmailJob): Promise<void> {
  await emailQueue.add(JOB_NAMES.sendPaymentConfirmationEmail, data, {
    attempts: 5,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });
}

export async function enqueueDeliverWebhookEvent(data: DeliverWebhookEventJob): Promise<void> {
  await webhooksQueue.add(JOB_NAMES.deliverWebhookEvent, data, {
    attempts: 4,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: 1000,
    removeOnFail: 2000,
  });
}

/** Pairing is interactive — someone is watching the dashboard for a QR right now — so this runs
 *  once and fails fast rather than retrying into a window nobody is still watching. */
export async function enqueueWhatsappConnect(data: WhatsappConnectJob): Promise<void> {
  await whatsappQueue.add(JOB_NAMES.whatsappConnect, data, {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 100,
  });
}

export async function enqueueWhatsappDisconnect(data: WhatsappDisconnectJob): Promise<void> {
  await whatsappQueue.add(JOB_NAMES.whatsappDisconnect, data, {
    attempts: 2,
    removeOnComplete: 100,
    removeOnFail: 100,
  });
}

/** Retries harder than the OTP job below: unlike a 10-minute code, a voucher a customer has
 *  already paid for stays valid, so it's always worth continuing to try to deliver it. */
export async function enqueueSendWhatsappVoucher(data: SendWhatsappVoucherJob): Promise<void> {
  await whatsappQueue.add(JOB_NAMES.sendWhatsappVoucher, data, {
    attempts: 6,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });
}

export async function enqueueSendWhatsappTenantWelcome(data: SendWhatsappTenantWelcomeJob): Promise<void> {
  await whatsappQueue.add(JOB_NAMES.sendWhatsappTenantWelcome, data, {
    attempts: 6,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });
}

export async function enqueueSendWhatsappOtp(data: SendWhatsappOtpJob): Promise<void> {
  // Fewer/faster retries than the email jobs above — the code is only valid for 10 minutes
  // (whatsapp-otp.ts's CODE_TTL_SECONDS), so retrying for the email jobs' usual ~2.5 minutes of
  // backoff is fine, but there's no point retrying a stale code delivery well past its own expiry.
  await whatsappQueue.add(JOB_NAMES.sendWhatsappOtp, data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: 1000,
    removeOnFail: 2000,
  });
}
