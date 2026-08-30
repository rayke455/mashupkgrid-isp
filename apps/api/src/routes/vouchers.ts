import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import {
  generateVouchers,
  activateVoucher,
  listHotspotPackages,
  createHotspotPackage,
  updateHotspotPackage,
  deleteHotspotPackage,
} from "@mashupkgrid/radius";
import {
  successResponse,
  ConflictError,
  paginationQuerySchema,
  paginate,
  toSkipTake,
} from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

const generateSchema = z.object({
  count: z.number().int().min(1).max(500),
  hotspotPackageId: z.string().uuid().optional(),
  packageId: z.string().uuid().optional(),
  durationMinutes: z.number().int().positive().optional(),
  dataCapMb: z.number().int().positive().optional(),
  downloadKbps: z.number().int().positive().optional(),
  uploadKbps: z.number().int().positive().optional(),
});

const createPackageSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().max(255).nullable().optional(),
  priceMinor: z.number().int().nonnegative(),
  currency: z.string().min(3).max(3).default("KES"),
  durationMinutes: z.number().int().positive(),
  dataCapMb: z.number().int().positive().nullable().optional(),
  downloadKbps: z.number().int().positive().nullable().optional(),
  uploadKbps: z.number().int().positive().nullable().optional(),
  isPopular: z.boolean().optional(),
  // .nullable() matters here specifically: the "remove Most Popular" toggle sends
  // `badge: null` to clear a previously-set badge, and without this the whole PATCH — including
  // isPopular:false — was rejected by validation before ever reaching the service (confirmed
  // live: "Expected string, received null").
  badge: z.string().max(32).nullable().optional(),
});

const updatePackageSchema = createPackageSchema.partial().extend({
  isActive: z.boolean().optional(),
});

const listQuerySchema = paginationQuerySchema.extend({
  status: z.enum(["UNUSED", "ACTIVE", "EXPIRED", "USED"]).optional(),
  hotspotPackageId: z.string().uuid().optional(),
});

const codeParamsSchema = z.object({ code: z.string().min(1) });
const packageIdParamsSchema = z.object({ id: z.string().uuid() });

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) throw new ConflictError("Voucher management is not available at the platform level");
  return tenantId;
}

