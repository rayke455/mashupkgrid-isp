import {
  prisma,
  type ProvisioningJob,
  type ProvisioningOperation,
  type Prisma,
} from "@mashupkgrid/database";
import { createAdapterForRouter } from "@mashupkgrid/network";
import type { NetworkDeviceAdapter } from "@mashupkgrid/network";
import { ConflictError, NotFoundError, decryptAtRest } from "@mashupkgrid/shared";
import { env } from "@mashupkgrid/config";

/**
 * The provisioning engine (spec sections 5, 6, 7 and 18).
 *
 * The rule the whole file is built around: a subscriber is marked ACTIVE on the network only
 * when a device has confirmed the configuration. Every other outcome — router unreachable,
 * package missing a VLAN, a PPPoE profile that does not exist on the box — is a FAILED job
 * carrying the device's own words, never a silent success.
 *
 * Work is queued rather than run inside the request that caused it. A payment must not fail
 * because a router was rebooting, and a router operation must not be retried by retrying a
 * payment.
 */

const MAX_ATTEMPTS = 5;

export interface ProvisioningStep {
  step: string;
  ok: boolean;
  detail: string;
}

/** The configuration a job intends to apply, resolved from the package at queue time. */
export interface ProvisioningPlan {
  customerServiceId: string;
  customerId: string;
  tenantId: string;
  routerId: string;
  routerName: string;
  vlanId: string | null;
  vlanTag: number | null;
  vlanInterfaceName: string | null;
  serviceType: string;
  pppoeProfile: string | null;
  hotspotProfile: string | null;
  username: string;
  downloadKbps: number;
  uploadKbps: number;
  /** MikroTik's rate-limit format is "upload/download" from the ROUTER's point of view, which is
   *  the reverse of how an ISP quotes a package. Getting this backwards silently gives every
   *  customer their upload speed as download. */
  rateLimit: string;
}

export class ProvisioningNotConfiguredError extends ConflictError {
  constructor(message: string) {
    super(message);
    this.name = "ProvisioningNotConfiguredError";
  }
}

/**
 * Resolves what SHOULD be true on the network for one subscription. Throws with a specific,
 * actionable reason when the package is not configured for automatic provisioning — that gap is
 * something an operator must see and fix, not something to paper over with a default.
 */
export async function buildProvisioningPlan(customerServiceId: string): Promise<ProvisioningPlan> {
  const service = await prisma.customerService.findUnique({
    where: { id: customerServiceId },
    include: {
      package: { include: { vlan: { include: { router: true } }, router: true } },
      customer: true,
      radiusUser: true,
    },
  });
  if (!service) throw new NotFoundError("Subscription");

  const pkg = service.package;

  // The router can come from the package or, failing that, from the VLAN the package points at.
  const router = pkg.router ?? pkg.vlan?.router ?? null;
  if (!router) {
    throw new ProvisioningNotConfiguredError(
      `Package "${pkg.name}" has no router assigned, and neither does its VLAN. ` +
        `Set a router on the package before provisioning subscribers on it.`
    );
  }
  if (!router.host) {
    throw new ProvisioningNotConfiguredError(
      `Router "${router.name}" has never checked in, so it has no address to configure. ` +
        `Run its provisioning script or set its host manually.`
    );
  }
  if (!service.radiusUser) {
    throw new ProvisioningNotConfiguredError(
      `This subscription has no network account yet. Create its RADIUS user before provisioning.`
    );
  }

  const download = pkg.downloadKbps;
  const upload = pkg.uploadKbps;

  return {
    customerServiceId: service.id,
    customerId: service.customerId,
    tenantId: service.tenantId,
    routerId: router.id,
    routerName: router.name,
    vlanId: pkg.vlan?.id ?? null,
    vlanTag: pkg.vlan?.vlanTag ?? null,
    // Interface names are derived from the tag, not from the VLAN's display name: RouterOS
    // interface names cannot contain spaces, and "Home Internet" is a perfectly ordinary VLAN name.
    vlanInterfaceName: pkg.vlan ? `vlan${pkg.vlan.vlanTag}` : null,
    serviceType: pkg.serviceType,
    pppoeProfile: pkg.pppoeProfile,
    hotspotProfile: pkg.hotspotProfile,
    username: service.radiusUser.username,
    downloadKbps: download,
    uploadKbps: upload,
    rateLimit: `${upload}k/${download}k`,
  };
}

/** Stable key for one intended change. Two enqueue calls describing the same work collapse onto
 *  one row rather than queueing duplicate device operations (spec section 18). */
function idempotencyKeyFor(
  customerServiceId: string,
  operation: ProvisioningOperation,
  fingerprint: string
): string {
  return `${customerServiceId}:${operation}:${fingerprint}`;
}

