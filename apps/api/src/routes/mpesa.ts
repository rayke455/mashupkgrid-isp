import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import {
  setMpesaConfig,
  getMpesaConfigStatus,
  initiateStkPushForCustomer,
  getStkRequestOrThrow,
  queryAndReconcileStkRequest,
  handleStkCallback,
  handleC2BValidation,
  handleC2BConfirmation,
  manuallyReconcileC2BTransaction,
  tryCompleteOnboardingFeeCallback,
  tryCompleteSubscriptionPaymentCallback,
  getPlatformMpesaConfigStatus,
  getPlatformB2BStatus,
  setPlatformMpesaConfig,
  applyPayoutResult,
  getTenantBalance,
  listTenantLedger,
  listTenantsWithBalance,
  payoutTenantBalance,
} from "@mashupkgrid/payments";
import { successResponse, ConflictError, timingSafeStringEqual } from "@mashupkgrid/shared";
import { env } from "@mashupkgrid/config";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";
import { enqueueSendPaymentConfirmationEmail, enqueueSendWhatsappVoucher } from "../lib/queue.js";
import { emitWebhookEvent } from "../lib/webhooks.js";

const staffPreHandler = [authenticate, resolveTenant, checkMaintenance] as const;

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) throw new ConflictError("M-Pesa is not available at the platform level");
  return tenantId;
}

/**
 * Daraja has no signature scheme for its webhooks — anyone who can reach these public URLs can
 * POST a payload that looks exactly like a genuine Safaricom callback. When MPESA_CALLBACK_TOKEN
 * is configured, it's required as a `?token=` query param on the callback/C2B URLs actually
 * handed to Safaricom (see packages/payments/src/mpesa/callback-url.ts); requests missing or
 * failing that check here are silently dropped (acked as if handled, never processed) rather than
 * given a distinguishing error response. Left permissive (returns true) when unconfigured so a
 * fresh/dev install without it set doesn't hard-fail — see the startup warning below.
 */
function hasValidCallbackToken(request: FastifyRequest): boolean {
  if (!env.MPESA_CALLBACK_TOKEN) return true;
  const provided = (request.query as { token?: unknown }).token;
  return typeof provided === "string" && timingSafeStringEqual(provided, env.MPESA_CALLBACK_TOKEN);
}

if (!env.MPESA_CALLBACK_TOKEN) {
  console.warn(
    "[SECURITY] MPESA_CALLBACK_TOKEN is not set — the M-Pesa callback and C2B webhook endpoints " +
      "will accept a payment-completion payload from anyone who can reach them, not just Safaricom. " +
      "Set MPESA_CALLBACK_TOKEN before handling real payments."
  );
}

const setConfigSchema = z.object({
  consumerKey: z.string().min(1),
  consumerSecret: z.string().min(1),
  shortcode: z.string().min(1),
  passkey: z.string().min(1),
  environment: z.enum(["sandbox", "production"]),
});

/** Tenant config additionally carries the Paybill/Till distinction. The PLATFORM config (the
 *  account tenants pay their SaaS fees into) deliberately keeps the plain schema above — it is a
 *  single paybill this platform controls, not something an operator picks per deployment. */
/** The platform's own paybill, plus the B2B initiator used to pay tenants out. */
const platformConfigSchema = setConfigSchema.extend({
  initiatorName: z.string().max(64).optional().or(z.literal("")),
  // Safaricom's certificate-encrypted blob is long; it is stored encrypted again at rest and
  // never returned to any client.
  initiatorCredential: z.string().max(2048).optional().or(z.literal("")),
});

const setTenantConfigSchema = setConfigSchema.extend({
  shortcodeType: z.enum(["PAYBILL", "TILL"]).default("PAYBILL"),
  // Optional even for TILL: Safaricom sometimes issues a till whose store number is the same
  // value, and darajaBusinessShortCode falls back to the shortcode when this is absent.
  storeNumber: z.string().max(20).optional(),
});

