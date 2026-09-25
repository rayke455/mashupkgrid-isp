import {
  AUTOMATION_KEYS,
  RUN_HISTORY_LIMIT,
  WORKER_HEARTBEAT_MS,
  type AutomationRunRecord,
  type AutomationSummary,
  type AutomationTrigger,
} from "@mashupkgrid/shared";
import { redis } from "./redis.js";

/**
 * Leaves a record of every scheduled run in Redis for the dashboard's automation page.
 *
 * Before this, the only trace of the worker doing its job was a console line, so an operator
 * whose customers were not being suspended (or reactivated) had no way to tell "the worker is
 * down" from "nothing was due". The record is deliberately small — counters, not rows — because
 * the rows themselves already live in Postgres (invoices, provisioning jobs, sync tasks) and the
 * page links there for detail.
 *
 * Best-effort: Redis being briefly unavailable must never fail a billing run that already
 * committed. Errors here are logged and swallowed.
 */
export async function recordJobRun(
  job: string,
  trigger: AutomationTrigger,
  handler: () => Promise<AutomationSummary | void>
): Promise<AutomationSummary> {
  const started = Date.now();
  let summary: AutomationSummary = {};
  let error: string | null = null;
  try {
    summary = (await handler()) ?? {};
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  const finished = Date.now();
  const record: AutomationRunRecord = {
    job,
    trigger,
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date(finished).toISOString(),
    durationMs: finished - started,
    ok: error === null,
    summary,
    error,
  };
  await persist(record);
  if (error !== null) throw new Error(error);
  return summary;
}

async function persist(record: AutomationRunRecord): Promise<void> {
  try {
    const json = JSON.stringify(record);
    await redis
      .multi()
      .set(AUTOMATION_KEYS.lastRun(record.job), json)
      .lpush(AUTOMATION_KEYS.runs(record.job), json)
      .ltrim(AUTOMATION_KEYS.runs(record.job), 0, RUN_HISTORY_LIMIT - 1)
      .exec();
  } catch (err) {
    console.error(`[automation] could not record the run of ${record.job}`, err);
  }
}

/** The dashboard reads this to say whether the worker is alive at all. Returns a stop function. */
export function startWorkerHeartbeat(): () => void {
  const beat = () => {
    redis.set(AUTOMATION_KEYS.heartbeat, new Date().toISOString()).catch((err) => {
      console.error("[automation] heartbeat failed", err);
    });
  };
  beat();
  const timer = setInterval(beat, WORKER_HEARTBEAT_MS);
  return () => clearInterval(timer);
}

/** The scheduler enqueues `{}`; a "Run now" from the dashboard carries who asked. */
export function triggerOf(data: unknown): AutomationTrigger {
  return typeof data === "object" && data !== null && (data as { trigger?: unknown }).trigger === "manual" ? "manual" : "schedule";
}
