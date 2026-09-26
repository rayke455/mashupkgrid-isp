import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import {
  recordPaymentForInvoice,
  restoreServiceAfterPayment,
  topUpWallet,
  refundPaymentWithDb,
  getStampedPaymentReceipt,
  renderReceiptPdf,
} from "@mashupkgrid/billing";
import {
  listPurchaseAttempts,
  summarisePurchaseAttempts,
  reverseGatewayTransactionForPayment,
  purgePurchaseAttempts,
  deletePurchaseAttempt,
} from "@mashupkgrid/payments";
import {
  successResponse,
  ConflictError,
  NotFoundError,
  paginationQuerySchema,
  paginate,
  toSkipTake,
  toCsv,
} from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

const paymentMethodSchema = z.enum(["MANUAL", "WALLET", "CASH", "BANK_TRANSFER"]);

const purchaseAttemptsQuerySchema = z.object({
  status: z.enum(["PENDING", "COMPLETED", "FAILED", "ABANDONED"]).optional(),
  days: z.coerce.number().int().min(1).max(90).default(7),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

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

const cleanupSchema = z.object({
  olderThanDays: z.coerce.number().int().min(1).max(3650).default(7),
  statuses: z.array(z.enum(["PENDING", "FAILED", "ABANDONED"])).optional(),
});
const attemptParamsSchema = z.object({ provider: z.enum(["MPESA", "PAYSTACK", "PESAPAL"]), attemptId: z.string().uuid() });

/** Only rows that never moved money are deletable, and never a payment a gateway transaction
 *  hangs off (the ledger's link to real funds — Prisma enforces that with onDelete: Restrict). */
const DELETABLE_PAYMENT_STATUSES = ["FAILED", "PENDING"] as const;
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

  app.get(
    "/:paymentId/receipt.pdf",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("payments.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { paymentId } = idParamsSchema.parse(request.params);
      const pdf = await renderReceiptPdf(tenantId, paymentId);
      reply
        .header("content-type", "application/pdf")
        .header("content-disposition", `attachment; filename="${pdf.filename}"`)
        .send(Buffer.from(pdf.bytes));
    }
  );

  /** Money that arrived without an invoice to land on: a gateway payment whose account number
   *  matched nobody, or a top-up nobody assigned. The row an operator reconciles by hand. */
  app.get(
    "/unmatched",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("payments.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const items = await prisma.payment.findMany({
        where: { tenantId, status: "COMPLETED", invoiceId: null, reversedAt: null, method: { not: "WALLET" } },
        include: { customer: { select: { id: true, fullName: true, phone: true, customerNumber: true } } },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      const totalMinor = items.reduce((sum, p) => sum + p.amountMinor, 0);
      reply.send(successResponse({ items, summary: { count: items.length, totalMinor } }, request.id));
    }
  );

  /** Applies an unmatched payment to an invoice. The invoice's balance moves by the payment's
   *  amount and service is restored if that clears it, exactly as if the money had matched. */
  app.post(
    "/:paymentId/match",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("payments.reconcile")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { paymentId } = idParamsSchema.parse(request.params);
      const { invoiceId } = z.object({ invoiceId: z.string().uuid() }).parse(request.body);

      const result = await prisma.$transaction(async (tx) => {
        const payment = await tx.payment.findFirst({ where: { id: paymentId, tenantId } });
        if (!payment) throw new NotFoundError("Payment");
        if (payment.invoiceId) throw new ConflictError("This payment is already applied to an invoice");
        if (payment.status !== "COMPLETED" || payment.reversedAt) throw new ConflictError("Only a completed payment can be applied");
        const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, tenantId } });
        if (!invoice) throw new NotFoundError("Invoice");
        if (invoice.status === "PAID" || invoice.status === "CANCELLED") throw new ConflictError(`Invoice ${invoice.invoiceNumber} is ${invoice.status.toLowerCase()}`);
        const paid = invoice.amountPaidMinor + payment.amountMinor;
        const status = paid >= invoice.totalMinor ? "PAID" : "PARTIALLY_PAID";
        const updatedInvoice = await tx.invoice.update({
          where: { id: invoice.id },
          data: { amountPaidMinor: paid, status, ...(status === "PAID" ? { paidAt: new Date() } : {}) },
        });
        const updatedPayment = await tx.payment.update({ where: { id: payment.id }, data: { invoiceId: invoice.id, customerId: invoice.customerId } });
        return { payment: updatedPayment, invoice: updatedInvoice };
      });

      if (result.invoice.status === "PAID" && result.invoice.customerId) {
        await restoreServiceAfterPayment(tenantId, result.invoice.customerId);
      }
      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "payment.matched",
        resourceType: "Payment",
        resourceId: paymentId,
        after: { invoiceId, invoiceNumber: result.invoice.invoiceNumber, amountMinor: result.payment.amountMinor },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });
      reply.send(successResponse(result, request.id));
    }
  );

  /** Every coin, as a spreadsheet: one row per payment with who paid, for what, how, and the
   *  receipt reference. Optional ?from=&to= (ISO dates) to bound it. */
  app.get(
    "/export.csv",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("payments.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { from, to } = z.object({ from: z.string().datetime().optional(), to: z.string().datetime().optional() }).parse(request.query);
      const payments = await prisma.payment.findMany({
        where: {
          tenantId,
          ...(from || to ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
        },
        orderBy: { createdAt: "asc" },
        include: {
          customer: { select: { customerNumber: true, fullName: true, phone: true } },
          invoice: { select: { invoiceNumber: true } },
          receipt: { select: { receiptNumber: true } },
        },
      });
      const csv = toCsv(payments, [
        { header: "Date", value: (p) => p.createdAt },
        { header: "Amount", value: (p) => (p.amountMinor / 100).toFixed(2) },
        { header: "Currency", value: (p) => p.currency },
        { header: "Status", value: (p) => p.status },
        { header: "Method", value: (p) => p.method },
        { header: "Reference", value: (p) => p.reference },
        { header: "Receipt", value: (p) => p.receipt?.receiptNumber ?? "" },
        { header: "Invoice", value: (p) => p.invoice?.invoiceNumber ?? "" },
        { header: "Customer number", value: (p) => p.customer?.customerNumber ?? "" },
        { header: "Customer", value: (p) => p.customer?.fullName ?? "Hotspot guest" },
        { header: "Phone", value: (p) => p.customer?.phone ?? "" },
        { header: "Reversed", value: (p) => p.reversedAt },
        { header: "Reversal reason", value: (p) => p.reversalReason },
      ]);
      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "payments.exported",
        resourceType: "Payment",
        after: { rows: payments.length, from: from ?? null, to: to ?? null },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });
      reply
        .header("content-type", "text/csv; charset=utf-8")
        .header("content-disposition", `attachment; filename="payments-${new Date().toISOString().slice(0, 10)}.csv"`)
        .send(csv);
    }
  );

  /** Every payment a customer STARTED, not only the ones that completed — see
   *  listPurchaseAttempts's doc comment for why an abandoned attempt is the most actionable row
   *  a tenant has. Read-only, and gated on payments.read like the payment list above, since it
   *  exposes customer phone numbers and what they tried to buy. */
  app.get(
    "/purchase-attempts",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("payments.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const query = purchaseAttemptsQuerySchema.parse(request.query);
      const [attempts, summary] = await Promise.all([
        listPurchaseAttempts(tenantId, query),
        summarisePurchaseAttempts(tenantId, query.days),
      ]);
      reply.send(successResponse({ attempts, summary }, request.id));
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

      // A suspended customer who just paid at the counter should be back online before they
      // leave it, not on the next scheduled sweep.
      if (!result.wasAlreadyProcessed) await restoreServiceAfterPayment(tenantId, result.payment.customerId);

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

  // --- housekeeping: the rows that will never be money -------------------------------------
  //
  // A busy hotspot leaves thousands of failed and abandoned M-Pesa prompts behind. They matter
  // for a week (someone to call back) and are noise after that. All deletion here is
  // tenant-scoped, refuses anything COMPLETED or linked to money that arrived, needs
  // payments.refund (the same trust as reversing money), and is audited with counts.

  app.delete(
    "/purchase-attempts/:provider/:attemptId",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("payments.refund")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { provider, attemptId } = attemptParamsSchema.parse(request.params);
      const deleted = await deletePurchaseAttempt(tenantId, provider, attemptId);
      if (!deleted) throw new ConflictError("This attempt is completed or linked to a payment, so it stays");
      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "purchase_attempt.deleted",
        resourceType: "PurchaseAttempt",
        resourceId: attemptId,
        after: { provider },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });
      reply.send(successResponse({ deleted: true }, request.id));
    }
  );

  app.post(
    "/purchase-attempts/cleanup",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("payments.refund")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const body = cleanupSchema.parse(request.body ?? {});
      const result = await purgePurchaseAttempts(tenantId, body);
      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "purchase_attempts.purged",
        resourceType: "PurchaseAttempt",
        after: { ...body, deleted: result },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });
      reply.send(successResponse({ deleted: result.mpesa + result.gateway, ...result }, request.id));
    }
  );

  app.post(
    "/cleanup",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("payments.refund")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { olderThanDays } = cleanupSchema.parse(request.body ?? {});
      const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
      const result = await prisma.payment.deleteMany({
        where: { tenantId, status: { in: [...DELETABLE_PAYMENT_STATUSES] }, createdAt: { lt: cutoff }, gatewayTransaction: null },
      });
      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "payments.failed_purged",
        resourceType: "Payment",
        after: { olderThanDays, deleted: result.count },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });
      reply.send(successResponse({ deleted: result.count }, request.id));
    }
  );

  app.delete(
    "/:paymentId",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("payments.refund")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { paymentId } = idParamsSchema.parse(request.params);
      const payment = await prisma.payment.findFirst({ where: { id: paymentId, tenantId }, include: { gatewayTransaction: { select: { id: true } } } });
      if (!payment) throw new ConflictError("No such payment in this tenant");
      if (!(DELETABLE_PAYMENT_STATUSES as readonly string[]).includes(payment.status) || payment.gatewayTransaction) {
        throw new ConflictError(
          payment.status === "COMPLETED"
            ? "A completed payment is part of the books; reverse it with a refund instead of deleting it"
            : "This payment is linked to a gateway transaction and cannot be deleted"
        );
      }
      await prisma.payment.delete({ where: { id: paymentId } });
      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "payment.deleted",
        resourceType: "Payment",
        resourceId: paymentId,
        before: { status: payment.status, amountMinor: payment.amountMinor, method: payment.method, reference: payment.reference, createdAt: payment.createdAt },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });
      reply.send(successResponse({ deleted: true }, request.id));
    }
  );

  app.post(
    "/:paymentId/refund",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("payments.refund")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { paymentId } = idParamsSchema.parse(request.params);
      const { reason } = refundSchema.parse(request.body);

      // One transaction: the billing reversal and — if the platform collected this payment — the
      // matching debit on the tenant's gateway balance. Previously only the first happened, so a
      // tenant kept money that had been refunded.
      const { payment, gatewayRefund } = await prisma.$transaction(async (tx) => {
        const reversed = await refundPaymentWithDb(tx, tenantId, paymentId, reason);
        const refund = await reverseGatewayTransactionForPayment(tx, {
          tenantId,
          paymentId,
          reason,
          userId: request.user!.id,
        });
        return { payment: reversed, gatewayRefund: refund };
      });

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "payment.refunded",
        resourceType: "Payment",
        resourceId: paymentId,
        after: {
          reason,
          ...(gatewayRefund
            ? { gatewayRefund: gatewayRefund.refundNumber, debitedFromBalanceMinor: gatewayRefund.amountMinor - gatewayRefund.feeReturnedMinor }
            : {}),
        },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(payment, request.id));
    }
  );

  app.get(
    "/:paymentId/receipt",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("payments.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { paymentId } = idParamsSchema.parse(request.params);
      reply.send(successResponse(await getStampedPaymentReceipt(tenantId, paymentId), request.id));
    }
  );
}
