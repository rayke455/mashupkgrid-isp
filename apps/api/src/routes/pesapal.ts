import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import {
  setPesapalConfig,
  getPesapalConfigStatus,
  registerPesapalIpn,
  getPesapalCredentials,
  initiatePesapalTransactionForCustomer,
  verifyAndReconcilePesapalTransaction,
  handlePesapalIpn,
} from "@mashupkgrid/payments";
import { successResponse, ConflictError, NotFoundError } from "@mashupkgrid/shared";
import { env } from "@mashupkgrid/config";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";

const staffPreHandler = [authenticate, resolveTenant, checkMaintenance] as const;

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) throw new ConflictError("Pesapal is not available at the platform level");
  return tenantId;
}

const setConfigSchema = z.object({
  consumerKey: z.string().min(1),
  consumerSecret: z.string().min(1),
  ipnId: z.string().optional(),
  environment: z.enum(["live", "sandbox"]).optional(),
  isActive: z.boolean().optional(),
});

const initializeSchema = z.object({
  customerId: z.string().uuid(),
  invoiceId: z.string().uuid().optional(),
  amountMinor: z.number().int().positive(),
  currency: z.string().length(3).optional(),
});

const ipnQuerySchema = z.object({
  OrderTrackingId: z.string().min(1),
  OrderMerchantReference: z.string().min(1),
  OrderNotificationType: z.string().optional(),
});

export async function pesapalRoutes(app: FastifyInstance): Promise<void> {
  // --- Staff: Configuration -----------------------------------------------------------------

  app.get(
    "/config",
    { config: { audience: "staff" }, preHandler: [...staffPreHandler, requirePermission("settings.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      reply.send(successResponse(await getPesapalConfigStatus(tenantId), request.id));
    }
  );

  app.put(
    "/config",
    { config: { audience: "staff" }, preHandler: [...staffPreHandler, requirePermission("settings.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const body = setConfigSchema.parse(request.body);
      await setPesapalConfig(tenantId, body);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "pesapal_config.updated",
        resourceType: "PaymentProviderConfig",
        after: { consumerKey: body.consumerKey, environment: body.environment },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(await getPesapalConfigStatus(tenantId), request.id));
    }
  );

  // Auto-register IPN with Pesapal API
  app.post(
    "/ipn/register",
    { config: { audience: "staff" }, preHandler: [...staffPreHandler, requirePermission("settings.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const credentials = await getPesapalCredentials(tenantId);
      const ipnUrl = `${env.APP_API_PUBLIC_URL}/api/v1/payments/pesapal/ipn?tenantId=${tenantId}`;

      const res = await registerPesapalIpn({ credentials, url: ipnUrl });
      reply.send(successResponse(res, request.id));
    }
  );

  // Initialize Customer Invoice Payment
  app.post(
    "/initialize",
    {
      config: { audience: "staff", maintenanceCategory: "payment" },
      preHandler: [...staffPreHandler, requirePermission("payments.create")],
    },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const body = initializeSchema.parse(request.body);

      const result = await initiatePesapalTransactionForCustomer(tenantId, {
        customerId: body.customerId,
        invoiceId: body.invoiceId ?? null,
        amountMinor: body.amountMinor,
        currency: body.currency,
        initiatedByUserId: request.user!.id,
      });

      reply.status(201).send(
        successResponse(
          {
            reference: result.transaction.reference,
            redirectUrl: result.redirectUrl,
            orderTrackingId: result.orderTrackingId,
            status: result.transaction.status,
            amountMinor: result.transaction.amountMinor,
          },
          request.id
        )
      );
    }
  );

  // Check Status
  app.get(
    "/status/:reference",
    { config: { audience: "staff" }, preHandler: [...staffPreHandler] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { reference } = request.params as { reference: string };
      const transaction = await verifyAndReconcilePesapalTransaction(tenantId, reference);
      reply.send(successResponse(transaction, request.id));
    }
  );

  // --- Public: IPN Webhook (Pesapal calls this on status change) ----------------------------
  app.get(
    "/ipn",
    { config: { audience: "public" } },
    async (request, reply) => {
      const query = ipnQuerySchema.parse(request.query);
      const tenantIdQuery = (request.query as Record<string, string>).tenantId;

      // Locate tenant from transaction reference or query param
      const reference = query.OrderMerchantReference;
      const transaction = await prisma.paystackTransaction.findUnique({ where: { reference } });
      const tenantId = transaction?.tenantId || tenantIdQuery;

      if (tenantId) {
        await handlePesapalIpn(tenantId, {
          orderTrackingId: query.OrderTrackingId,
          orderMerchantReference: query.OrderMerchantReference,
          orderNotificationType: query.OrderNotificationType,
        });
      }

      // Pesapal requires JSON response acknowledging receipt
      reply.send({
        orderNotificationType: query.OrderNotificationType || "IPNCHANGE",
        orderTrackingId: query.OrderTrackingId,
        orderMerchantReference: query.OrderMerchantReference,
        status: 200,
      });
    }
  );

  app.post(
    "/ipn",
    { config: { audience: "public" } },
    async (request, reply) => {
      const body = request.body as Record<string, string>;
      const orderTrackingId = body.OrderTrackingId || body.orderTrackingId;
      const orderMerchantReference = body.OrderMerchantReference || body.orderMerchantReference;

      if (orderTrackingId && orderMerchantReference) {
        const transaction = await prisma.paystackTransaction.findUnique({
          where: { reference: orderMerchantReference },
        });
        if (transaction) {
          await handlePesapalIpn(transaction.tenantId, {
            orderTrackingId,
            orderMerchantReference,
          });
        }
      }

      reply.send({ status: 200 });
    }
  );
}