export interface EnqueueResult {
  job: ProvisioningJob;
  /** True when an equivalent job already existed and was reused. */
  deduplicated: boolean;
}

/**
 * Queues a job. Safe to call from a payment handler: it only writes rows, never touches a device.
 * A package that cannot be provisioned still produces a FAILED job with the reason, because
 * "nothing happened and nobody was told" is the outcome this whole module exists to prevent.
 */
export async function enqueueProvisioningJob(
  tenantId: string,
  params: { customerServiceId: string; operation: ProvisioningOperation }
): Promise<EnqueueResult> {
  const { customerServiceId, operation } = params;

  let plan: ProvisioningPlan | null = null;
  let planError: string | null = null;
  try {
    plan = await buildProvisioningPlan(customerServiceId);
  } catch (err) {
    planError = err instanceof Error ? err.message : String(err);
  }

  const service = await prisma.customerService.findUniqueOrThrow({
    where: { id: customerServiceId },
    select: { customerId: true, tenantId: true },
  });

  // The fingerprint is the intended configuration, so a package speed change produces a NEW job
  // rather than deduplicating onto the previous one.
  const fingerprint = plan
    ? `${plan.routerId}|${plan.vlanTag ?? "-"}|${plan.rateLimit}|${plan.pppoeProfile ?? "-"}`
    : "unconfigured";
  const key = idempotencyKeyFor(customerServiceId, operation, fingerprint);

  const existing = await prisma.provisioningJob.findUnique({ where: { idempotencyKey: key } });
  if (existing && (existing.status === "PENDING" || existing.status === "PROCESSING")) {
    return { job: existing, deduplicated: true };
  }
  // A previously FAILED job with the same key is reset rather than duplicated — that IS the retry.
  if (existing) {
    const job = await prisma.provisioningJob.update({
      where: { id: existing.id },
      data: { status: "PENDING", attempts: 0, lastError: null, startedAt: null, completedAt: null },
    });
    return { job, deduplicated: true };
  }

  const job = await prisma.provisioningJob.create({
    data: {
      tenantId,
      customerId: service.customerId,
      customerServiceId,
      vlanId: plan?.vlanId ?? null,
      routerId: plan?.routerId ?? null,
      operation,
      idempotencyKey: key,
      maxAttempts: MAX_ATTEMPTS,
      payload: (plan ?? { unconfigured: planError }) as unknown as Prisma.InputJsonValue,
      ...(planError ? { status: "FAILED" as const, lastError: planError, completedAt: new Date() } : {}),
    },
  });

  if (planError) {
    await prisma.provisioningLog.create({
      data: { jobId: job.id, attempt: 0, succeeded: false, message: planError },
    });
    await prisma.customerService.update({
      where: { id: customerServiceId },
      data: { provisioningStatus: "FAILED" },
    });
  }

  return { job, deduplicated: false };
}

function decryptRouterCredential(value: string): string {
  return decryptAtRest(value, env.ENCRYPTION_KEY);
}

/**
 * Executes one job against the real device. Never throws for an operational failure — the job row
 * records it — so the worker loop cannot be killed by one bad router.
 */
