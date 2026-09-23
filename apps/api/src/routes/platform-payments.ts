import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import {
  getPlatformPaymentsOverview,
  listGatewayTransactions,
  getGatewayTransactionDetail,
  listSettlements,
  getSettlementDetail,
  approveSettlement,
  cancelSettlement,
  resolveSettlement,
  retrySettlement,
  simulateSandboxResult,
  requestSettlement,
  recordGatewayRefund,
  completeGatewayRefund,
  runReconciliation,
  assignPlatformC2BTransaction,
  listWebhookEvents,
  getSettlementSettings,
  updateSettlementSettings,
  getPlatformMpesaConfigStatus,
  getPlatformB2BStatus,
  getPlatformB2CStatus,
  setPlatformMpesaConfig,
  getTenantBalance,
  getActiveDestination,
  presentDestination,
  sandboxSettlementsEnabled,
  buildMpesaCallbackUrl,
} from "@mashupkgrid/payments";
import { successResponse, ForbiddenError, NotFoundError, ValidationError } from "@mashupkgrid/shared";
import { env } from "@mashupkgrid/config";
import { authenticate } from "../plugins/authenticate.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";

/**
 * Super Admin → Payments. Platform-wide by design, so every route here needs two things: a
 * platform-only permission, and a caller who is a platform user (no tenant). The permission alone
 * would already exclude tenants — these keys are not in any tenant role's allow-list — but money
 * routes get the second, independent check too.
 */

async function requirePlatformUser(request: FastifyRequest): Promise<void> {
  if (request.user?.tenantId !== null) throw new ForbiddenError("Platform administrators only");
}

const read = [authenticate, checkMaintenance, requirePlatformUser, requirePermission("platform_payments.read")];
const manage = [authenticate, checkMaintenance, requirePlatformUser, requirePermission("platform_payments.manage")];
const approve = [authenticate, checkMaintenance, requirePlatformUser, requirePermission("settlements.approve")];

const dateParam = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
  .transform((v) => new Date(v))
  .optional();

const idParams = z.object({ id: z.string().uuid() });

function audit(request: FastifyRequest, entry: { action: string; resourceType: string; resourceId?: string | null; tenantId?: string | null; before?: unknown; after?: unknown }) {
  return writeAuditLog({
    tenantId: entry.tenantId ?? null,
    actorUserId: request.user!.id,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId ?? null,
    before: entry.before,
    after: entry.after,
    ipAddress: request.ip,
    userAgent: request.headers["user-agent"] ?? null,
  });
}

const settlementAuditFields = (s: { settlementNumber: string; status: string; amountMinor: number; provider: string; transactionId: string | null }) => ({
  settlementNumber: s.settlementNumber,
  status: s.status,
  amountMinor: s.amountMinor,
  provider: s.provider,
  providerReference: s.transactionId,
});