export async function voucherRoutes(app: FastifyInstance): Promise<void> {
  // --- Hotspot Package Management ---

  app.get(
    "/packages",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("radius.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const packages = await listHotspotPackages(tenantId);
      reply.send(successResponse(packages, request.id));
    }
  );

  app.post(
    "/packages",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("radius.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const body = createPackageSchema.parse(request.body);
      const pkg = await createHotspotPackage(tenantId, body);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "hotspot_package.created",
        resourceType: "HotspotPackage",
        resourceId: pkg.id,
        after: pkg,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.status(201).send(successResponse(pkg, request.id));
    }
  );

  app.patch(
    "/packages/:id",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("radius.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { id } = packageIdParamsSchema.parse(request.params);
      const body = updatePackageSchema.parse(request.body);
      const pkg = await updateHotspotPackage(tenantId, id, body);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "hotspot_package.updated",
        resourceType: "HotspotPackage",
        resourceId: pkg.id,
        after: pkg,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(pkg, request.id));
    }
  );

  app.delete(
    "/packages/:id",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("radius.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { id } = packageIdParamsSchema.parse(request.params);
      await deleteHotspotPackage(tenantId, id);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "hotspot_package.deleted",
        resourceType: "HotspotPackage",
        resourceId: id,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse({ success: true }, request.id));
    }
  );

  // --- Purchases: every completed hotspot sale (M-Pesa + Paystack), joined with its voucher's
  // live usage — this is the answer to "which customers actually paid and how much have they
  // used," which until now had no single view: the payment rows and the usage-tracking radius
  // accounting (radius-server.ts's recordVoucherUsage) both existed, but nothing combined them.

  app.get(
    "/purchases",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("radius.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);

      const [mpesaRows, paystackRows] = await Promise.all([
        prisma.mpesaStkRequest.findMany({
          where: { tenantId, status: "COMPLETED", hotspotPackageId: { not: null } },
          include: { hotspotPackage: true },
          orderBy: { updatedAt: "desc" },
          take: 200,
        }),
        prisma.paystackTransaction.findMany({
          where: { tenantId, status: "COMPLETED", hotspotPackageId: { not: null } },
          include: { hotspotPackage: true },
          orderBy: { updatedAt: "desc" },
          take: 200,
        }),
      ]);

      const combined = [
        ...mpesaRows.map((r) => ({
          method: "MPESA" as const,
          contact: r.phone,
          amountMinor: r.amountMinor,
          currency: "KES",
          packageName: r.hotspotPackage?.name ?? null,
          voucherCode: r.hotspotVoucherCode,
          receiptNumber: r.mpesaReceiptNumber,
          paidAt: r.updatedAt,
        })),
        ...paystackRows.map((r) => ({
          method: "PAYSTACK" as const,
          contact: r.hotspotEmail,
          amountMinor: r.amountMinor,
          currency: r.currency,
          packageName: r.hotspotPackage?.name ?? null,
          voucherCode: r.hotspotVoucherCode,
          receiptNumber: r.reference,
          paidAt: r.updatedAt,
        })),
      ].sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());

      const codes = combined.map((c) => c.voucherCode).filter((c): c is string => !!c);
      const vouchers = codes.length
        ? await prisma.hotspotVoucher.findMany({ where: { tenantId, code: { in: codes } } })
        : [];
      const voucherByCode = new Map(vouchers.map((v) => [v.code, v]));

      const rows = combined.map((c) => {
        const voucher = c.voucherCode ? voucherByCode.get(c.voucherCode) : undefined;
        return {
          ...c,
          voucherStatus: voucher?.status ?? null,
          dataCapMb: voucher?.dataCapMb ?? null,
          bytesIn: voucher?.bytesIn != null ? Number(voucher.bytesIn) : null,
          bytesOut: voucher?.bytesOut != null ? Number(voucher.bytesOut) : null,
          usageUpdatedAt: voucher?.usageUpdatedAt ?? null,
          expiresAt: voucher?.expiresAt ?? null,
        };
      });

      reply.send(successResponse(rows, request.id));
    }
  );

  // --- Vouchers ---

  app.get(
    "/",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("radius.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const query = listQuerySchema.parse(request.query);
      const where = {
        tenantId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.hotspotPackageId ? { hotspotPackageId: query.hotspotPackageId } : {}),
      };
      const [items, total] = await Promise.all([
        prisma.hotspotVoucher.findMany({
          where,
          include: { hotspotPackage: true },
          ...toSkipTake(query),
          orderBy: { createdAt: "desc" },
        }),
        prisma.hotspotVoucher.count({ where }),
      ]);
      reply.send(successResponse(paginate(items, total, query), request.id));
    }
  );

  app.post(
    "/",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("radius.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const body = generateSchema.parse(request.body);
      const vouchers = await generateVouchers({
        tenantId,
        createdByUserId: request.user!.id,
        count: body.count,
        hotspotPackageId: body.hotspotPackageId ?? null,
        packageId: body.packageId ?? null,
        durationMinutes: body.durationMinutes ?? null,
        dataCapMb: body.dataCapMb ?? null,
        downloadKbps: body.downloadKbps ?? null,
        uploadKbps: body.uploadKbps ?? null,
      });

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "voucher.generated",
        resourceType: "HotspotVoucher",
        resourceId: vouchers[0]?.id ?? "batch",
        after: { count: vouchers.length, hotspotPackageId: body.hotspotPackageId ?? null },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.status(201).send(successResponse(vouchers, request.id));
    }
  );

  app.post(
    "/:code/activate",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("radius.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { code } = codeParamsSchema.parse(request.params);
      const voucher = await activateVoucher(tenantId, code);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "voucher.activated",
        resourceType: "HotspotVoucher",
        resourceId: voucher.id,
        after: { status: voucher.status, expiresAt: voucher.expiresAt },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(voucher, request.id));
    }
  );
}
