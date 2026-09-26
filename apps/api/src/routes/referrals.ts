import type { FastifyInstance } from "fastify";
import { successResponse, ConflictError } from "@mashupkgrid/shared";
import { listReferralRewards } from "@mashupkgrid/billing";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";

/** Referral rewards given so far, newest first. */
export async function referralRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/",
    { config: { audience: "staff" }, preHandler: [authenticate, resolveTenant, checkMaintenance, requirePermission("customers.read")] },
    async (request, reply) => {
      const tenantId = request.user!.tenantId;
      if (tenantId === null) throw new ConflictError("Referrals belong to an ISP account");
      reply.send(successResponse(await listReferralRewards(tenantId), request.id));
    }
  );
}
