import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import { enqueueProvisioningJob, retryProvisioningJob } from "@mashupkgrid/radius";
import { successResponse, ConflictError, NotFoundError } from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

const JOB_STATUSES = ["PENDING", "PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED"] as const;
const OPERATIONS = ["PROVISION", "SUSPEND", "RESTORE", "DEPROVISION"] as const;

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) {
    throw new ConflictError("Provisioning is per ISP — platform administration has no network of its own");
  }
  return tenantId;
}

/**
 * The provisioning queue (spec sections 5 and 18).
 *
 * Reading is gated on `vlans.read` and retrying on `provisioning.retry`, deliberately NOT on
 * `vlans.manage`: the spec wants a support agent able to re-run a failed job for a customer who
 * is off-line without also being able to alter VLAN configuration.
 */
export async function provisioningRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/jobs",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("vlans.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const query = z
        .object({
          status: z.enum(JOB_STATUSES).optional(),
          operation: z.enum(OPERATIONS).optional(),
          customerId: z.string().uuid().optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
        })
        .parse(request.query);

      const jobs = await prisma.provisioningJob.findMany({
        where: {
          tenantId,
          ...(query.status ? { status: query.status } : {}),
          ...(query.operation ? { operation: query.operation } : {}),
          ...(query.customerId ? { customerId: query.customerId } : {}),
        },
        include: {
          customer: { select: { id: true, fullName: true, customerNumber: true } },
          router: { select: { id: true, name: true } },
          vlan: { select: { id: true, vlanTag: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: query.limit,
      });

      reply.send(successResponse(jobs, request.id));
    }
  );

  /** Counters for the dashboard. A separate query so the page does not download the whole queue
   *  just to show how much of it is stuck. */
  app.get(
    "/jobs/summary",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("vlans.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const grouped = await prisma.provisioningJob.groupBy({
        by: ["status"],
        where: { tenantId },
        _count: { _all: true },
      });
      const counts: Record<string, number> = { PENDING: 0, PROCESSING: 0, SUCCEEDED: 0, FAILED: 0, CANCELLED: 0 };
      for (const row of grouped) counts[row.status] = row._count._all;
      reply.send(successResponse(counts, request.id));
    }
  );

  /** One job with its full attempt history — the "what actually happened" view an operator needs
   *  when a customer is off-line and the job says FAILED. */
  app.get(
    "/jobs/:jobId",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("vlans.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { jobId } = z.object({ jobId: z.string().uuid() }).parse(request.params);
      const job = await prisma.provisioningJob.findFirst({
        where: { id: jobId, tenantId },
        include: {
          customer: { select: { id: true, fullName: true, customerNumber: true } },
          router: { select: { id: true, name: true, host: true } },
          vlan: { select: { id: true, vlanTag: true, name: true } },
          logs: { orderBy: { attempt: "asc" } },
        },
      });
      if (!job) throw new NotFoundError("Provisioning job");
      reply.send(successResponse(job, request.id));
    }
  );

  app.post(
    "/jobs/:jobId/retry",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("provisioning.retry")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { jobId } = z.object({ jobId: z.string().uuid() }).parse(request.params);

      // Only re-queues. The worker runs it against the device — a retry must not block an HTTP
      // request on a router that is, by definition, probably not answering.
      const job = await retryProvisioningJob(tenantId, jobId);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "provisioning.job_retried",
        resourceType: "ProvisioningJob",
        resourceId: jobId,
        after: { operation: job.operation, customerServiceId: job.customerServiceId },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(job, request.id));
    }
  );

  /** Re-apply a subscription's network configuration on demand — the manual counterpart to the
   *  automatic queueing that happens on payment, suspension and package change. */
  app.post(
    "/subscriptions/:subscriptionId/reprovision",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("provisioning.retry")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { subscriptionId } = z.object({ subscriptionId: z.string().uuid() }).parse(request.params);
      const { operation } = z
        .object({ operation: z.enum(OPERATIONS).default("PROVISION") })
        .parse(request.body ?? {});

      const subscription = await prisma.customerService.findFirst({
        where: { id: subscriptionId, tenantId },
      });
      if (!subscription) throw new NotFoundError("Subscription");

      const { job, deduplicated } = await enqueueProvisioningJob(tenantId, {
        customerServiceId: subscriptionId,
        operation,
      });

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "provisioning.queued_manually",
        resourceType: "ProvisioningJob",
        resourceId: job.id,
        after: { operation, subscriptionId, deduplicated },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.status(201).send(successResponse({ ...job, deduplicated }, request.id));
    }
  );

  /**
   * The customer's network configuration view (spec section 4). Everything an agent needs on one
   * screen: which VLAN, which router, which speed, and — separately — whether the device has
   * actually confirmed it.
   */
  app.get(
    "/subscriptions/:subscriptionId/network",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("vlans.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { subscriptionId } = z.object({ subscriptionId: z.string().uuid() }).parse(request.params);

      const subscription = await prisma.customerService.findFirst({
        where: { id: subscriptionId, tenantId },
        include: {
          customer: { select: { id: true, fullName: true, customerNumber: true, phone: true } },
          package: { include: { vlan: true, router: { select: { id: true, name: true, status: true } }, ipPool: true } },
          radiusUser: { select: { username: true, status: true, staticIp: true, connectionType: true } },
          provisioningJobs: { orderBy: { createdAt: "desc" }, take: 5 },
        },
      });
      if (!subscription) throw new NotFoundError("Subscription");

      const pkg = subscription.package;
      reply.send(
        successResponse(
          {
            customer: subscription.customer,
            billingStatus: subscription.status,
            // Kept distinct from billingStatus on purpose: a subscription can be paid up and
            // still not working on the network, and collapsing the two hides exactly that.
            provisioningStatus: subscription.provisioningStatus,
            package: { id: pkg.id, name: pkg.name, downloadKbps: pkg.downloadKbps, uploadKbps: pkg.uploadKbps, serviceType: pkg.serviceType },
            vlan: pkg.vlan
              ? { id: pkg.vlan.id, vlanTag: pkg.vlan.vlanTag, name: pkg.vlan.name, type: pkg.vlan.type, provisioningStatus: pkg.vlan.provisioningStatus }
              : null,
            router: pkg.router,
            ipPool: pkg.ipPool ? { id: pkg.ipPool.id, name: pkg.ipPool.name, cidr: pkg.ipPool.cidr } : null,
            pppoeProfile: pkg.pppoeProfile,
            account: subscription.radiusUser,
            recentJobs: subscription.provisioningJobs,
          },
          request.id
        )
      );
    }
  );
}
