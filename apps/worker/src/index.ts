import { handleRunProvisioningJobs } from "./jobs/run-provisioning-jobs.js";
import { Worker, Queue } from "bullmq";
import { env } from "@mashupkgrid/config";
import { QUEUE_NAMES, JOB_NAMES } from "@mashupkgrid/shared";
import { handleSendVerificationEmail } from "./jobs/send-verification-email.js";
import { handleSendPasswordResetEmail } from "./jobs/send-password-reset-email.js";
import { handleSendPaymentConfirmationEmail } from "./jobs/send-payment-confirmation-email.js";
import { handleApplyScheduledMaintenance } from "./jobs/apply-scheduled-maintenance.js";
import { handleCleanupExpiredTokens } from "./jobs/cleanup-expired-tokens.js";
import {
  handleGenerateInvoices,
  handleMarkOverdueInvoices,
  handleSuspendOverdueCustomers,
  handleReactivateClearedCustomers,
} from "./jobs/billing-cycle.js";
import { handleExpireTrials } from "./jobs/expire-trials.js";
import { handlePollPendingStkRequests } from "./jobs/poll-pending-stk-requests.js";
import {
  handleRetryPendingSyncTasks,
  handleExpireOverdueVouchers,
  handlePollRouterHealth,
} from "./jobs/network-sync.js";
import {
  handleSendDueSoonReminders,
  handleSendOverdueNotices,
  handleSendFinalDunningNotices,
} from "./jobs/dunning.js";
import { handleDeliverWebhook } from "./jobs/deliver-webhook.js";
import { handleSendWhatsappOtp } from "./jobs/send-whatsapp-otp.js";
import {
  handleSendWhatsappVoucher,
  handleSendWhatsappTenantWelcome,
  handleSendWhatsappServiceStatus,
} from "./jobs/whatsapp-notifications.js";
import { createGracefulShutdown } from "./lib/shutdown.js";
import { startRadiusServer } from "@mashupkgrid/radius";
import { whatsappConnectJobSchema, whatsappDisconnectJobSchema } from "@mashupkgrid/shared";
import { setConnectionStatus, clearPairingQr } from "@mashupkgrid/whatsapp";
import { startWhatsAppRuntime, getManager } from "./lib/whatsapp-runtime.js";

const connection = { url: env.REDIS_URL };

