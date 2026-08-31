import { Queue } from "bullmq";
import { prisma } from "@mashupkgrid/database";
import { listRunnableJobs, runProvisioningJob } from "@mashupkgrid/radius";
import { QUEUE_NAMES, JOB_NAMES, type SendWhatsappServiceStatusJob } from "@mashupkgrid/shared";
import type { ProvisioningJob } from "@mashupkgrid/database";
import { redis } from "../lib/redis.js";

export interface ProvisioningRunResult {
  processed: number;
  succeeded: number;
  failed: number;
  notified: number;
}

/** Lazily constructed: this module is imported by the worker bootstrap, and opening a queue at
 *  import time would connect to Redis before the process has decided it is starting. */
let whatsappQueue: Queue | null = null;
function getWhatsappQueue(): Queue {
  whatsappQueue ??= new Queue(QUEUE_NAMES.whatsapp, { connection: redis });
  return whatsappQueue;
}

/** Which terminal outcomes are worth telling a customer about (spec section 20). A job still due
 *  for retry is deliberately absent: the system has not finished trying, so there is nothing
 *  truthful to say yet. */
const EVENT_FOR_OPERATION = {
  PROVISION: "ACTIVATED",
  RESTORE: "RESTORED",
  SUSPEND: "SUSPENDED",
  DEPROVISION: "DEPROVISIONED",
} as const;

/**
 * Notifies the subscriber of a terminal provisioning outcome.
 *
 * Best-effort by design: a WhatsApp session that is not connected must not turn a successful
 * provisioning run into a failed one. The customer's internet genuinely is working; failing the
 * job here would queue a second, pointless device operation.
 */
async function notifyCustomer(job: ProvisioningJob, succeeded: boolean): Promise<boolean> {
  try {
    const subscription = await prisma.customerService.findUnique({
      where: { id: job.customerServiceId },
      include: {
        customer: { select: { fullName: true, phone: true } },
        package: { select: { name: true, downloadKbps: true, uploadKbps: true } },
        tenant: { select: { name: true } },
      },
    });
    // No phone number is a perfectly ordinary state (a staff-created account that was never
    // given one) — nothing to send, and not an error.
    if (!subscription?.customer.phone) return false;

    const payload: SendWhatsappServiceStatusJob = {
      tenantId: job.tenantId,
      phone: subscription.customer.phone,
      customerName: subscription.customer.fullName,
      tenantName: subscription.tenant.name,
      event: succeeded ? EVENT_FOR_OPERATION[job.operation] : "FAILED",
      packageName: subscription.package.name,
      downloadKbps: subscription.package.downloadKbps,
      uploadKbps: subscription.package.uploadKbps,
      supportPhone: null,
    };

    await getWhatsappQueue().add(JOB_NAMES.sendWhatsappServiceStatus, payload, {
      removeOnComplete: true,
      removeOnFail: 50,
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 },
    });
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[provisioning] could not queue customer notification for job ${job.id}`, err);
    return false;
  }
}

/**
 * Drains the provisioning queue (spec section 18).
 *
 * Runs jobs one at a time on purpose. Each one opens a real TCP session to a router, and a batch
 * of twenty parallel connections to the same device is a good way to make a working router look
 * like a failing one — the same reasoning the router health poller already uses.
 *
 * Never throws for a failed job. runProvisioningJob records the outcome on the job row itself, so
 * one unreachable router must not abort the whole pass and leave the rest of the queue untouched.
 */
export async function handleRunProvisioningJobs(): Promise<ProvisioningRunResult> {
  const jobs = await listRunnableJobs(20);
  let succeeded = 0;
  let failed = 0;
  let notified = 0;

  for (const job of jobs) {
    try {
      const finished = await runProvisioningJob(job.id);

      if (finished.status === "SUCCEEDED") {
        succeeded++;
        if (await notifyCustomer(finished, true)) notified++;
      } else {
        failed++;
        // Only a job that has exhausted its retries tells the customer anything. One that went
        // back to PENDING will be tried again shortly, and "we hit a problem" followed by
        // "you're online" a minute later is worse than a single accurate message.
        if (finished.status === "FAILED" && (await notifyCustomer(finished, false))) notified++;
      }
    } catch (err) {
      // Only reachable if the job row itself became unreadable mid-pass; the job's own error
      // handling covers every device failure. Logged rather than swallowed, since it means the
      // queue is in a state this code did not anticipate.
      failed++;
      // eslint-disable-next-line no-console
      console.error(`[provisioning] job ${job.id} threw outside its own error handling`, err);
    }
  }

  return { processed: jobs.length, succeeded, failed, notified };
}
