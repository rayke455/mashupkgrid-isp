import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma, type JobCard } from "@mashupkgrid/database";
import { successResponse, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@mashupkgrid/shared";
import { pushToUser } from "@mashupkgrid/push";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { getCachedPermissions } from "../lib/permission-cache.js";
import { writeAuditLog } from "../lib/audit.js";

/**
 * Job cards for field technicians. Staff who can update customers create and assign jobs; a
 * technician (anyone who can read customers) sees and works the jobs assigned to them: start on
 * site, add photos and equipment, and close with the customer's signature.
 */

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;
const TYPES = ["INSTALLATION", "REPAIR", "SURVEY", "RELOCATION", "REMOVAL"] as const;
const MAX_PHOTOS = 8;
const MAX_BYTES = 2 * 1024 * 1024;
const MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const createSchema = z.object({
  type: z.enum(TYPES),
  title: z.string().trim().min(3).max(120),
  notes: z.string().trim().max(2000).nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  address: z.string().trim().max(200).nullable().optional(),
  contactPhone: z.string().trim().max(20).nullable().optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
  scheduledFor: z.string().datetime().nullable().optional(),
});
const updateSchema = createSchema.partial().extend({ status: z.enum(["OPEN", "CANCELLED"]).optional() });
const gpsSchema = z.object({ latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional() });
const completeSchema = gpsSchema.extend({
  completionNotes: z.string().trim().max(2000).nullable().optional(),
  equipment: z.string().trim().max(300).nullable().optional(),
  signedByName: z.string().trim().max(100).nullable().optional(),
});
const attachmentSchema = z.object({
  kind: z.enum(["PHOTO", "SIGNATURE"]),
  mimeType: z.string(),
  dataBase64: z.string().max(Math.ceil((MAX_BYTES * 4) / 3) + 8),
});
const idParams = z.object({ jobId: z.string().uuid() });

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) throw new ConflictError("Job cards belong to an ISP account");
  return tenantId;
}

async function canManage(request: FastifyRequest): Promise<boolean> {
  const permissions = await getCachedPermissions(request.user!.id, request.user!.tenantId);
  return permissions.has("customers.update");
}

/** The job, if the caller may work it: managers any job, technicians only their own. */
async function workableJob(request: FastifyRequest, jobId: string): Promise<JobCard> {
  const tenantId = requireTenant(request.user!.tenantId);
  const job = await prisma.jobCard.findFirst({ where: { id: jobId, tenantId } });
  if (!job) throw new NotFoundError("Job");
  if (job.assignedToUserId !== request.user!.id && !(await canManage(request))) throw new ForbiddenError("This job is assigned to someone else");
  return job;
}

export async function nextJobNumber(tenantId: string, attempt: number): Promise<string> {
  const count = await prisma.jobCard.count({ where: { tenantId } });
  return `JOB-${String(count + 1 + attempt).padStart(5, "0")}`;
}

async function assertRefsInTenant(tenantId: string, body: { customerId?: string | null; assignedToUserId?: string | null }): Promise<void> {
  if (body.customerId && !(await prisma.customer.findFirst({ where: { id: body.customerId, tenantId, deletedAt: null }, select: { id: true } }))) {
    throw new NotFoundError("Customer");
  }
  if (body.assignedToUserId && !(await prisma.user.findFirst({ where: { id: body.assignedToUserId, tenantId, deletedAt: null, status: "ACTIVE", customerProfile: null }, select: { id: true } }))) {
    throw new NotFoundError("Technician");
  }
}