export async function platformPaymentRoutes(app: FastifyInstance): Promise<void> {
  // --- Overview -------------------------------------------------------------------------------
  app.get("/overview", { config: { audience: "platform" }, preHandler: read }, async (request, reply) => {
    reply.send(successResponse(await getPlatformPaymentsOverview(), request.id));
  });

  // --- Transactions ---------------------------------------------------------------------------
  const transactionQuery = z.object({
    tenantId: z.string().uuid().optional(),
    from: dateParam,
    to: dateParam,
    status: z.enum(["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED", "REVERSED"]).optional(),
    settlementStatus: z.enum(["UNSETTLED", "SETTLEMENT_PENDING", "SETTLED"]).optional(),
    channel: z.enum(["MPESA_STK", "MPESA_C2B"]).optional(),
    search: z.string().max(64).optional(),
    customer: z.string().max(64).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  });

  app.get("/transactions", { config: { audience: "platform" }, preHandler: read }, async (request, reply) => {
    reply.send(successResponse(await listGatewayTransactions(transactionQuery.parse(request.query)), request.id));
  });

  app.get("/transactions/:id", { config: { audience: "platform" }, preHandler: read }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    reply.send(successResponse(await getGatewayTransactionDetail(id), request.id));
  });

  const refundBody = z.object({
    kind: z.enum(["REFUND", "REVERSAL"]),
    amountMinor: z.number().int().positive().optional(),
    reason: z.string().trim().min(3).max(500),
    moneyAlreadyReturned: z.boolean().optional(),
    externalReference: z.string().trim().max(64).optional(),
  });

  app.post("/transactions/:id/refunds", { config: { audience: "platform" }, preHandler: manage }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = refundBody.parse(request.body);
    if (body.kind === "REFUND" && !body.amountMinor) throw new ValidationError("Enter the amount to refund.");
    const { refund, transaction } = await recordGatewayRefund({ gatewayTransactionId: id, ...body, userId: request.user!.id });
    await audit(request, {
      action: body.kind === "REVERSAL" ? "gateway_transaction.reversed" : "gateway_transaction.refunded",
      resourceType: "GatewayRefund",
      resourceId: refund.id,
      tenantId: refund.tenantId,
      after: {
        refundNumber: refund.refundNumber,
        transaction: transaction.txnNumber,
        amountMinor: refund.amountMinor,
        feeReturnedMinor: refund.feeReturnedMinor,
        status: refund.status,
        reason: refund.reason,
      },
    });
    reply.status(201).send(successResponse({ refund, transaction }, request.id));
  });

  app.post("/refunds/:id/complete", { config: { audience: "platform" }, preHandler: manage }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const { externalReference } = z.object({ externalReference: z.string().trim().min(3).max(64) }).parse(request.body);
    const refund = await completeGatewayRefund(id, externalReference, request.user!.id);
    await audit(request, {
      action: "gateway_refund.customer_paid",
      resourceType: "GatewayRefund",
      resourceId: refund.id,
      tenantId: refund.tenantId,
      before: { status: "PENDING_CUSTOMER_PAYOUT" },
      after: { status: refund.status, externalReference: refund.externalReference },
    });
    reply.send(successResponse(refund, request.id));
  });

  // --- Settlements ----------------------------------------------------------------------------
  const settlementQuery = z.object({
    tenantId: z.string().uuid().optional(),
    status: z.enum(["REQUESTED", "AWAITING_APPROVAL", "PROCESSING", "SETTLED", "FAILED", "CANCELLED"]).optional(),
    provider: z.enum(["MPESA_B2B", "MPESA_B2C", "MANUAL", "SANDBOX"]).optional(),
    from: dateParam,
    to: dateParam,
    search: z.string().max(64).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  });

  app.get("/settlements", { config: { audience: "platform" }, preHandler: read }, async (request, reply) => {
    reply.send(successResponse(await listSettlements(settlementQuery.parse(request.query)), request.id));
  });

  app.get("/settlements/:id", { config: { audience: "platform" }, preHandler: read }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    reply.send(successResponse(await getSettlementDetail(id), request.id));
  });

  app.post("/settlements/:id/approve", { config: { audience: "platform" }, preHandler: approve }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const settlement = await approveSettlement(id, request.user!.id);
    await audit(request, {
      action: "settlement.approved",
      resourceType: "Settlement",
      resourceId: id,
      tenantId: settlement.tenantId,
      before: { status: "AWAITING_APPROVAL" },
      after: settlementAuditFields(settlement),
    });
    reply.send(successResponse(settlement, request.id));
  });

  app.post("/settlements/:id/cancel", { config: { audience: "platform" }, preHandler: approve }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(request.body);
    const before = await prisma.tenantPayout.findUnique({ where: { id }, select: { status: true } });
    const settlement = await cancelSettlement(id, reason, request.user!.id);
    await audit(request, {
      action: "settlement.cancelled",
      resourceType: "Settlement",
      resourceId: id,
      tenantId: settlement.tenantId,
      before,
      after: { ...settlementAuditFields(settlement), reason },
    });
    reply.send(successResponse(settlement, request.id));
  });

  app.post("/settlements/:id/resolve", { config: { audience: "platform" }, preHandler: approve }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = z
      .object({
        outcome: z.enum(["SETTLED", "FAILED"]),
        reference: z.string().trim().max(64).optional(),
        notes: z.string().trim().min(3).max(1000),
      })
      .parse(request.body);
    const settlement = await resolveSettlement(id, body, request.user!.id);
    await audit(request, {
      action: body.outcome === "SETTLED" ? "settlement.marked_settled" : "settlement.marked_failed",
      resourceType: "Settlement",
      resourceId: id,
      tenantId: settlement.tenantId,
      before: { status: "PROCESSING" },
      after: { ...settlementAuditFields(settlement), notes: body.notes },
    });
    reply.send(successResponse(settlement, request.id));
  });

  app.post("/settlements/:id/retry", { config: { audience: "platform" }, preHandler: approve }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const settlement = await retrySettlement(id, request.user!.id);
    await audit(request, {
      action: "settlement.retried",
      resourceType: "Settlement",
      resourceId: settlement.id,
      tenantId: settlement.tenantId,
      after: { ...settlementAuditFields(settlement), retryOf: id },
    });
    reply.status(201).send(successResponse(settlement, request.id));
  });

  app.post("/settlements/:id/simulate", { config: { audience: "platform" }, preHandler: approve }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const { success } = z.object({ success: z.boolean() }).parse(request.body);
    const settlement = await simulateSandboxResult(id, success);
    await audit(request, {
      action: "settlement.sandbox_result_simulated",
      resourceType: "Settlement",
      resourceId: id,
      tenantId: settlement.tenantId,
      after: { ...settlementAuditFields(settlement), simulated: success ? "success" : "failure" },
    });
    reply.send(successResponse(settlement, request.id));
  });

  app.post("/tenants/:tenantId/settle", { config: { audience: "platform" }, preHandler: approve }, async (request, reply) => {
    const { tenantId } = z.object({ tenantId: z.string().uuid() }).parse(request.params);
    const settlement = await requestSettlement({
      tenantId,
      trigger: "ADMIN",
      requestedByUserId: request.user!.id,
      enforceMinimum: false,
    });
    await audit(request, {
      action: "settlement.requested_by_admin",
      resourceType: "Settlement",
      resourceId: settlement.id,
      tenantId,
      after: settlementAuditFields(settlement),
    });
    reply.status(201).send(successResponse(settlement, request.id));
  });

  // --- Tenants on the gateway ------------------------------------------------------------------
  app.get("/tenants", { config: { audience: "platform" }, preHandler: read }, async (request, reply) => {
    const tenants = await prisma.tenant.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, collectionMode: true, feePercentBpsOverride: true, feeFixedMinorOverride: true },
    });
    const rows = await Promise.all(
      tenants.map(async (t) => {
        const [balance, destination] = await Promise.all([getTenantBalance(t.id), getActiveDestination(t.id)]);
        return { ...t, balance, destination: destination ? presentDestination(destination) : null };
      })
    );
    reply.send(successResponse(rows, request.id));
  });

  /** For assigning an unmatched paybill payment: find the customer (and open invoice) it belongs to. */
  app.get("/tenants/:tenantId/customers", { config: { audience: "platform" }, preHandler: manage }, async (request, reply) => {
    const { tenantId } = z.object({ tenantId: z.string().uuid() }).parse(request.params);
    const { search } = z.object({ search: z.string().trim().max(64).optional() }).parse(request.query);
    const customers = await prisma.customer.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { fullName: { contains: search, mode: "insensitive" } },
                { customerNumber: { contains: search, mode: "insensitive" } },
                { phone: { contains: search.replace(/^0/, "") } },
              ],
            }
          : {}),
      },
      orderBy: { fullName: "asc" },
      take: 20,
      select: {
        id: true,
        fullName: true,
        customerNumber: true,
        invoices: {
          where: { status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] } },
          select: { id: true, invoiceNumber: true, totalMinor: true, amountPaidMinor: true },
          orderBy: { dueDate: "asc" },
          take: 10,
        },
      },
    });
    reply.send(successResponse(customers, request.id));
  });

  app.put("/tenants/:tenantId/collection-mode", { config: { audience: "platform" }, preHandler: manage }, async (request, reply) => {
    const { tenantId } = z.object({ tenantId: z.string().uuid() }).parse(request.params);
    const { collectionMode } = z.object({ collectionMode: z.enum(["OWN", "PLATFORM"]) }).parse(request.body);
    const before = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { collectionMode: true } });
    if (!before) throw new NotFoundError("Tenant");
    if (collectionMode === "PLATFORM" && !(await getActiveDestination(tenantId))) {
      throw new ValidationError("This tenant has no settlement destination yet — collecting for them would hold money with nowhere to send it.");
    }
    const after = await prisma.tenant.update({ where: { id: tenantId }, data: { collectionMode }, select: { id: true, collectionMode: true } });
    await audit(request, { action: "tenant.collection_mode_changed", resourceType: "Tenant", resourceId: tenantId, tenantId, before, after });
    reply.send(successResponse(after, request.id));
  });

  app.put("/tenants/:tenantId/fee-override", { config: { audience: "platform" }, preHandler: manage }, async (request, reply) => {
    const { tenantId } = z.object({ tenantId: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        feePercentBpsOverride: z.number().int().min(0).max(10_000).nullable(),
        feeFixedMinorOverride: z.number().int().min(0).max(10_000_000).nullable(),
      })
      .parse(request.body);
    const before = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { feePercentBpsOverride: true, feeFixedMinorOverride: true },
    });
    if (!before) throw new NotFoundError("Tenant");
    const after = await prisma.tenant.update({
      where: { id: tenantId },
      data: body,
      select: { feePercentBpsOverride: true, feeFixedMinorOverride: true },
    });
    await audit(request, { action: "tenant.fee_override_changed", resourceType: "Tenant", resourceId: tenantId, tenantId, before, after });
    reply.send(successResponse(after, request.id));
  });

  // --- Fees & settlement policy -----------------------------------------------------------------
  app.get("/settings", { config: { audience: "platform" }, preHandler: read }, async (request, reply) => {
    reply.send(successResponse(await getSettlementSettings(), request.id));
  });

  app.put("/settings", { config: { audience: "platform" }, preHandler: manage }, async (request, reply) => {
    const body = z
      .object({
        feePercentBps: z.number().int().min(0).max(10_000).optional(),
        feeFixedMinor: z.number().int().min(0).max(10_000_000).optional(),
        settlementMode: z.enum(["AUTOMATIC", "MANUAL"]).optional(),
        settlementFrequency: z.enum(["INSTANT", "DAILY", "WEEKLY", "MANUAL"]).optional(),
        settlementMinimumMinor: z.number().int().min(100).max(1_000_000_000).optional(),
        settlementHourEat: z.number().int().min(0).max(23).optional(),
        settlementWeekday: z.number().int().min(1).max(7).optional(),
      })
      .parse(request.body);
    const { before, after } = await updateSettlementSettings(body, request.user!.id);
    const pick = (s: typeof before) => ({
      feePercentBps: s.feePercentBps,
      feeFixedMinor: s.feeFixedMinor,
      settlementMode: s.settlementMode,
      settlementFrequency: s.settlementFrequency,
      settlementMinimumMinor: s.settlementMinimumMinor,
      settlementHourEat: s.settlementHourEat,
      settlementWeekday: s.settlementWeekday,
    });
    await audit(request, {
      action: "platform_settlement_settings.updated",
      resourceType: "PlatformSettlementSettings",
      resourceId: after.id,
      before: pick(before),
      after: pick(after),
    });
    reply.send(successResponse(after, request.id));
  });

  // --- Payment gateway configuration --------------------------------------------------------------
  // Secrets are write-only: the response says whether each is set, never what it is.
  app.get("/gateway", { config: { audience: "platform" }, preHandler: read }, async (request, reply) => {
    const [collection, b2b, b2c, settings] = await Promise.all([
      getPlatformMpesaConfigStatus(),
      getPlatformB2BStatus(),
      getPlatformB2CStatus(),
      getSettlementSettings(),
    ]);
    const base = env.APP_API_PUBLIC_URL.replace(/\/+$/, "");
    const tokenNote = env.MPESA_CALLBACK_TOKEN ? "?token=•••" : "";
    reply.send(
      successResponse(
        {
          gatewayEnabled: settings.gatewayEnabled,
          provider: "MPESA_DARAJA",
          collection: {
            configured: collection.configured,
            isActive: collection.isActive,
            shortcode: collection.shortcode,
            environment: collection.environment,
          },
          b2b: { configured: b2b.configured, initiatorName: b2b.initiatorName },
          b2c,
          callbackTokenConfigured: Boolean(env.MPESA_CALLBACK_TOKEN),
          sandboxSettlements: sandboxSettlementsEnabled(),
          // Shown so the operator can register them with Safaricom; the token itself is masked.
          callbackUrls: {
            stk: buildMpesaCallbackUrl().replace(/\?token=.*$/, tokenNote),
            c2bValidation: `${base}/api/v1/payments/mpesa/platform/c2b/validation${tokenNote}`,
            c2bConfirmation: `${base}/api/v1/payments/mpesa/platform/c2b/confirmation${tokenNote}`,
            settlementResult: `${base}/api/v1/payments/mpesa/payout/result${tokenNote}`,
            settlementTimeout: `${base}/api/v1/payments/mpesa/payout/timeout${tokenNote}`,
          },
        },
        request.id
      )
    );
  });

  app.put("/gateway", { config: { audience: "platform" }, preHandler: manage }, async (request, reply) => {
    const body = z
      .object({
        gatewayEnabled: z.boolean().optional(),
        consumerKey: z.string().trim().min(1).max(200).optional(),
        consumerSecret: z.string().trim().min(1).max(200).optional(),
        shortcode: z.string().trim().regex(/^\d{5,10}$/).optional(),
        passkey: z.string().trim().min(1).max(500).optional(),
        environment: z.enum(["sandbox", "production"]).optional(),
        isActive: z.boolean().optional(),
        initiatorName: z.string().trim().max(64).optional(),
        initiatorCredential: z.string().trim().max(2048).optional(),
        b2cShortcode: z.string().trim().regex(/^(\d{5,10})?$/).optional(),
        b2cInitiatorName: z.string().trim().max(64).optional(),
        b2cInitiatorCredential: z.string().trim().max(2048).optional(),
      })
      .parse(request.body);

    const { gatewayEnabled, ...mpesa } = body;
    const [beforeStatus, beforeSettings] = await Promise.all([getPlatformMpesaConfigStatus(), getSettlementSettings()]);
    const hasMpesaChanges = Object.values(mpesa).some((v) => v !== undefined);
    if (hasMpesaChanges) {
      // Empty strings mean "leave unchanged" for secrets; the service only overwrites what is sent.
      await setPlatformMpesaConfig({
        ...mpesa,
        consumerKey: mpesa.consumerKey || undefined,
        consumerSecret: mpesa.consumerSecret || undefined,
        passkey: mpesa.passkey || undefined,
        initiatorCredential: mpesa.initiatorCredential || undefined,
        b2cInitiatorCredential: mpesa.b2cInitiatorCredential || undefined,
      });
    }
    if (gatewayEnabled !== undefined && gatewayEnabled !== beforeSettings.gatewayEnabled) {
      await updateSettlementSettings({ gatewayEnabled }, request.user!.id);
    }

    await audit(request, {
      action: "platform_payment_gateway.updated",
      resourceType: "PlatformMpesaConfig",
      resourceId: "platform",
      before: {
        gatewayEnabled: beforeSettings.gatewayEnabled,
        shortcode: beforeStatus.shortcode,
        environment: beforeStatus.environment,
      },
      // Which secrets were replaced — never their values.
      after: {
        gatewayEnabled: gatewayEnabled ?? beforeSettings.gatewayEnabled,
        shortcode: mpesa.shortcode ?? beforeStatus.shortcode,
        environment: mpesa.environment ?? beforeStatus.environment,
        secretsReplaced: (["consumerKey", "consumerSecret", "passkey", "initiatorCredential", "b2cInitiatorCredential"] as const).filter(
          (k) => Boolean(mpesa[k])
        ),
        b2cShortcode: mpesa.b2cShortcode,
        initiatorName: mpesa.initiatorName,
        b2cInitiatorName: mpesa.b2cInitiatorName,
      },
    });
    reply.send(successResponse({ ok: true }, request.id));
  });

  // --- Reconciliation ---------------------------------------------------------------------------
  app.get("/reconciliation", { config: { audience: "platform" }, preHandler: read }, async (request, reply) => {
    const { from, to } = z.object({ from: dateParam, to: dateParam }).parse(request.query);
    reply.send(successResponse(await runReconciliation({ from, to }), request.id));
  });

  app.post(
    "/reconciliation/platform-c2b/:transactionId/assign",
    { config: { audience: "platform" }, preHandler: manage },
    async (request, reply) => {
      const { transactionId } = z.object({ transactionId: z.string().min(4).max(40) }).parse(request.params);
      const body = z
        .object({ tenantId: z.string().uuid(), customerId: z.string().uuid(), invoiceId: z.string().uuid().optional() })
        .parse(request.body);
      const assigned = await assignPlatformC2BTransaction(transactionId, body, request.user!.id);
      await audit(request, {
        action: "platform_c2b.assigned",
        resourceType: "MpesaC2BTransaction",
        resourceId: assigned.id,
        tenantId: body.tenantId,
        before: { tenantId: null, reconciled: false },
        after: { tenantId: body.tenantId, customerId: body.customerId, invoiceId: body.invoiceId ?? null, transactionId, amountMinor: assigned.amountMinor },
      });
      reply.send(successResponse(assigned, request.id));
    }
  );

  // --- Webhook log --------------------------------------------------------------------------------
  app.get("/webhooks", { config: { audience: "platform" }, preHandler: read }, async (request, reply) => {
    const query = z
      .object({
        status: z.enum(["RECEIVED", "PROCESSED", "DUPLICATE", "IGNORED", "REJECTED", "FAILED"]).optional(),
        eventType: z.string().max(40).optional(),
        search: z.string().max(80).optional(),
        from: dateParam,
        to: dateParam,
        page: z.coerce.number().int().min(1).optional(),
        pageSize: z.coerce.number().int().min(1).max(100).optional(),
      })
      .parse(request.query);
    reply.send(successResponse(await listWebhookEvents(query), request.id));
  });

  app.get("/webhooks/:id", { config: { audience: "platform" }, preHandler: read }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const event = await prisma.paymentWebhookEvent.findUnique({ where: { id }, include: { tenant: { select: { name: true } } } });
    if (!event) throw new NotFoundError("Webhook event");
    reply.send(successResponse(event, request.id));
  });
}
