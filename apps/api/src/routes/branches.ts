import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import { successResponse, ConflictError, NotFoundError } from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";

/**
 * Branches: the towns or areas an ISP runs. Routers, customers and staff can each belong to one,
 * and lists and reports filter by it. Deleting a branch never deletes what was in it: those
 * records simply become "no branch".
 */

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;
const branchSchema = z.object({
  name: z.string().trim().min(2).max(60),
  location: z.string().trim().max(120).nullable().optional(),
});
const idParams = z.object({ branchId: z.string().uuid() });
const assignSchema = z.object({
  kind: z.enum(["router", "customer", "staff"]),
  ids: z.array(z.string().uuid()).min(1).max(500),
  branchId: z.string().uuid().nullable(),
});

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) throw new ConflictError("Branches belong to an ISP account");
  return tenantId;
}

export async function branchRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("customers.read")] }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const branches = await prisma.branch.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      include: { _count: { select: { routers: true, customers: true, users: true } } },
    });
    reply.send(
      successResponse(
        branches.map((b) => ({ id: b.id, name: b.name, location: b.location, createdAt: b.createdAt, routers: b._count.routers, customers: b._count.customers, staff: b._count.users })),
        request.id
      )
    );
  });

  app.post("/", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("settings.manage")] }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const body = branchSchema.parse(request.body);
    const existing = await prisma.branch.findUnique({ where: { tenantId_name: { tenantId, name: body.name } } });
    if (existing) throw new ConflictError(`A branch called "${body.name}" already exists`);
    const branch = await prisma.branch.create({ data: { tenantId, name: body.name, location: body.location ?? null } });
    await writeAuditLog({ tenantId, actorUserId: request.user!.id, action: "branch.created", resourceType: "Branch", resourceId: branch.id, after: { name: branch.name }, ipAddress: request.ip, userAgent: request.headers["user-agent"] ?? null });
    reply.status(201).send(successResponse(branch, request.id));
  });

  app.patch("/:branchId", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("settings.manage")] }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const { branchId } = idParams.parse(request.params);
    const body = branchSchema.partial().parse(request.body);
    const before = await prisma.branch.findFirst({ where: { id: branchId, tenantId } });
    if (!before) throw new NotFoundError("Branch");
    if (body.name && body.name !== before.name) {
      const clash = await prisma.branch.findUnique({ where: { tenantId_name: { tenantId, name: body.name } } });
      if (clash) throw new ConflictError(`A branch called "${body.name}" already exists`);
    }
    const branch = await prisma.branch.update({ where: { id: branchId }, data: { ...(body.name ? { name: body.name } : {}), ...(body.location !== undefined ? { location: body.location } : {}) } });
    await writeAuditLog({ tenantId, actorUserId: request.user!.id, action: "branch.updated", resourceType: "Branch", resourceId: branchId, before: { name: before.name }, after: { name: branch.name }, ipAddress: request.ip, userAgent: request.headers["user-agent"] ?? null });
    reply.send(successResponse(branch, request.id));
  });

  app.delete("/:branchId", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("settings.manage")] }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const { branchId } = idParams.parse(request.params);
    const branch = await prisma.branch.findFirst({ where: { id: branchId, tenantId } });
    if (!branch) throw new NotFoundError("Branch");
    // ON DELETE SET NULL on every reference: routers, customers and staff stay, unassigned.
    await prisma.branch.delete({ where: { id: branchId } });
    await writeAuditLog({ tenantId, actorUserId: request.user!.id, action: "branch.deleted", resourceType: "Branch", resourceId: branchId, before: { name: branch.name }, ipAddress: request.ip, userAgent: request.headers["user-agent"] ?? null });
    reply.send(successResponse({ deleted: true }, request.id));
  });

  /** Moves routers, customers or staff into a branch (or out of any, with branchId null). Every
   *  id must belong to this tenant; ids from anywhere else are ignored rather than touched. */
  app.post("/assign", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("settings.manage")] }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const body = assignSchema.parse(request.body);
    if (body.branchId) {
      const branch = await prisma.branch.findFirst({ where: { id: body.branchId, tenantId } });
      if (!branch) throw new NotFoundError("Branch");
    }
    const where = { tenantId, id: { in: body.ids } };
    const data = { branchId: body.branchId };
    const result =
      body.kind === "router"
        ? await prisma.router.updateMany({ where, data })
        : body.kind === "customer"
        ? await prisma.customer.updateMany({ where, data })
        : await prisma.user.updateMany({ where, data });
    await writeAuditLog({ tenantId, actorUserId: request.user!.id, action: "branch.assigned", resourceType: "Branch", resourceId: body.branchId, after: { kind: body.kind, count: result.count }, ipAddress: request.ip, userAgent: request.headers["user-agent"] ?? null });
    reply.send(successResponse({ updated: result.count }, request.id));
  });
}