const stkPushSchema = z.object({
  customerId: z.string().uuid(),
  invoiceId: z.string().uuid().optional(),
  phone: z.string().min(9),
  amountMinor: z.number().int().positive(),
});

const reconcileSchema = z
  .object({ invoiceId: z.string().uuid().optional(), customerId: z.string().uuid().optional() })
  .refine((v) => v.invoiceId ?? v.customerId, "Provide either invoiceId or customerId");

export async function mpesaRoutes(app: FastifyInstance): Promise<void> {
  // --- Staff-facing, authenticated ---------------------------------------------------------

  app.get(
    "/config",
    { config: { audience: "staff" }, preHandler: [...staffPreHandler, requirePermission("settings.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      reply.send(successResponse(await getMpesaConfigStatus(tenantId), request.id));
    }
  );

  app.put(
    "/config",
    { config: { audience: "staff" }, preHandler: [...staffPreHandler, requirePermission("settings.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const body = setTenantConfigSchema.parse(request.body);
      await setMpesaConfig(tenantId, body);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "mpesa_config.updated",
        resourceType: "PaymentProviderConfig",
        // Never log the secrets themselves — only that a change happened and by whom.
        after: {
          shortcode: body.shortcode,
          shortcodeType: body.shortcodeType,
          environment: body.environment,
        },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(await getMpesaConfigStatus(tenantId), request.id));
    }
  );

  app.post(
    "/stk-push",
    {
      config: { audience: "staff", maintenanceCategory: "payment" },
      preHandler: [...staffPreHandler, requirePermission("payments.create")],
    },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const body = stkPushSchema.parse(request.body);

      const stkRequest = await initiateStkPushForCustomer(tenantId, {
        customerId: body.customerId,
        invoiceId: body.invoiceId ?? null,
        phone: body.phone,
        amountMinor: body.amountMinor,
        initiatedByUserId: request.user!.id,
      });

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "mpesa.stk_push_initiated",
        resourceType: "MpesaStkRequest",
        resourceId: stkRequest.id,
        after: { customerId: body.customerId, invoiceId: body.invoiceId, amountMinor: body.amountMinor },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.status(201).send(successResponse(stkRequest, request.id));
    }
  );

  app.get(
    "/stk-push/:checkoutRequestId",
    { config: { audience: "staff" }, preHandler: [...staffPreHandler, requirePermission("payments.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { checkoutRequestId } = z.object({ checkoutRequestId: z.string() }).parse(request.params);

      const current = await getStkRequestOrThrow(tenantId, checkoutRequestId);
      if (current.status !== "PENDING") {
        reply.send(successResponse(current, request.id));
        return;
      }

      // Still pending from our side — actively ask Safaricom rather than making the client poll
      // forever against stale local state (defensive against a lost callback).
      const { request: refreshed, unresolvedSuccess } = await queryAndReconcileStkRequest(
        tenantId,
        checkoutRequestId
      );
      reply.send(successResponse({ ...refreshed, unresolvedSuccess }, request.id));
    }
  );

  app.get(
    "/reconciliation",
    { config: { audience: "staff" }, preHandler: [...staffPreHandler, requirePermission("payments.reconcile")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const transactions = await prisma.mpesaC2BTransaction.findMany({
        where: { tenantId, reconciled: false },
        orderBy: { createdAt: "desc" },
      });
      reply.send(successResponse(transactions, request.id));
    }
  );

  app.post(
    "/reconciliation/:transactionId/match",
    { config: { audience: "staff" }, preHandler: [...staffPreHandler, requirePermission("payments.reconcile")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { transactionId } = z.object({ transactionId: z.string() }).parse(request.params);
      const body = reconcileSchema.parse(request.body);

      const result = await manuallyReconcileC2BTransaction(tenantId, transactionId, body);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "mpesa.c2b_reconciled",
        resourceType: "MpesaC2BTransaction",
        resourceId: result.id,
        after: body,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(result, request.id));
    }
  );

  // --- Public webhooks (Safaricom) — audience "system-critical" bypasses maintenance mode
  // entirely (docs/architecture/05-maintenance-and-queues.md §44/45) and carries no auth, since
  // Safaricom cannot send our bearer tokens. -------------------------------------------------

  /**
   * Daraja's asynchronous result for a B2B payout — the ONLY thing that can say a tenant's money
   * actually moved. The initiating call returning 0 means Safaricom accepted the instruction, not
   * that it succeeded, so a payout stays PROCESSING until this lands.
   *
   * Always answers 200: Daraja retries anything else, and a retry storm on a payout callback is
   * how one settlement gets applied repeatedly. Idempotency is handled in applyPayoutResult,
   * which refuses to re-settle a payout that is already terminal.
   */
  /** What this platform currently owes this tenant, and the entries behind it. Derived from the
   *  ledger, never a cached figure — see getTenantBalance. */
  app.get(
    "/settlement",
    { config: { audience: "staff" }, preHandler: [...staffPreHandler, requirePermission("payments.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const [balance, entries, payouts] = await Promise.all([
        getTenantBalance(tenantId),
        listTenantLedger(tenantId, 100),
        prisma.tenantPayout.findMany({
          where: { tenantId },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
      ]);
      reply.send(successResponse({ balance, entries, payouts }, request.id));
    }
  );

  /** Platform-side: everyone owed money, so an operator can see the total exposure before
   *  releasing a run. */
  app.get(
    "/settlement/owed",
    { config: { audience: "platform" }, preHandler: [authenticate, checkMaintenance, requirePermission("tenants.read")] },
    async (request, reply) => {
      const owed = await listTenantsWithBalance(1);
      const tenants = await prisma.tenant.findMany({
        where: { id: { in: owed.map((o) => o.tenantId) } },
        select: { id: true, name: true, slug: true, payoutShortcode: true, payoutShortcodeType: true },
      });
      const byId = new Map(tenants.map((t) => [t.id, t]));
      reply.send(
        successResponse(
          owed.map((balance) => ({ ...balance, tenant: byId.get(balance.tenantId) ?? null })),
          request.id
        )
      );
    }
  );

  /** Releases one tenant's balance to their paybill/till. Audit-logged: this moves real money. */
  app.post(
    "/settlement/:tenantId/payout",
    { config: { audience: "platform" }, preHandler: [authenticate, checkMaintenance, requirePermission("tenants.update")] },
    async (request, reply) => {
      const { tenantId } = z.object({ tenantId: z.string().uuid() }).parse(request.params);
      const payout = await payoutTenantBalance(tenantId);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "tenant_payout.released",
        resourceType: "TenantPayout",
        resourceId: payout.id,
        after: {
          amountMinor: payout.amountMinor,
          destination: payout.destinationShortcode,
          status: payout.status,
        },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(payout, request.id));
    }
  );

  app.post("/payout/result", { config: { audience: "system-critical" } }, async (request, reply) => {
    if (!hasValidCallbackToken(request)) {
      reply.status(200).send({ ResultCode: 0, ResultDesc: "Accepted" });
      return;
    }

    const body = request.body as {
      Result?: {
        ResultCode?: number;
        ResultDesc?: string;
        OriginatorConversationID?: string;
        TransactionID?: string;
      };
    };
    const result = body?.Result;

    if (result?.OriginatorConversationID) {
      try {
        await applyPayoutResult({
          originatorConversationId: result.OriginatorConversationID,
          resultCode: Number(result.ResultCode ?? -1),
          resultDesc: String(result.ResultDesc ?? ""),
          transactionId: result.TransactionID,
        });
      } catch (err) {
        // Logged, never surfaced: an error response makes Daraja retry, and this is money.
        request.log.error({ err }, "Failed to apply M-Pesa payout result");
      }
    }
    reply.status(200).send({ ResultCode: 0, ResultDesc: "Accepted" });
  });

  /** Daraja calls this when the request sat in its queue too long. Treated as a failure so the
   *  tenant's balance is restored rather than left reserved against a payout that never ran. */
  app.post("/payout/timeout", { config: { audience: "system-critical" } }, async (request, reply) => {
    if (!hasValidCallbackToken(request)) {
      reply.status(200).send({ ResultCode: 0, ResultDesc: "Accepted" });
      return;
    }
    const body = request.body as { Result?: { OriginatorConversationID?: string } };
    const id = body?.Result?.OriginatorConversationID;
    if (id) {
      try {
        await applyPayoutResult({
          originatorConversationId: id,
          resultCode: -1,
          resultDesc: "Timed out in the M-Pesa queue before it was processed",
        });
      } catch (err) {
        request.log.error({ err }, "Failed to apply M-Pesa payout timeout");
      }
    }
    reply.status(200).send({ ResultCode: 0, ResultDesc: "Accepted" });
  });

  app.post("/callback", { config: { audience: "system-critical" } }, async (request, reply) => {
    if (!hasValidCallbackToken(request)) {
      // Ack as if handled — never distinguish "wrong token" from "handled" in the response, and
      // never process a payload that failed this check.
      reply.status(200).send({ ResultCode: 0, ResultDesc: "Accepted" });
      return;
    }
    const outcome = await handleStkCallback(request.body);
    if (outcome.handled && outcome.checkoutRequestId) {
      const stkRequest = await prisma.mpesaStkRequest.findUnique({
        where: { checkoutRequestId: outcome.checkoutRequestId },
        include: { customer: true, hotspotPackage: true, tenant: true },
      });
      if (stkRequest?.status === "COMPLETED") {
        if (stkRequest.customer?.email) {
          await enqueueSendPaymentConfirmationEmail({
            email: stkRequest.customer.email,
            customerName: stkRequest.customer.fullName,
            amountMinor: stkRequest.amountMinor,
            receiptNumber: stkRequest.mpesaReceiptNumber ?? "",
          });
        }
        // A hotspot purchase has no Customer row at all (it's an anonymous walk-in buy), so the
        // confirmation email above never fires for one — the phone that paid is the only contact
        // detail we have, and it's exactly the WhatsApp number to send the voucher to.
        if (stkRequest.hotspotVoucherCode) {
          await enqueueSendWhatsappVoucher({
            tenantId: stkRequest.tenantId,
            phone: stkRequest.phone,
            voucherCode: stkRequest.hotspotVoucherCode,
            tenantName: stkRequest.tenant.name,
            packageName: stkRequest.hotspotPackage?.name ?? null,
            amountMinor: stkRequest.amountMinor,
            currency: stkRequest.hotspotPackage?.currency ?? "KES",
            durationMinutes: stkRequest.hotspotPackage?.durationMinutes ?? null,
            dataCapMb: stkRequest.hotspotPackage?.dataCapMb ?? null,
          });
        }
        void emitWebhookEvent(stkRequest.tenantId, "payment.received", {
          method: "MPESA_STK",
          amountMinor: stkRequest.amountMinor,
          receiptNumber: stkRequest.mpesaReceiptNumber,
          customerId: stkRequest.customerId,
        });
      }
    } else {
      // Not a tenant-scoped payment (customer/hotspot) — same globally-unique CheckoutRequestID
      // could still belong to a tenant's own onboarding fee or a recurring subscription charge
      // (two more separate tables by design, see TenantOnboardingFee/TenantSubscriptionPayment's
      // schema comments), so try each before giving up.
      if (!(await tryCompleteOnboardingFeeCallback(request.body))) {
        await tryCompleteSubscriptionPaymentCallback(request.body);
      }
    }
    // Always ack 200 — Safaricom retries aggressively on non-200, and we've already durably
    // stored everything we could parse (project instruction §13: idempotent, safe response).
    reply.status(200).send({ ResultCode: 0, ResultDesc: "Accepted" });
  });

  app.post(
    "/c2b/:tenantSlug/validation",
    { config: { audience: "system-critical" } },
    async (request, reply) => {
      const { tenantSlug } = z.object({ tenantSlug: z.string() }).parse(request.params);
      if (!hasValidCallbackToken(request)) {
        reply.status(200).send({ ResultCode: "C2B00012", ResultDesc: "Rejected" });
        return;
      }
      const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
      if (!tenant) {
        reply.status(200).send({ ResultCode: "C2B00012", ResultDesc: "Unknown tenant" });
        return;
      }
      reply.status(200).send(handleC2BValidation(tenant.id, request.body));
    }
  );

  app.post(
    "/c2b/:tenantSlug/confirmation",
    { config: { audience: "system-critical" } },
    async (request, reply) => {
      const { tenantSlug } = z.object({ tenantSlug: z.string() }).parse(request.params);
      if (!hasValidCallbackToken(request)) {
        reply.status(200).send({ ResultCode: "0", ResultDesc: "Accepted" });
        return;
      }
      const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
      if (!tenant) {
        // Nothing we can attribute this to — ack anyway (money already moved on Safaricom's
        // side; rejecting the webhook doesn't undo that) but do not fabricate a tenant.
        reply.status(200).send({ ResultCode: "0", ResultDesc: "Accepted" });
        return;
      }

      // Any rejection here (malformed payload, BusinessShortCode mismatch — see c2b.service.ts)
      // must still ack cleanly rather than surface as an error response: Safaricom retries
      // aggressively on non-200, and a forged/mismatched payload retried forever helps no one.
      let transaction;
      try {
        transaction = await handleC2BConfirmation(tenant.id, request.body);
      } catch (err) {
        request.log.warn({ err, tenantSlug }, "C2B confirmation rejected");
        reply.status(200).send({ ResultCode: "0", ResultDesc: "Accepted" });
        return;
      }

      if (transaction.reconciled && transaction.paymentId) {
        const customer = transaction.matchedCustomerId
          ? await prisma.customer.findUnique({ where: { id: transaction.matchedCustomerId } })
          : null;
        if (customer?.email) {
          await enqueueSendPaymentConfirmationEmail({
            email: customer.email,
            customerName: customer.fullName,
            amountMinor: transaction.amountMinor,
            receiptNumber: transaction.transactionId,
          });
        }
        void emitWebhookEvent(tenant.id, "payment.received", {
          method: "MPESA_C2B",
          amountMinor: transaction.amountMinor,
          receiptNumber: transaction.transactionId,
          customerId: transaction.matchedCustomerId,
        });
      }

      reply.status(200).send({ ResultCode: "0", ResultDesc: "Accepted" });
    }
  );

  // --- Platform-level (super admin only) — the platform's OWN Daraja credentials, used to
  // collect the 450 KSH onboarding fee from tenants. Never confuse with the tenant-scoped
  // /config routes above, which are each ISP's own paybill for billing their own customers.

  app.get(
    "/platform-config",
    { config: { audience: "platform" }, preHandler: [...staffPreHandler, requirePermission("tenants.create")] },
    async (request, reply) => {
      const [config, b2b] = await Promise.all([getPlatformMpesaConfigStatus(), getPlatformB2BStatus()]);
      reply.send(successResponse({ ...config, b2b }, request.id));
    }
  );

  app.put(
    "/platform-config",
    { config: { audience: "platform" }, preHandler: [...staffPreHandler, requirePermission("tenants.create")] },
    async (request, reply) => {
      const body = platformConfigSchema.parse(request.body);
      await setPlatformMpesaConfig(body);

      await writeAuditLog({
        tenantId: null,
        actorUserId: request.user!.id,
        action: "platform_mpesa_config.updated",
        resourceType: "PlatformMpesaConfig",
        // The credential itself is never logged — only that payouts became possible and by whom.
        after: {
          shortcode: body.shortcode,
          environment: body.environment,
          b2bInitiatorSet: Boolean(body.initiatorName),
        },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      const [config, b2b] = await Promise.all([getPlatformMpesaConfigStatus(), getPlatformB2BStatus()]);
      reply.send(successResponse({ ...config, b2b }, request.id));
    }
  );
}

