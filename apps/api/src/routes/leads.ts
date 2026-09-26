import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, type JobCard } from "@mashupkgrid/database";
import { successResponse, ConflictError, NotFoundError, resolveTenantPreferences } from "@mashupkgrid/shared";
import { checkCoverage, createCustomer } from "@mashupkgrid/billing";
import { sendTenantSms } from "@mashupkgrid/sms";
import { pushToTenantStaff } from "@mashupkgrid/push";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { authRateLimitConfig } from "../plugins/rate-limit.js";
import { writeAuditLog } from "../lib/audit.js";
import { nextJobNumber } from "./jobs.js";

/**
 * The public coverage check and signup page, and the leads it creates. A visitor checks whether
 * their location is covered and asks for a connection; staff see the request as a lead, call
 * them, and turn it into a customer with an installation or survey job in one step.
 */

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;
const slugParams = z.object({ tenantSlug: z.string().min(1).max(80) });
const leadParams = z.object({ leadId: z.string().uuid() });
const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);

async function signupTenant(slug: string) {
  const tenant = await prisma.tenant.findFirst({ where: { slug, deletedAt: null, status: "ACTIVE" }, select: { id: true, name: true, slug: true, brandColor: true, logoUrl: true, preferences: true } });
  if (!tenant || !resolveTenantPreferences(tenant.preferences).coverage.enabled) throw new NotFoundError("Signup page");
  return tenant;
}

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) throw new ConflictError("Leads belong to an ISP account");
  return tenantId;
}

