import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import { createPackage, updatePackage, setPackageActive, getPackageOrThrow } from "@mashupkgrid/billing";
import {
  successResponse,
  ConflictError,
  paginationQuerySchema,
  paginate,
  toSkipTake,
  buildSafeOrderBy,
} from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

const billingCycleSchema = z.enum(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"]);

const createPackageSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  downloadKbps: z.number().int().positive(),
  uploadKbps: z.number().int().positive(),
  burstDownloadKbps: z.number().int().positive().optional(),
  burstUploadKbps: z.number().int().positive().optional(),
  dataCapMb: z.number().int().positive().optional(),
  billingCycle: billingCycleSchema,
  durationDays: z.number().int().positive().optional(),
  priceMinor: z.number().int().nonnegative(),
  currency: z.string().length(3).optional(),
  installationFeeMinor: z.number().int().nonnegative().optional(),
  activationFeeMinor: z.number().int().nonnegative().optional(),
  taxPercent: z.number().int().min(0).max(100).optional(),
});

const updatePackageSchema = createPackageSchema
  .omit({ billingCycle: true, durationDays: true })
  .partial();

const listQuerySchema = paginationQuerySchema.extend({
  activeOnly: z.coerce.boolean().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

const idParamsSchema = z.object({ packageId: z.string().uuid() });
const SORTABLE_FIELDS = ["name", "priceMinor", "createdAt"] as const;

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) throw new ConflictError("Package management is not available at the platform level");
  return tenantId;
}

export async function packageRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("packages.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const query = listQuerySchema.parse(request.query);
      const where = { tenantId, deletedAt: null, ...(query.activeOnly ? { isActive: true } : {}) };
      const [items, total] = await Promise.all([
        prisma.package.findMany({
          where,
          ...toSkipTake(query),
          orderBy: buildSafeOrderBy(query.sortBy, query.sortOrder, SORTABLE_FIELDS, "createdAt"),
        }),
        prisma.package.count({ where }),
      ]);
      reply.send(successResponse(paginate(items, total, query), request.id));
    }
  );

  app.post(
    "/",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("packages.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const body = createPackageSchema.parse(request.body);
      const pkg = await createPackage(tenantId, body);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "package.created",
        resourceType: "Package",
        resourceId: pkg.id,
        after: pkg,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.status(201).send(successResponse(pkg, request.id));
    }
  );

  app.get(
    "/:packageId",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("packages.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { packageId } = idParamsSchema.parse(request.params);
      reply.send(successResponse(await getPackageOrThrow(tenantId, packageId), request.id));
    }
  );

  app.patch(
    "/:packageId",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("packages.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { packageId } = idParamsSchema.parse(request.params);
      const body = updatePackageSchema.parse(request.body);
      const before = await getPackageOrThrow(tenantId, packageId);
      const after = await updatePackage(tenantId, packageId, body);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "package.updated",
        resourceType: "Package",
        resourceId: packageId,
        before,
        after,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(after, request.id));
    }
  );

  app.post(
    "/:packageId/archive",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("packages.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { packageId } = idParamsSchema.parse(request.params);
      const after = await setPackageActive(tenantId, packageId, false);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "package.archived",
        resourceType: "Package",
        resourceId: packageId,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(after, request.id));
    }
  );

  app.post(
    "/:packageId/activate",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("packages.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { packageId } = idParamsSchema.parse(request.params);
      const after = await setPackageActive(tenantId, packageId, true);
      reply.send(successResponse(after, request.id));
    }
  );
}