async function main() {
  const emailWorker = new Worker(
    QUEUE_NAMES.email,
    async (job) => {
      switch (job.name) {
        case JOB_NAMES.sendVerificationEmail:
          return handleSendVerificationEmail(job.data);
        case JOB_NAMES.sendPasswordResetEmail:
          return handleSendPasswordResetEmail(job.data);
        case JOB_NAMES.sendPaymentConfirmationEmail:
          return handleSendPaymentConfirmationEmail(job.data);
        default:
          throw new Error(`Unknown job in queue "${QUEUE_NAMES.email}": ${job.name}`);
      }
    },
    { connection, concurrency: env.WORKER_CONCURRENCY }
  );

  const maintenanceWorker = new Worker(
    QUEUE_NAMES.maintenance,
    async (job) => {
      if (job.name === JOB_NAMES.applyScheduledMaintenance) {
        return handleApplyScheduledMaintenance();
      }
      throw new Error(`Unknown job in queue "${QUEUE_NAMES.maintenance}": ${job.name}`);
    },
    { connection, concurrency: 1 }
  );

  const cleanupWorker = new Worker(
    QUEUE_NAMES.cleanup,
    async (job) => {
      if (job.name === JOB_NAMES.cleanupExpiredTokens) {
        return handleCleanupExpiredTokens();
      }
      throw new Error(`Unknown job in queue "${QUEUE_NAMES.cleanup}": ${job.name}`);
    },
    { connection, concurrency: 1 }
  );

  const billingWorker = new Worker(
    QUEUE_NAMES.billing,
    async (job) => {
      switch (job.name) {
        case JOB_NAMES.generateInvoices:
          return handleGenerateInvoices();
        case JOB_NAMES.markOverdueInvoices:
          return handleMarkOverdueInvoices();
        case JOB_NAMES.suspendOverdueCustomers:
          return handleSuspendOverdueCustomers();
        case JOB_NAMES.reactivateClearedCustomers:
          return handleReactivateClearedCustomers();
        case JOB_NAMES.sendDueSoonReminders:
          return handleSendDueSoonReminders();
        case JOB_NAMES.sendOverdueNotices:
          return handleSendOverdueNotices();
        case JOB_NAMES.sendFinalDunningNotices:
          return handleSendFinalDunningNotices();
        case JOB_NAMES.expireTrials:
          return handleExpireTrials();
        default:
          throw new Error(`Unknown job in queue "${QUEUE_NAMES.billing}": ${job.name}`);
      }
    },
    // concurrency 1: billing-cycle jobs mutate shared financial state (invoices, subscription
    // status) without row locking — see the concurrency note in
    // packages/billing/src/billing-cycle.service.ts.
    { connection, concurrency: 1 }
  );

  const mpesaWorker = new Worker(
    QUEUE_NAMES.mpesa,
    async (job) => {
      if (job.name === JOB_NAMES.pollPendingStkRequests) {
        return handlePollPendingStkRequests();
      }
      throw new Error(`Unknown job in queue "${QUEUE_NAMES.mpesa}": ${job.name}`);
    },
    { connection, concurrency: 1 }
  );

  const networkWorker = new Worker(
    QUEUE_NAMES.network,
    async (job) => {
      switch (job.name) {
        case JOB_NAMES.retryPendingSyncTasks:
          return handleRetryPendingSyncTasks();
        case JOB_NAMES.runProvisioningJobs:
          return handleRunProvisioningJobs();
        case JOB_NAMES.expireOverdueVouchers:
          return handleExpireOverdueVouchers();
        case JOB_NAMES.pollRouterHealth:
          return handlePollRouterHealth();
        default:
          throw new Error(`Unknown job in queue "${QUEUE_NAMES.network}": ${job.name}`);
      }
    },
    // concurrency 1: router polling opens real TCP sockets to routers one at a time rather than
    // stampeding every router on the platform at once.
    { connection, concurrency: 1 }
  );

  const webhooksWorker = new Worker(
    QUEUE_NAMES.webhooks,
    async (job) => {
      if (job.name === JOB_NAMES.deliverWebhookEvent) {
        return handleDeliverWebhook(job.data);
      }
      throw new Error(`Unknown job in queue "${QUEUE_NAMES.webhooks}": ${job.name}`);
    },
    // Outbound HTTP to arbitrary third-party endpoints — a few concurrent deliveries in flight
    // is fine, unlike router polling which deliberately serializes against real hardware.
    { connection, concurrency: 5 }
  );

  for (const worker of [
    emailWorker,
    maintenanceWorker,
    cleanupWorker,
    billingWorker,
    mpesaWorker,
    networkWorker,
    webhooksWorker,
  ]) {
    worker.on("failed", (job, err) => {
      console.error(`[worker] job ${job?.queueName}/${job?.name} (${job?.id}) failed:`, err);
    });
    worker.on("completed", (job) => {
      console.log(`[worker] job ${job.queueName}/${job.name} (${job.id}) completed`);
    });
  }

  // Repeatable jobs: the scheduler. `apply-scheduled-maintenance` runs every minute
  // (CRITICAL — must keep running under maintenance itself); `cleanup-expired-tokens` runs
  // daily (NON-CRITICAL).
  const maintenanceQueue = new Queue(QUEUE_NAMES.maintenance, { connection });
  const cleanupQueue = new Queue(QUEUE_NAMES.cleanup, { connection });
  const billingQueue = new Queue(QUEUE_NAMES.billing, { connection });
  const mpesaQueue = new Queue(QUEUE_NAMES.mpesa, { connection });
  const networkQueue = new Queue(QUEUE_NAMES.network, { connection });

  await maintenanceQueue.add(
    JOB_NAMES.applyScheduledMaintenance,
    {},
    { repeat: { every: 60_000 }, removeOnComplete: true, removeOnFail: 100 }
  );
  await cleanupQueue.add(
    JOB_NAMES.cleanupExpiredTokens,
    {},
    { repeat: { every: 24 * 60 * 60_000 }, removeOnComplete: true, removeOnFail: 20 }
  );
  // Billing cycle: check hourly for due renewals/overdue invoices/suspensions rather than
  // daily — a tenant with DAILY-billing packages needs finer granularity than once a day.
  await billingQueue.add(
    JOB_NAMES.generateInvoices,
    {},
    { repeat: { every: 60 * 60_000 }, removeOnComplete: true, removeOnFail: 50 }
  );
  await billingQueue.add(
    JOB_NAMES.markOverdueInvoices,
    {},
    { repeat: { every: 60 * 60_000 }, removeOnComplete: true, removeOnFail: 50 }
  );
  await billingQueue.add(
    JOB_NAMES.suspendOverdueCustomers,
    {},
    { repeat: { every: 60 * 60_000 }, removeOnComplete: true, removeOnFail: 50 }
  );
  await billingQueue.add(
    JOB_NAMES.reactivateClearedCustomers,
    {},
    { repeat: { every: 60 * 60_000 }, removeOnComplete: true, removeOnFail: 50 }
  );
  // Dunning: hourly, same cadence as the rest of the billing cycle — each stage is idempotent
  // (dunningStage only moves forward), so running more often than the underlying data changes
  // is harmless, just a no-op most ticks.
  await billingQueue.add(
    JOB_NAMES.sendDueSoonReminders,
    {},
    { repeat: { every: 60 * 60_000 }, removeOnComplete: true, removeOnFail: 50 }
  );
  await billingQueue.add(
    JOB_NAMES.sendOverdueNotices,
    {},
    { repeat: { every: 60 * 60_000 }, removeOnComplete: true, removeOnFail: 50 }
  );
  await billingQueue.add(
    JOB_NAMES.sendFinalDunningNotices,
    {},
    { repeat: { every: 60 * 60_000 }, removeOnComplete: true, removeOnFail: 50 }
  );
  // Same hourly cadence as the rest of the billing cycle — a trial ending mid-hour gets caught
  // on the next tick, same tolerance already accepted for overdue-customer suspension.
  await billingQueue.add(
    JOB_NAMES.expireTrials,
    {},
    { repeat: { every: 60 * 60_000 }, removeOnComplete: true, removeOnFail: 50 }
  );
  // Every 2 minutes: covers the "delayed callback" case without hammering Safaricom's Query API.
  await mpesaQueue.add(
    JOB_NAMES.pollPendingStkRequests,
    {},
    { repeat: { every: 2 * 60_000 }, removeOnComplete: true, removeOnFail: 100 }
  );
  // Every 30 seconds: a suspended customer's active PPPoE session should get kicked promptly,
  // not sit connected for up to an hour waiting on the next billing-cycle tick.
  await networkQueue.add(
    JOB_NAMES.retryPendingSyncTasks,
    {},
    { repeat: { every: 30_000 }, removeOnComplete: true, removeOnFail: 100 }
  );
  // Every 60 seconds: routers are polled far more often than the billing/mpesa jobs since
  // "is the router still up" is what the dashboard's live status badge reflects — the web UI
  // polls the routers list every few seconds, so this is the freshness bound on what it shows.
  // Every 20 seconds: this is the delay between a customer paying and their internet coming back
  // on, so it is deliberately the tightest interval in this file. Jobs run one at a time inside
  // the handler, so a short interval does not mean many concurrent router connections.
  await networkQueue.add(
    JOB_NAMES.runProvisioningJobs,
    {},
    { repeat: { every: 20_000 }, removeOnComplete: true, removeOnFail: 100 }
  );
  await networkQueue.add(
    JOB_NAMES.pollRouterHealth,
    {},
    { repeat: { every: 60_000 }, removeOnComplete: true, removeOnFail: 50 }
  );
  await networkQueue.add(
    JOB_NAMES.expireOverdueVouchers,
    {},
    { repeat: { every: 60_000 }, removeOnComplete: true, removeOnFail: 100 }
  );

  console.log("[worker] MASHUPKGRID ISP worker started. Queues:", Object.values(QUEUE_NAMES).join(", "));

  const radiusServer = env.ENABLE_EMBEDDED_RADIUS_SERVER
    ? startRadiusServer({ authPort: env.RADIUS_AUTH_PORT, acctPort: env.RADIUS_ACCT_PORT })
    : null;

  // Owns every WhatsApp session (one per linked tenant, plus the platform line) and restores
  // whatever was connected before this restart — see lib/whatsapp-runtime.ts.
  const whatsappManager = await startWhatsAppRuntime();

  const whatsappWorker = new Worker(
    QUEUE_NAMES.whatsapp,
    async (job) => {
      // Each handler resolves its own socket through the runtime rather than being handed one:
      // sockets are replaced on every reconnect, so anything captured up front goes stale.
      if (job.name === JOB_NAMES.sendWhatsappOtp) return handleSendWhatsappOtp(job.data);
      if (job.name === JOB_NAMES.sendWhatsappVoucher) return handleSendWhatsappVoucher(job.data);
      if (job.name === JOB_NAMES.sendWhatsappTenantWelcome) return handleSendWhatsappTenantWelcome(job.data);
      if (job.name === JOB_NAMES.sendWhatsappServiceStatus) return handleSendWhatsappServiceStatus(job.data);

      if (job.name === JOB_NAMES.whatsappConnect) {
        const { tenantId, pairWithPhoneNumber } = whatsappConnectJobSchema.parse(job.data);
        try {
          // NOT optional-chained. `getManager()?.start(...)` silently does nothing when the
          // runtime failed to come up, so the job completes successfully, no QR is ever
          // published, and the dashboard sits on "Waiting for scan" forever with an empty
          // lastError — the operator has no way to tell a broken runtime from a slow one.
          const manager = getManager();
          if (!manager) {
            throw new Error(
              "WhatsApp runtime is not running in this worker — check the worker's startup logs"
            );
          }
          await manager.start(tenantId, { pairWithPhoneNumber });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await setConnectionStatus(tenantId, "DISCONNECTED", { lastError: message });
          throw err;
        }
        return;
      }

      if (job.name === JOB_NAMES.whatsappDisconnect) {
        const { tenantId } = whatsappDisconnectJobSchema.parse(job.data);
        await getManager()?.stop(tenantId);
        await clearPairingQr(tenantId);
        await setConnectionStatus(tenantId, "DISCONNECTED", { lastError: null });
        return;
      }
    },
    { connection }
  );

  const shutdown = createGracefulShutdown(
    [
      () => whatsappManager.stopAll().catch(() => {}),
      () => emailWorker.close(),
      () => maintenanceWorker.close(),
      () => cleanupWorker.close(),
      () => billingWorker.close(),
      () => mpesaWorker.close(),
      () => networkWorker.close(),
      () => webhooksWorker.close(),
      () => whatsappWorker.close(),
      () => radiusServer?.close() ?? Promise.resolve(),
    ],
    (code) => process.exit(code),
    { log: console.log }
  );
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[worker] fatal startup error", err);
  process.exit(1);
});
