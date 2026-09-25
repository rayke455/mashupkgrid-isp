import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  AUTOMATION_JOBS,
  AUTOMATION_KEYS,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  WORKER_OFFLINE_AFTER_MS,
  findAutomationJob,
  isJobStale,
  nextRunAfter,
  successResponse,
  type AutomationJobDefinition,
  type AutomationRunRecord,
} from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { getCachedPermissions } from "../lib/permission-cache.js";
import { redis } from "../lib/redis.js";
import { enqueueAutomationRunNow } from "../lib/queue.js";
import { writeAuditLog } from "../lib/audit.js";

/**
 * What the worker has been doing, for the dashboard's automation page.
 *
 * Two audiences read the same records with different detail:
 * - A tenant operator (settings.manage) sees the schedule and health of the jobs that act on
 *   their customers — is billing running, when did it last run, is it late — but never the
 *   counters. Every scheduled job runs across all tenants at once, so "suspended=12" is a
 *   platform-wide figure that would leak how busy other ISPs are.
 * - A super admin (maintenance.manage) sees everything: counters, error messages, run history,
 *   and can run a job ahead of schedule.
 */

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

type Audience = "tenant" | "platform";

/** Tenant staff need settings.manage; platform admins need maintenance.manage. Neither permission
 *  can be held by the other kind of account (see TENANT_SCOPED_PERMISSIONS), so this is the whole
 *  decision. */
async function audienceOf(request: FastifyRequest): Promise<Audience> {
  if (!request.user) throw new UnauthorizedError();
  const permissions = await getCachedPermissions(request.user.id, request.user.tenantId);
  const wanted = request.user.tenantId === null ? "maintenance.manage" : "settings.manage";
  if (!permissions.has(wanted)) throw new ForbiddenError(`Missing required permission: ${wanted}`);
  if (request.user.apiKeyScopes && !request.user.apiKeyScopes.includes(wanted)) {
    throw new ForbiddenError(`API token is not scoped for: ${wanted}`);
  }
  return request.user.tenantId === null ? "platform" : "tenant";
}

function parseRecord(raw: string | null): AutomationRunRecord | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AutomationRunRecord;
  } catch {
    return null;
  }
}

/** The tenant view of a run: when, how long, and whether it worked. */
function publicRun(run: AutomationRunRecord) {
  return { trigger: run.trigger, startedAt: run.startedAt, finishedAt: run.finishedAt, durationMs: run.durationMs, ok: run.ok };
}

export type AutomationJobStatus = "ok" | "failed" | "late" | "never";

function statusOf(job: AutomationJobDefinition, lastRun: AutomationRunRecord | null, now: number): AutomationJobStatus {
  if (!lastRun) return "never";
  if (isJobStale(job, lastRun, now)) return "late";
  return lastRun.ok ? "ok" : "failed";
}

async function loadWorker(now: number) {
  let lastHeartbeatAt: string | null = null;
  try {
    lastHeartbeatAt = await redis.get(AUTOMATION_KEYS.heartbeat);
  } catch {
    // Redis down: reported as offline below, which is also what it means for the worker.
  }
  const online = lastHeartbeatAt !== null && now - new Date(lastHeartbeatAt).getTime() < WORKER_OFFLINE_AFTER_MS;
  return { online, lastHeartbeatAt };
}

export async function automationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/jobs", { config: { audience: "staff" }, preHandler: [...preHandler] }, async (request, reply) => {
    const audience = await audienceOf(request);
    const now = Date.now();
    const jobs = audience === "platform" ? AUTOMATION_JOBS : AUTOMATION_JOBS.filter((job) => job.tenantVisible);

    // One round trip for every job's last run rather than one per job.
    let raws: (string | null)[] = [];
    try {
      raws = jobs.length > 0 ? await redis.mget(...jobs.map((job) => AUTOMATION_KEYS.lastRun(job.name))) : [];
    } catch {
      raws = jobs.map(() => null);
    }

    const items = jobs.map((job, i) => {
      const lastRun = parseRecord(raws[i] ?? null);
      const base = {
        name: job.name,
        label: job.label,
        description: job.description,
        category: job.category,
        everyMs: job.everyMs,
        status: statusOf(job, lastRun, now),
        nextRunAt: nextRunAfter(job, lastRun, now).toISOString(),
      };
      if (audience === "platform") {
        return { ...base, counters: job.counters, lastRun };
      }
      return { ...base, lastRun: lastRun ? publicRun(lastRun) : null };
    });

    const worker = await loadWorker(now);
    reply.send(successResponse({ worker, audience, jobs: items }, request.id));
  });

  const nameParams = z.object({ name: z.string().min(1).max(64) });

  app.get("/jobs/:name/runs", { config: { audience: "platform" }, preHandler: [...preHandler] }, async (request, reply) => {
    const audience = await audienceOf(request);
    if (audience !== "platform") throw new ForbiddenError("Run history is only available to platform administrators");
    const { name } = nameParams.parse(request.params);
    const job = findAutomationJob(name);
    if (!job) throw new NotFoundError(`No scheduled job named "${name}"`);

    let raws: string[] = [];
    try {
      raws = await redis.lrange(AUTOMATION_KEYS.runs(job.name), 0, -1);
    } catch {
      raws = [];
    }
    const runs = raws.map(parseRecord).filter((run): run is AutomationRunRecord => run !== null);
    reply.send(successResponse({ job: job.name, runs }, request.id));
  });

  app.post("/jobs/:name/run", { config: { audience: "platform" }, preHandler: [...preHandler] }, async (request, reply) => {
    const audience = await audienceOf(request);
    if (audience !== "platform") throw new ForbiddenError("Only platform administrators can run a job ahead of schedule");
    const { name } = nameParams.parse(request.params);
    const job = findAutomationJob(name);
    if (!job) throw new NotFoundError(`No scheduled job named "${name}"`);

    const worker = await loadWorker(Date.now());
    const jobId = await enqueueAutomationRunNow(job, request.user!.id);
    await writeAuditLog({
      tenantId: null,
      actorUserId: request.user!.id,
      action: "automation.run_now",
      resourceType: "automation_job",
      resourceId: job.name,
      after: { queue: job.queue, jobId },
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });

    // Queued, not run: the worker picks it up. Say so honestly when the worker is not around to.
    reply.status(202).send(
      successResponse(
        {
          queued: true,
          jobId,
          workerOnline: worker.online,
          message: worker.online
            ? `${job.label} will run within a few seconds.`
            : `${job.label} is queued, but the worker has not reported in — it will run when the worker is back.`,
        },
        request.id
      )
    );
  });
}
