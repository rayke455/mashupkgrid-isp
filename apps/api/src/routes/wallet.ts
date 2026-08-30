import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getOrCreateWallet, listWalletTransactions, getCustomerOrThrow } from "@mashupkgrid/billing";
import { prisma } from "@mashupkgrid/database";
import { successResponse, ConflictError } from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;
const paramsSchema = z.object({ customerId: z.string().uuid() });

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) throw new ConflictError("Wallet management is not available at the platform level");
  return tenantId;
}

export async function walletRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/:customerId",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("wallet.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { customerId } = paramsSchema.parse(request.params);
      await getCustomerOrThrow(tenantId, customerId);

      const wallet = await getOrCreateWallet(prisma, customerId);
      const transactions = await listWalletTransactions(customerId);
      reply.send(successResponse({ wallet, transactions }, request.id));
    }
  );
}
