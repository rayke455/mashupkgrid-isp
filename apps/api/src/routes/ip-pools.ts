import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import { createIpPool, poolUsageSummary, allocateIpAddress, releaseIpAddress } from "@mashupkgrid/radius";
import { successResponse, ConflictError } from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

const createPoolSchema = z.object({
  name: z.string().min(1),
  version: z.enum(["IPV4", "IPV6"]),
  cidr: z.string().min(1),
  routerId: z.string().uuid().optional(),
  gateway: z.string().optional(),
  dnsServers: z.array(z.string()).optional(),
});

const idParamsSchema = z.object({ poolId: z.string().uuid() });
const allocateSchema = z.object({ radiusUserId: z.string().uuid() });
const releaseSchema = z.object({ radiusUserId: z.string().uuid() });

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) throw new ConflictError("IP pool management is not available at the platform level");
  return tenantId;
}

export async function ipPoolRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const pools = await prisma.iPPool.findMany({ where: { tenantId }, orderBy: { name: "asc" } });
      const withUsage = await Promise.all(
        pools.map(async (pool) => ({ ...pool, usage: await poolUsageSummary(tenantId, pool.id) }))
      );
      reply.send(successResponse(withUsage, request.id));
    }
  );

  app.post(
    "/",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const body = createPoolSchema.parse(request.body);
      const pool = await createIpPool(prisma, {
        tenantId,
        routerId: body.routerId ?? null,
        name: body.name,
        version: body.version,
        cidr: body.cidr,
        gateway: body.gateway ?? null,
        dnsServers: body.dnsServers ?? [],
      });

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "ip_pool.created",
        resourceType: "IPPool",
        resourceId: pool.id,
        after: pool,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.status(201).send(successResponse(pool, request.id));
    }
  );

  app.get(
    "/:poolId/usage",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { poolId } = idParamsSchema.parse(request.params);
      reply.send(successResponse(await poolUsageSummary(tenantId, poolId), request.id));
    }
  );

  app.post(
    "/:poolId/allocate",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("radius.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { poolId } = idParamsSchema.parse(request.params);
      const { radiusUserId } = allocateSchema.parse(request.body);
      const address = await allocateIpAddress(tenantId, poolId, radiusUserId);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "ip_pool.address_allocated",
        resourceType: "IPAddress",
        resourceId: address.id,
        after: { poolId, radiusUserId, address: address.address },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(address, request.id));
    }
  );

  app.post(
    "/release",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("radius.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { radiusUserId } = releaseSchema.parse(request.body);
      await releaseIpAddress(tenantId, radiusUserId);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "ip_pool.address_released",
        resourceType: "IPAddress",
        resourceId: radiusUserId,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.status(204).send();
    }
  );
}
