import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import { recordPaymentForInvoice, topUpWallet, refundPayment } from "@mashupkgrid/billing";
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

const paymentMethodSchema = z.enum(["MANUAL", "WALLET", "CASH", "BANK_TRANSFER"]);

const recordForInvoiceSchema = z.object({
  invoiceId: z.string().uuid(),
  method: paymentMethodSchema,
  amountMinor: z.number().int().positive(),
  reference: z.string().optional(),
  /** Client-supplied idempotency key (e.g. generated once per form submission and reused on
   *  retry) — if omitted the server generates one, which only protects against this single
   *  request, not a client-side double-submit; a real form should always send its own. */
  idempotencyKey: z.string().optional(),
});

const topUpSchema = z.object({
  customerId: z.string().uuid(),
  method: z.enum(["MANUAL", "CASH", "BANK_TRANSFER"]),
  amountMinor: z.number().int().positive(),
  reference: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

const refundSchema = z.object({ reason: z.string().min(1) });

const listQuerySchema = paginationQuerySchema.extend({ customerId: z.string().uuid().optional() });
const idParamsSchema = z.object({ paymentId: z.string().uuid() });

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) throw new ConflictError("Payment management is not available at the platform level");
  return tenantId;
}

export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("payments.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const query = listQuerySchema.parse(request.query);
      const where = { tenantId, ...(query.customerId ? { customerId: query.customerId } : {}) };
      const [items, total] = await Promise.all([
        prisma.payment.findMany({ where, ...toSkipTake(query), orderBy: { createdAt: "desc" } }),
        prisma.payment.count({ where }),
      ]);
      reply.send(successResponse(paginate(items, total, query), request.id));
    }
  );

  app.post(
    "/record",
    {
      config: { audience: "staff", maintenanceCategory: "payment" },
      preHandler: [...preHandler, requirePermission("payments.create")],
    },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const body = recordForInvoiceSchema.parse(request.body);

      const result = await recordPaymentForInvoice(tenantId, {
        invoiceId: body.invoiceId,
        method: body.method,
        amountMinor: body.amountMinor,
        reference: body.reference,
        recordedByUserId: request.user!.id,
        idempotencyKey: body.idempotencyKey ?? randomUUID(),
      });

      if (!result.wasAlreadyProcessed) {
        await writeAuditLog({
          tenantId,
          actorUserId: request.user!.id,
          action: "payment.recorded",
          resourceType: "Payment",
          resourceId: result.payment.id,
          after: { invoiceId: body.invoiceId, amountMinor: body.amountMinor, method: body.method },
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        });
      }

      reply.status(201).send(successResponse(result, request.id));
    }
  );

  app.post(
    "/top-up",
    {
      config: { audience: "staff", maintenanceCategory: "payment" },
      preHandler: [...preHandler, requirePermission("wallet.manage")],
    },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const body = topUpSchema.parse(request.body);

      const result = await topUpWallet(tenantId, {
        customerId: body.customerId,
        method: body.method,
        amountMinor: body.amountMinor,
        reference: body.reference,
        recordedByUserId: request.user!.id,
        idempotencyKey: body.idempotencyKey ?? randomUUID(),
      });

      if (!result.wasAlreadyProcessed) {
        await writeAuditLog({
          tenantId,
          actorUserId: request.user!.id,
          action: "wallet.topped_up",
          resourceType: "Payment",
          resourceId: result.payment.id,
          after: { customerId: body.customerId, amountMinor: body.amountMinor, method: body.method },
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        });
      }

      reply.status(201).send(successResponse(result, request.id));
    }
  );

  app.post(
    "/:paymentId/refund",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("payments.refund")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { paymentId } = idParamsSchema.parse(request.params);
      const { reason } = refundSchema.parse(request.body);

      const payment = await refundPayment(tenantId, paymentId, reason);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "payment.refunded",
        resourceType: "Payment",
        resourceId: paymentId,
        after: { reason },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(payment, request.id));
    }
  );
}