export async function leadRoutes(app: FastifyInstance): Promise<void> {
  // ------------------------------------------------------------------ Public
  const publicConfig = { config: { audience: "public" as const, rateLimit: authRateLimitConfig } };

  app.get("/signup/:tenantSlug", { config: { audience: "public" as const } }, async (request, reply) => {
    const { tenantSlug } = slugParams.parse(request.params);
    const tenant = await signupTenant(tenantSlug);
    const packages = await prisma.package.findMany({
      where: { tenantId: tenant.id, isActive: true, deletedAt: null },
      select: { id: true, name: true, downloadKbps: true, uploadKbps: true, priceMinor: true, currency: true, billingCycle: true },
      orderBy: { priceMinor: "asc" },
    });
    reply.send(successResponse({ isp: tenant.name, slug: tenant.slug, brandColor: tenant.brandColor, logoUrl: tenant.logoUrl, packages }, request.id));
  });

  app.get("/signup/:tenantSlug/coverage", publicConfig, async (request, reply) => {
    const { tenantSlug } = slugParams.parse(request.params);
    const q = z.object({ lat, lng }).parse(request.query);
    const tenant = await signupTenant(tenantSlug);
    reply.send(successResponse(await checkCoverage(tenant.id, q.lat, q.lng), request.id));
  });

  app.post("/signup/:tenantSlug/leads", publicConfig, async (request, reply) => {
    const { tenantSlug } = slugParams.parse(request.params);
    const body = z
      .object({
        fullName: z.string().trim().min(2).max(100),
        phone: z.string().trim().min(9).max(15),
        email: z.string().trim().toLowerCase().email().optional().or(z.literal("").transform(() => undefined)),
        address: z.string().trim().min(3).max(300),
        latitude: lat.optional(),
        longitude: lng.optional(),
        packageId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
        notes: z.string().trim().max(1000).optional(),
        /** Left empty by people; filled in by form-filling bots. */
        website: z.string().max(0).optional(),
      })
      .parse(request.body);
    const tenant = await signupTenant(tenantSlug);
    // The same phone asking again the same day updates nothing and just says thanks.
    const recent = await prisma.lead.findFirst({ where: { tenantId: tenant.id, phone: body.phone, createdAt: { gte: new Date(Date.now() - 86_400_000) } } });
    if (recent) return reply.status(201).send(successResponse({ received: true, covered: recent.covered }, request.id));

    const coverage = body.latitude !== undefined && body.longitude !== undefined ? await checkCoverage(tenant.id, body.latitude, body.longitude) : null;
    const pkg = body.packageId ? await prisma.package.findFirst({ where: { id: body.packageId, tenantId: tenant.id }, select: { id: true, name: true } }) : null;
    const lead = await prisma.lead.create({
      data: {
        tenantId: tenant.id,
        fullName: body.fullName,
        phone: body.phone,
        email: body.email ?? null,
        address: body.address,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        covered: coverage?.covered ?? null,
        distanceKm: coverage?.distanceKm ?? null,
        nearestSite: coverage?.nearestSite ?? null,
        packageId: pkg?.id ?? null,
        packageName: pkg?.name ?? null,
        notes: body.notes || null,
      },
    });
    const first = body.fullName.split(/\s+/)[0];
    void sendTenantSms(tenant.id, body.phone, `Hi ${first}, thank you for your interest in ${tenant.name}. We have your request and will call you soon to arrange your connection.`).catch(() => null);
    void pushToTenantStaff(tenant.id, "customers.read", {
      title: `New signup request: ${body.fullName}`,
      body: `${body.address}${coverage?.covered === true ? " · in coverage" : coverage?.covered === false ? ` · ${coverage.distanceKm} km from coverage` : ""}`,
      url: "/customers/leads",
      tag: `lead-${lead.id}`,
    }).catch(() => 0);
    reply.status(201).send(successResponse({ received: true, covered: lead.covered }, request.id));
  });

  // ------------------------------------------------------------------ Staff
  const read = { config: { audience: "staff" as const }, preHandler: [...preHandler, requirePermission("customers.read")] };
  const write = { config: { audience: "staff" as const }, preHandler: [...preHandler, requirePermission("customers.update")] };

  app.get("/leads", read, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const { status } = z.object({ status: z.enum(["NEW", "CONTACTED", "BOOKED", "WON", "LOST", "OPEN"]).default("OPEN") }).parse(request.query);
    const where = { tenantId, ...(status === "OPEN" ? { status: { in: ["NEW", "CONTACTED", "BOOKED"] as ("NEW" | "CONTACTED" | "BOOKED")[] } } : { status }) };
    const [leads, counts] = await Promise.all([
      prisma.lead.findMany({ where, orderBy: { createdAt: "desc" }, take: 200, include: { jobCard: { select: { id: true, number: true, status: true } } } }),
      prisma.lead.groupBy({ by: ["status"], where: { tenantId }, _count: { _all: true } }),
    ]);
    reply.send(successResponse({ leads, counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) }, request.id));
  });

  app.patch("/leads/:leadId", write, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const { leadId } = leadParams.parse(request.params);
    const body = z.object({ status: z.enum(["NEW", "CONTACTED", "BOOKED", "LOST"]).optional(), notes: z.string().max(1000).nullish(), lostReason: z.string().max(200).nullish() }).parse(request.body);
    const res = await prisma.lead.updateMany({ where: { id: leadId, tenantId, status: { not: "WON" } }, data: body });
    if (res.count === 0) throw new NotFoundError("Open lead");
    await writeAuditLog({ tenantId, actorUserId: request.user!.id, action: "lead.updated", resourceType: "Lead", resourceId: leadId, after: body, ipAddress: request.ip, userAgent: request.headers["user-agent"] ?? null });
    reply.send(successResponse({ updated: true }, request.id));
  });

  /** Makes the lead a customer and books the installation (or a survey first). */
  app.post("/leads/:leadId/convert", { config: { audience: "staff" as const }, preHandler: [...preHandler, requirePermission("customers.create")] }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const { leadId } = leadParams.parse(request.params);
    const body = z
      .object({
        jobType: z.enum(["INSTALLATION", "SURVEY"]).default("INSTALLATION"),
        scheduledFor: z.coerce.date().optional(),
        assignedToUserId: z.string().uuid().optional(),
        branchId: z.string().uuid().optional(),
      })
      .parse(request.body ?? {});
    const lead = await prisma.lead.findFirst({ where: { id: leadId, tenantId } });
    if (!lead) throw new NotFoundError("Lead");
    if (lead.customerId) throw new ConflictError("This lead is already a customer");
    if (body.assignedToUserId && !(await prisma.user.findFirst({ where: { id: body.assignedToUserId, tenantId }, select: { id: true } }))) throw new NotFoundError("Technician");
    if (body.branchId && !(await prisma.branch.findFirst({ where: { id: body.branchId, tenantId }, select: { id: true } }))) throw new NotFoundError("Branch");

    const customer = await createCustomer(tenantId, {
      fullName: lead.fullName,
      phone: lead.phone,
      email: lead.email,
      address: lead.address,
      gpsLat: lead.latitude,
      gpsLng: lead.longitude,
      branchId: body.branchId ?? null,
    });
    let job: JobCard | null = null;
    for (let attempt = 0; attempt < 5 && !job; attempt++) {
      try {
        job = await prisma.jobCard.create({
          data: {
            tenantId,
            number: await nextJobNumber(tenantId, attempt),
            type: body.jobType,
            title: `${body.jobType === "SURVEY" ? "Site survey" : "Installation"} for ${lead.fullName}${lead.packageName ? ` (${lead.packageName})` : ""}`,
            notes: [lead.notes, lead.covered === false ? `Outside coverage: ${lead.distanceKm} km from ${lead.nearestSite}` : null].filter(Boolean).join("\n") || null,
            customerId: customer.id,
            address: lead.address,
            contactPhone: lead.phone,
            assignedToUserId: body.assignedToUserId ?? null,
            scheduledFor: body.scheduledFor ?? null,
            createdByUserId: request.user!.id,
          },
        });
      } catch (err) {
        if ((err as { code?: string }).code !== "P2002") throw err;
      }
    }
    if (!job) throw new ConflictError("Could not number the job, try again");
    await prisma.lead.update({ where: { id: leadId }, data: { status: "WON", customerId: customer.id, jobCardId: job.id } });
    await writeAuditLog({ tenantId, actorUserId: request.user!.id, action: "lead.converted", resourceType: "Lead", resourceId: leadId, after: { customerId: customer.id, jobNumber: job.number }, ipAddress: request.ip, userAgent: request.headers["user-agent"] ?? null });
    reply.status(201).send(successResponse({ customerId: customer.id, customerNumber: customer.customerNumber, jobId: job.id, jobNumber: job.number }, request.id));
  });
}
