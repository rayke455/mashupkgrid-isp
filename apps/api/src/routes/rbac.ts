import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import { assertNoPrivilegeEscalation } from "@mashupkgrid/auth";
import { successResponse, NotFoundError, ConflictError, type PermissionKey } from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import {
  getCachedPermissions,
  invalidatePermissionCache,
  invalidatePermissionCacheForRole,
} from "../lib/permission-cache.js";
import { writeAuditLog } from "../lib/audit.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

const createRoleSchema = z.object({
  name: z.string().min(2).max(50),
  permissionKeys: z.array(z.string()).default([]),
});

const attachPermissionsSchema = z.object({ permissionKeys: z.array(z.string()).min(1) });

const assignRoleSchema = z.object({ userId: z.string().uuid(), roleId: z.string().uuid() });

export async function rbacRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/permissions",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("roles.read")] },
    async (request, reply) => {
      const permissions = await prisma.permission.findMany({ orderBy: { key: "asc" } });
      reply.send(successResponse(permissions, request.id));
    }
  );

  app.get(
    "/roles",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("roles.read")] },
    async (request, reply) => {
      const tenantId = request.user!.tenantId;
      const roles = await prisma.role.findMany({
        where: { OR: [{ tenantId: null }, { tenantId }] },
        include: { rolePermissions: { include: { permission: true } } },
        orderBy: { name: "asc" },
      });
      reply.send(
        successResponse(
          roles.map((r) => ({
            id: r.id,
            name: r.name,
            isSystem: r.isSystem,
            tenantId: r.tenantId,
            permissions: r.rolePermissions.map((rp) => rp.permission.key),
          })),
          request.id
        )
      );
    }
  );

  app.post(
    "/roles",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("roles.manage")] },
    async (request, reply) => {
      const tenantId = request.user!.tenantId;
      if (tenantId === null) {
        throw new ConflictError("Platform-scoped custom roles are not supported in Phase 1");
      }
      const body = createRoleSchema.parse(request.body);

      const grantorPermissions = await getCachedPermissions(request.user!.id, tenantId);
      assertNoPrivilegeEscalation(grantorPermissions, body.permissionKeys);

      const existing = await prisma.role.findFirst({ where: { tenantId, name: body.name } });
      if (existing) throw new ConflictError("A role with this name already exists for this tenant");

      const permissions = await prisma.permission.findMany({ where: { key: { in: body.permissionKeys } } });

      const role = await prisma.role.create({
        data: {
          tenantId,
          name: body.name,
          isSystem: false,
          rolePermissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
        },
      });

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "role.created",
        resourceType: "Role",
        resourceId: role.id,
        after: { name: role.name, permissions: body.permissionKeys },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.status(201).send(successResponse(role, request.id));
    }
  );

  app.post(
    "/roles/:roleId/permissions",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("roles.manage")] },
    async (request, reply) => {
      const { roleId } = z.object({ roleId: z.string().uuid() }).parse(request.params);
      const body = attachPermissionsSchema.parse(request.body);
      const tenantId = request.user!.tenantId;

      const role = await prisma.role.findUnique({ where: { id: roleId } });
      if (!role || (role.tenantId !== null && role.tenantId !== tenantId) || role.isSystem) {
        throw new NotFoundError("Role");
      }

      const grantorPermissions = await getCachedPermissions(request.user!.id, tenantId);
      assertNoPrivilegeEscalation(grantorPermissions, body.permissionKeys);

      const permissions = await prisma.permission.findMany({ where: { key: { in: body.permissionKeys } } });
      await prisma.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
        skipDuplicates: true,
      });
      // Every current holder of this role gets the new permission immediately, not up to
      // PERMISSION_CACHE_TTL_SECONDS later — same reasoning as the per-user invalidation the
      // sibling /user-roles routes below already do for a role *assignment* change.
      await invalidatePermissionCacheForRole(role.id);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "role.permissions_attached",
        resourceType: "Role",
        resourceId: role.id,
        after: { addedPermissions: body.permissionKeys },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse({ attached: body.permissionKeys as PermissionKey[] }, request.id));
    }
  );

  app.post(
    "/user-roles",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("staff.manage")] },
    async (request, reply) => {
      const body = assignRoleSchema.parse(request.body);
      const tenantId = request.user!.tenantId;
      if (tenantId === null) {
        throw new ConflictError("Platform-scoped role assignment is not supported in Phase 1");
      }

      const [targetUser, role] = await Promise.all([
        prisma.user.findUnique({ where: { id: body.userId } }),
        prisma.role.findUnique({ where: { id: body.roleId }, include: { rolePermissions: { include: { permission: true } } } }),
      ]);
      if (!targetUser || targetUser.tenantId !== tenantId) throw new NotFoundError("User");
      // role.tenantId === null legitimately includes every SYSTEM_ROLE_PERMISSIONS template
      // (ISP_OWNER, ADMIN, ...) — a tenant owner assigning "ADMIN" to a new staff member is
      // exactly that, and must keep working. What must NOT be assignable this way is SUPER_ADMIN
      // (or any future global role) carrying a platform-only permission (tenants.*, plans.manage,
      // maintenance.manage) the grantor doesn't themselves hold — see the privilege-escalation
      // check right below, which is what actually closes that hole.
      if (!role || (role.tenantId !== null && role.tenantId !== tenantId)) throw new NotFoundError("Role");

      // Same check the other two role-mutating routes in this file already apply: a grantor can
      // never hand out a permission they don't themselves hold. Without this, any tenant admin
      // holding staff.manage could look up SUPER_ADMIN's role id (GET /rbac/roles returns every
      // tenantId: null role) and assign it to themselves, silently inheriting every platform-only
      // permission (tenants.*, plans.manage, maintenance.manage) while their JWT's tenantId stays
      // their own — a full platform takeover this route was never meant to allow.
      const grantorPermissions = await getCachedPermissions(request.user!.id, tenantId);
      assertNoPrivilegeEscalation(
        grantorPermissions,
        role.rolePermissions.map((rp) => rp.permission.key)
      );

      const userRole = await prisma.userRole.upsert({
        where: { userId_roleId_tenantId: { userId: body.userId, roleId: body.roleId, tenantId } },
        update: {},
        create: { userId: body.userId, roleId: body.roleId, tenantId },
      });

      await invalidatePermissionCache(body.userId, tenantId);
      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "user_role.assigned",
        resourceType: "UserRole",
        resourceId: userRole.id,
        after: { userId: body.userId, roleId: body.roleId },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.status(201).send(successResponse(userRole, request.id));
    }
  );

  app.delete(
    "/user-roles/:userRoleId",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("staff.manage")] },
    async (request, reply) => {
      const { userRoleId } = z.object({ userRoleId: z.string().uuid() }).parse(request.params);
      const tenantId = request.user!.tenantId;

      const userRole = await prisma.userRole.findUnique({ where: { id: userRoleId } });
      if (!userRole || userRole.tenantId !== tenantId) throw new NotFoundError("UserRole");

      await prisma.userRole.delete({ where: { id: userRoleId } });
      await invalidatePermissionCache(userRole.userId, tenantId);
      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "user_role.revoked",
        resourceType: "UserRole",
        resourceId: userRoleId,
        before: { userId: userRole.userId, roleId: userRole.roleId },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse({ revoked: true }, request.id));
    }
  );
}
