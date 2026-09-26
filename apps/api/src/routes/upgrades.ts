import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import { successResponse, ConflictError } from "@mashupkgrid/shared";
import { applyUpgradeSuggestion, dismissUpgradeSuggestion, listUpgradeSuggestions } from "@mashupkgrid/billing";
import { sendTenantSms } from "@mashupkgrid/sms";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";

/** Suggested plan upgrades for subscribers who keep running into their data cap. Applying one
 *  moves the subscription onto the bigger plan and re-provisions the router. */

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;
const idParams = z.object({ suggestionId: z.string().uuid() });

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) throw new ConflictError("Upgrade suggestions belong to an ISP account");
  return tenantId;
}

export async function upgradeRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("customers.read")] }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const { status } = z.object({ status: z.enum(["PENDING", "APPLIED", "DISMISSED"]).default("PENDING") }).parse(request.query);
    reply.send(successResponse(await listUpgradeSuggestions(tenantId, status), request.id));
  });

  app.post("/:suggestionId/apply", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("customers.update")] }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const { suggestionId } = idParams.parse(request.params);
    const { notifyCustomer } = z.object({ notifyCustomer: z.boolean().default(true) }).parse(request.body ?? {});
    const suggestion = await applyUpgradeSuggestion(tenantId, suggestionId, request.user!.id);
    await writeAuditLog({
      tenantId,
      actorUserId: request.user!.id,
      action: "upgrade.applied",
      resourceType: "CustomerService",
      resourceId: suggestion.customerServiceId,
      before: { package: suggestion.fromPackageName },
      after: { package: suggestion.toPackageName },
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });
    if (notifyCustomer) {
      const [customer, tenant] = await Promise.all([
        prisma.customer.findUnique({ where: { id: suggestion.customerId }, select: { fullName: true, phone: true } }),
        prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      ]);
      if (customer) {
        const first = customer.fullName.split(/\s+/)[0] ?? customer.fullName;
        // A failed confirmation text never undoes the plan change.
        await sendTenantSms(tenantId, customer.phone, `Hi ${first}, your ${tenant?.name ?? ""} plan is now ${suggestion.toPackageName}. Enjoy the extra data!`).catch((err) =>
          request.log.warn({ err }, "upgrade confirmation SMS failed")
        );
      }
    }
    reply.send(successResponse(suggestion, request.id));
  });

  app.post("/:suggestionId/dismiss", { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("customers.update")] }, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const { suggestionId } = idParams.parse(request.params);
    const suggestion = await dismissUpgradeSuggestion(tenantId, suggestionId, request.user!.id);
    reply.send(successResponse(suggestion, request.id));
  });
}
