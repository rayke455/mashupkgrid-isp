import { describe, expect, it } from "vitest";
import { AUTOMATION_JOBS, findAutomationJob, isJobStale, nextRunAfter, type AutomationRunRecord } from "../automation.js";
import { JOB_NAMES } from "../queues.js";

const job = findAutomationJob(JOB_NAMES.generateInvoices)!;

function run(finishedAgoMs: number, durationMs = 1000): AutomationRunRecord {
  const finishedAt = Date.now() - finishedAgoMs;
  return {
    job: job.name,
    trigger: "schedule",
    startedAt: new Date(finishedAt - durationMs).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    durationMs,
    ok: true,
    summary: {},
    error: null,
  };
}

describe("automation catalog", () => {
  it("lists every job once, each on a queue the worker consumes", () => {
    const names = AUTOMATION_JOBS.map((j) => j.name);
    expect(new Set(names).size).toBe(names.length);
    for (const j of AUTOMATION_JOBS) {
      expect(j.everyMs).toBeGreaterThan(0);
    }
  });

  it("schedules the next run one interval after the last start, never in the past", () => {
    const now = Date.now();
    expect(nextRunAfter(job, null, now).getTime()).toBe(now);
    const recent = run(5 * 60_000);
    expect(nextRunAfter(job, recent, now).getTime()).toBe(new Date(recent.startedAt).getTime() + job.everyMs);
    const ancient = run(48 * 3_600_000);
    expect(nextRunAfter(job, ancient, now).getTime()).toBe(now);
  });

  it("calls a job stale only after two missed intervals", () => {
    expect(isJobStale(job, null)).toBe(false);
    expect(isJobStale(job, run(90 * 60_000))).toBe(false); // one interval and a half: still fine
    expect(isJobStale(job, run(3 * 3_600_000))).toBe(true);
  });

  it("gives fast jobs at least two minutes of slack", () => {
    const fast = findAutomationJob(JOB_NAMES.runProvisioningJobs)!;
    expect(isJobStale(fast, run(60_000))).toBe(false);
    expect(isJobStale(fast, run(3 * 60_000))).toBe(true);
  });
});
