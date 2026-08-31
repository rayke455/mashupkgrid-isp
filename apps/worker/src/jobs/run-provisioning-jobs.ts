import { listRunnableJobs, runProvisioningJob } from "@mashupkgrid/radius";

export interface ProvisioningRunResult {
  processed: number;
  succeeded: number;
  failed: number;
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

  for (const job of jobs) {
    try {
      const finished = await runProvisioningJob(job.id);
      if (finished.status === "SUCCEEDED") succeeded++;
      else failed++;
    } catch (err) {
      // Only reachable if the job row itself became unreadable mid-pass; the job's own error
      // handling covers every device failure. Logged rather than swallowed, since it means the
      // queue is in a state this code did not anticipate.
      failed++;
      // eslint-disable-next-line no-console
      console.error(`[provisioning] job ${job.id} threw outside its own error handling`, err);
    }
  }

  return { processed: jobs.length, succeeded, failed };
}