async function tellTechnician(userId: string, job: JobCard): Promise<void> {
  await pushToUser(userId, {
    title: `New job: ${job.title}`,
    body: `${job.number}${job.scheduledFor ? `, ${job.scheduledFor.toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" })}` : ""}${job.address ? ` at ${job.address}` : ""}`,
    url: `/field/${job.id}`,
    tag: `job-${job.id}`,
  }).catch(() => 0);
}

const listInclude = {
  customer: { select: { id: true, fullName: true, phone: true, customerNumber: true, address: true } },
  assignedTo: { select: { id: true, email: true } },
  _count: { select: { attachments: true } },
} as const;

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("customers.read")] }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const q = z.object({ status: z.enum(["OPEN", "IN_PROGRESS", "DONE", "CANCELLED", "ACTIVE"]).default("ACTIVE"), mine: z.coerce.boolean().default(false) }).parse(request.query);
    const onlyMine = q.mine || !(await canManage(request));
    const jobs = await prisma.jobCard.findMany({
      where: {
        tenantId,
        ...(q.status === "ACTIVE" ? { status: { in: ["OPEN", "IN_PROGRESS"] } } : { status: q.status }),
        ...(onlyMine ? { assignedToUserId: request.user!.id } : {}),
      },
      orderBy: [{ scheduledFor: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 200,
      include: listInclude,
    });
    reply.send(successResponse(jobs, request.id));
  });

  /** Staff a job can be assigned to. */
  app.get("/technicians", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("customers.update")] }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    // Staff only: a customer's own portal login is also a user of this tenant.
    const users = await prisma.user.findMany({ where: { tenantId, status: "ACTIVE", deletedAt: null, customerProfile: null }, select: { id: true, email: true }, orderBy: { email: "asc" } });
    reply.send(successResponse(users, request.id));
  });

  app.get("/:jobId", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("customers.read")] }, async (request, reply) => {
    const { jobId } = idParams.parse(request.params);
    await workableJob(request, jobId);
    const job = await prisma.jobCard.findUniqueOrThrow({
      where: { id: jobId },
      include: {
        ...listInclude,
        customer: { select: { id: true, fullName: true, phone: true, customerNumber: true, address: true, gpsLat: true, gpsLng: true } },
        attachments: { select: { id: true, kind: true, mimeType: true, sizeBytes: true, createdAt: true }, orderBy: { createdAt: "asc" } },
      },
    });
    reply.send(successResponse(job, request.id));
  });

  app.post("/", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("customers.update")] }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const body = createSchema.parse(request.body);
    await assertRefsInTenant(tenantId, body);
    let job: JobCard | null = null;
    for (let attempt = 0; attempt < 5 && !job; attempt++) {
      try {
        job = await prisma.jobCard.create({
          data: {
            tenantId,
            number: await nextJobNumber(tenantId, attempt),
            type: body.type,
            title: body.title,
            notes: body.notes || null,
            customerId: body.customerId || null,
            address: body.address || null,
            contactPhone: body.contactPhone || null,
            assignedToUserId: body.assignedToUserId || null,
            scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
            createdByUserId: request.user!.id,
          },
        });
      } catch (err) {
        if ((err as { code?: string }).code !== "P2002") throw err;
      }
    }
    if (!job) throw new ConflictError("Could not number the job, try again");
    await writeAuditLog({ tenantId, actorUserId: request.user!.id, action: "job.created", resourceType: "JobCard", resourceId: job.id, after: { number: job.number, type: job.type }, ipAddress: request.ip, userAgent: request.headers["user-agent"] ?? null });
    if (job.assignedToUserId) await tellTechnician(job.assignedToUserId, job);
    reply.status(201).send(successResponse(job, request.id));
  });

  app.patch("/:jobId", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("customers.update")] }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const { jobId } = idParams.parse(request.params);
    const body = updateSchema.parse(request.body);
    const before = await prisma.jobCard.findFirst({ where: { id: jobId, tenantId } });
    if (!before) throw new NotFoundError("Job");
    if (before.status === "DONE") throw new ConflictError("A finished job cannot be changed");
    await assertRefsInTenant(tenantId, body);
    const job = await prisma.jobCard.update({
      where: { id: jobId },
      data: {
        ...(body.type ? { type: body.type } : {}),
        ...(body.title ? { title: body.title } : {}),
        ...(body.notes !== undefined ? { notes: body.notes || null } : {}),
        ...(body.customerId !== undefined ? { customerId: body.customerId || null } : {}),
        ...(body.address !== undefined ? { address: body.address || null } : {}),
        ...(body.contactPhone !== undefined ? { contactPhone: body.contactPhone || null } : {}),
        ...(body.assignedToUserId !== undefined ? { assignedToUserId: body.assignedToUserId || null } : {}),
        ...(body.scheduledFor !== undefined ? { scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null } : {}),
        ...(body.status ? { status: body.status } : {}),
      },
    });
    if (job.assignedToUserId && job.assignedToUserId !== before.assignedToUserId) await tellTechnician(job.assignedToUserId, job);
    reply.send(successResponse(job, request.id));
  });

  app.post("/:jobId/start", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("customers.read")] }, async (request, reply) => {
    const { jobId } = idParams.parse(request.params);
    const job = await workableJob(request, jobId);
    if (job.status !== "OPEN") throw new ConflictError(job.status === "IN_PROGRESS" ? "Already started" : "This job is closed");
    const gps = gpsSchema.parse(request.body ?? {});
    const updated = await prisma.jobCard.update({
      where: { id: jobId },
      data: { status: "IN_PROGRESS", startedAt: new Date(), assignedToUserId: job.assignedToUserId ?? request.user!.id, latitude: gps.latitude ?? null, longitude: gps.longitude ?? null },
    });
    reply.send(successResponse(updated, request.id));
  });

  app.post(
    "/:jobId/attachments",
    { config: { audience: "staff" }, bodyLimit: 3 * 1024 * 1024 + 64 * 1024, preHandler: [...preHandler, requirePermission("customers.read")] },
    async (request, reply) => {
      const { jobId } = idParams.parse(request.params);
      const job = await workableJob(request, jobId);
      if (job.status === "DONE" || job.status === "CANCELLED") throw new ConflictError("This job is closed");
      const body = attachmentSchema.parse(request.body);
      if (!MIME.has(body.mimeType)) throw new ValidationError("Photos must be JPEG, PNG or WebP");
      const data = Buffer.from(body.dataBase64, "base64");
      if (data.length === 0 || data.length > MAX_BYTES) throw new ValidationError("The image is empty or larger than 2 MB");
      if (body.kind === "PHOTO") {
        const photos = await prisma.jobCardAttachment.count({ where: { jobCardId: jobId, kind: "PHOTO" } });
        if (photos >= MAX_PHOTOS) throw new ConflictError(`A job can have at most ${MAX_PHOTOS} photos`);
      } else {
        // One signature per job: a new one replaces the old.
        await prisma.jobCardAttachment.deleteMany({ where: { jobCardId: jobId, kind: "SIGNATURE" } });
      }
      const attachment = await prisma.jobCardAttachment.create({
        data: { jobCardId: jobId, kind: body.kind, mimeType: body.mimeType, sizeBytes: data.length, data, uploadedByUserId: request.user!.id },
        select: { id: true, kind: true, mimeType: true, sizeBytes: true, createdAt: true },
      });
      reply.status(201).send(successResponse(attachment, request.id));
    }
  );

  app.get("/:jobId/attachments/:attachmentId", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("customers.read")] }, async (request, reply) => {
    const { jobId, attachmentId } = z.object({ jobId: z.string().uuid(), attachmentId: z.string().uuid() }).parse(request.params);
    await workableJob(request, jobId);
    const attachment = await prisma.jobCardAttachment.findFirst({ where: { id: attachmentId, jobCardId: jobId } });
    if (!attachment) throw new NotFoundError("Attachment");
    reply.header("content-type", attachment.mimeType).header("cache-control", "private, max-age=86400").send(Buffer.from(attachment.data));
  });

  app.delete("/:jobId/attachments/:attachmentId", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("customers.read")] }, async (request, reply) => {
    const { jobId, attachmentId } = z.object({ jobId: z.string().uuid(), attachmentId: z.string().uuid() }).parse(request.params);
    const job = await workableJob(request, jobId);
    if (job.status === "DONE") throw new ConflictError("This job is closed");
    const removed = await prisma.jobCardAttachment.deleteMany({ where: { id: attachmentId, jobCardId: jobId } });
    reply.send(successResponse({ removed: removed.count }, request.id));
  });

  /** Closes the job. An installation needs the customer's signature first. */
  app.post("/:jobId/complete", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("customers.read")] }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const { jobId } = idParams.parse(request.params);
    const job = await workableJob(request, jobId);
    if (job.status === "DONE" || job.status === "CANCELLED") throw new ConflictError("This job is already closed");
    const body = completeSchema.parse(request.body ?? {});
    if (job.type === "INSTALLATION") {
      const signed = await prisma.jobCardAttachment.count({ where: { jobCardId: jobId, kind: "SIGNATURE" } });
      if (!signed) throw new ConflictError("Ask the customer to sign before closing an installation");
    }
    const updated = await prisma.jobCard.update({
      where: { id: jobId },
      data: {
        status: "DONE",
        completedAt: new Date(),
        startedAt: job.startedAt ?? new Date(),
        completionNotes: body.completionNotes || null,
        equipment: body.equipment || null,
        signedByName: body.signedByName || null,
        latitude: body.latitude ?? job.latitude,
        longitude: body.longitude ?? job.longitude,
      },
    });
    await writeAuditLog({ tenantId, actorUserId: request.user!.id, action: "job.completed", resourceType: "JobCard", resourceId: jobId, after: { number: job.number }, ipAddress: request.ip, userAgent: request.headers["user-agent"] ?? null });
    reply.send(successResponse(updated, request.id));
  });
}