export async function runProvisioningJob(jobId: string): Promise<ProvisioningJob> {
  const job = await prisma.provisioningJob.findUniqueOrThrow({ where: { id: jobId } });
  if (job.status === "SUCCEEDED" || job.status === "CANCELLED") return job;

  const startedAt = new Date();
  const attempt = job.attempts + 1;
  await prisma.provisioningJob.update({
    where: { id: job.id },
    data: { status: "PROCESSING", startedAt, attempts: attempt },
  });
  await prisma.customerService.update({
    where: { id: job.customerServiceId },
    data: { provisioningStatus: "PROCESSING" },
  });

  const steps: ProvisioningStep[] = [];
  const record = (step: string, ok: boolean, detail: string) => {
    steps.push({ step, ok, detail });
  };

  let adapter: NetworkDeviceAdapter | null = null;
  try {
    const plan = await buildProvisioningPlan(job.customerServiceId);
    record("resolve-plan", true, `router=${plan.routerName} vlan=${plan.vlanTag ?? "none"}`);

    const router = await prisma.router.findUniqueOrThrow({ where: { id: plan.routerId } });
    if (!router.host) throw new Error(`Router "${router.name}" has no address.`);

    adapter = createAdapterForRouter({ ...router, host: router.host });
    await adapter.connect();
    record("connect", true, `${router.host}:${router.apiPort}`);

    const result = await applyOperation(adapter, job.operation, plan, record);

    await finishSuccess(job, attempt, steps, result, startedAt);
    return prisma.provisioningJob.findUniqueOrThrow({ where: { id: job.id } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    record("failed", false, message);
    await finishFailure(job, attempt, steps, message, startedAt);
    return prisma.provisioningJob.findUniqueOrThrow({ where: { id: job.id } });
  } finally {
    // Best effort: a failed disconnect must not turn a successful job into a failed one.
    await adapter?.disconnect().catch(() => {});
  }
}

/** Maps an operation onto real device calls. Every branch either confirms with the device or
 *  throws — none of them return success on an unverified assumption. */
async function applyOperation(
  adapter: NetworkDeviceAdapter,
  operation: ProvisioningOperation,
  plan: ProvisioningPlan,
  record: (step: string, ok: boolean, detail: string) => void
): Promise<Record<string, unknown>> {
  switch (operation) {
    case "PROVISION": {
      // A configured VLAN must actually exist on the device before a subscriber is put on it.
      if (plan.vlanTag !== null && plan.vlanInterfaceName) {
        if (!adapter.listVlanInterfaces) {
          throw new Error(
            `This router's adapter cannot manage VLAN interfaces, but the package requires VLAN ${plan.vlanTag}. ` +
              `Configure the VLAN on the device manually, or remove it from the package.`
          );
        }
        const existing = await adapter.listVlanInterfaces();
        const match = existing.find((v) => v.vlanId === plan.vlanTag);
        if (!match) {
          throw new Error(
            `VLAN ${plan.vlanTag} is not configured on router "${plan.routerName}". ` +
              `Provision the VLAN on the device before putting subscribers on it.`
          );
        }
        if (match.disabled) {
          throw new Error(`VLAN ${plan.vlanTag} exists on "${plan.routerName}" but is disabled.`);
        }
        record("verify-vlan", true, `${match.name} (tag ${match.vlanId})`);
      }

      // A profile named on the package must exist on the box. Applying a non-existent profile
      // would leave the subscriber on the device default at whatever speed that happens to be.
      if (plan.pppoeProfile && adapter.listPppProfiles) {
        const profiles = await adapter.listPppProfiles();
        if (!profiles.some((p) => p.name === plan.pppoeProfile)) {
          throw new Error(
            `PPPoE profile "${plan.pppoeProfile}" does not exist on router "${plan.routerName}". ` +
              `Available: ${profiles.map((p) => p.name).join(", ") || "(none)"}.`
          );
        }
        record("verify-profile", true, plan.pppoeProfile);
      }

      // Idempotent: update when the account is already there, create otherwise.
      try {
        await adapter.updateUser(plan.username, {
          ...(plan.pppoeProfile ? { profile: plan.pppoeProfile } : {}),
        });
        record("update-user", true, `${plan.username} @ ${plan.rateLimit}`);
      } catch {
        await adapter.createUser({
          username: plan.username,
          password: await resolveRadiusPassword(plan.customerServiceId),
          ...(plan.pppoeProfile ? { profile: plan.pppoeProfile } : {}),
          comment: `mashupkgrid service ${plan.customerServiceId}`,
        });
        record("create-user", true, `${plan.username} @ ${plan.rateLimit}`);
      }

      await adapter.enableUser(plan.username);
      record("enable-user", true, plan.username);

      // Speed is delivered by the RADIUS reply, not by the PPP secret. RouterOS has no
      // rate-limit property on /ppp/secret at all (it answers "unknown parameter rate-limit" and
      // creates nothing), so this attribute is what actually shapes the subscriber — the same
      // mechanism the hotspot voucher flow already relies on.
      await applyRateLimitAttribute(plan.username, plan.rateLimit);
      record("radius-rate-limit", true, `Mikrotik-Rate-Limit = ${plan.rateLimit}`);

      return { username: plan.username, rateLimit: plan.rateLimit, vlanTag: plan.vlanTag };
    }

    case "SUSPEND": {
      await adapter.disableUser(plan.username);
      record("disable-user", true, plan.username);
      // Disabling alone does not drop a session already established — the customer keeps working
      // until they happen to reconnect. Kicking is what actually suspends service.
      await adapter.disconnectUser(plan.username);
      record("disconnect-session", true, plan.username);
      return { username: plan.username, suspended: true };
    }

    case "RESTORE": {
      await adapter.enableUser(plan.username);
      record("enable-user", true, plan.username);
      // Re-apply speed on restore: the package may have changed while suspended.
      await adapter.updateUser(plan.username, {
        ...(plan.pppoeProfile ? { profile: plan.pppoeProfile } : {}),
      });
      await applyRateLimitAttribute(plan.username, plan.rateLimit);
      record("reapply-rate", true, plan.rateLimit);
      return { username: plan.username, rateLimit: plan.rateLimit, restored: true };
    }

    case "DEPROVISION": {
      await adapter.disableUser(plan.username);
      await adapter.disconnectUser(plan.username);
      record("deprovision", true, `${plan.username} disabled and disconnected`);
      // The account is disabled, never deleted: spec section 6 is explicit that suspending or
      // ending service must not destroy the customer's records.
      return { username: plan.username, deprovisioned: true };
    }
  }
}

/**
 * Writes the Mikrotik-Rate-Limit RADIUS reply attribute for a subscriber. Idempotent: the row is
 * replaced rather than appended, so a retried job cannot leave two conflicting rate limits for
 * the same username — FreeRADIUS would send both and the router would apply whichever it read
 * last.
 */
async function applyRateLimitAttribute(username: string, rateLimit: string): Promise<void> {
  await prisma.$transaction([
    prisma.radReply.deleteMany({ where: { username, attribute: "Mikrotik-Rate-Limit" } }),
    prisma.radReply.create({
      data: { username, attribute: "Mikrotik-Rate-Limit", op: "=", value: rateLimit },
    }),
  ]);
}

async function resolveRadiusPassword(customerServiceId: string): Promise<string> {
  const user = await prisma.radiusUser.findUniqueOrThrow({ where: { customerServiceId } });
  return decryptRouterCredential(user.passwordEncrypted);
}

const SERVICE_STATUS_ON_SUCCESS = {
  PROVISION: "ACTIVE",
  RESTORE: "ACTIVE",
  SUSPEND: "SUSPENDED",
  DEPROVISION: "DEPROVISIONED",
} as const;

async function finishSuccess(
  job: ProvisioningJob,
  attempt: number,
  steps: ProvisioningStep[],
  result: Record<string, unknown>,
  startedAt: Date
): Promise<void> {
  await prisma.$transaction([
    prisma.provisioningJob.update({
      where: { id: job.id },
      data: {
        status: "SUCCEEDED",
        completedAt: new Date(),
        lastError: null,
        result: result as Prisma.InputJsonValue,
      },
    }),
    prisma.provisioningLog.create({
      data: {
        jobId: job.id,
        attempt,
        succeeded: true,
        message: `${job.operation} completed`,
        steps: steps as unknown as Prisma.InputJsonValue,
        durationMs: Date.now() - startedAt.getTime(),
      },
    }),
    prisma.customerService.update({
      where: { id: job.customerServiceId },
      data: { provisioningStatus: SERVICE_STATUS_ON_SUCCESS[job.operation] },
    }),
  ]);
}

async function finishFailure(
  job: ProvisioningJob,
  attempt: number,
  steps: ProvisioningStep[],
  message: string,
  startedAt: Date
): Promise<void> {
  // Below maxAttempts the job returns to PENDING for the worker to pick up again; at the limit it
  // stops and waits for a human, because retrying a misconfiguration forever hides it.
  const exhausted = attempt >= job.maxAttempts;
  await prisma.$transaction([
    prisma.provisioningJob.update({
      where: { id: job.id },
      data: {
        status: exhausted ? "FAILED" : "PENDING",
        lastError: message,
        ...(exhausted ? { completedAt: new Date() } : {}),
      },
    }),
    prisma.provisioningLog.create({
      data: {
        jobId: job.id,
        attempt,
        succeeded: false,
        message,
        steps: steps as unknown as Prisma.InputJsonValue,
        durationMs: Date.now() - startedAt.getTime(),
      },
    }),
    prisma.customerService.update({
      where: { id: job.customerServiceId },
      // Only a terminal failure changes the subscriber's status. A job still due for retry leaves
      // it PROCESSING, which is the truth: the system has not given up yet.
      data: { provisioningStatus: exhausted ? "FAILED" : "PROCESSING" },
    }),
  ]);
}

/** Puts a FAILED job back in the queue and clears its attempt count (spec section 5). */
export async function retryProvisioningJob(tenantId: string, jobId: string): Promise<ProvisioningJob> {
  const job = await prisma.provisioningJob.findFirst({ where: { id: jobId, tenantId } });
  if (!job) throw new NotFoundError("Provisioning job");
  if (job.status === "PENDING" || job.status === "PROCESSING") {
    throw new ConflictError("This job is already queued — it will run on its own.");
  }
  if (job.status === "SUCCEEDED") {
    throw new ConflictError("This job already succeeded. Queue a new one to re-apply configuration.");
  }
  return prisma.provisioningJob.update({
    where: { id: jobId },
    data: { status: "PENDING", attempts: 0, lastError: null, startedAt: null, completedAt: null },
  });
}

/** Claims the next batch of runnable jobs for the worker. */
export async function listRunnableJobs(limit = 20): Promise<ProvisioningJob[]> {
  return prisma.provisioningJob.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}
