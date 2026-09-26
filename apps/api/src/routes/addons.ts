import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { successResponse, ConflictError } from "@mashupkgrid/shared";
import { createAddOn, deleteAddOn, grantAddOn, listAddOns, listRecentPurchases, updateAddOn } from "@mashupkgrid/billing";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";

/** The ISP's prepaid add-ons: speed boosts and extra data that PPPoE customers buy in the app. */

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;
const idParams = z.object({ addOnId: z.string().uuid() });

const addOnSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["SPEED", "DATA"]),
  downloadKbps: z.number().int().min(256).max(10_000_000).nullish(),
  uploadKbps: z.number().int().min(256).max(10_000_000).nullish(),
  dataMb: z.number().int().min(1).max(10_000_000).nullish(),
  durationHours: z.number().int().min(1).max(24 * 31),
  priceMinor: z.number().int().min(0).max(100_000_000),
  isActive: z.boolean().optional(),
});

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) throw new ConflictError("Add-ons belong to an ISP account");
  return tenantId;
}

const audit = (request: FastifyRequest, tenantId: string, action: string, resourceId: string, after?: object) =>
  writeAuditLog({ tenantId, actorUserId: request.user!.id, action, resourceType: "AddOn", resourceId, after, ipAddress: request.ip, userAgent: request.headers["user-agent"] ?? null });

export async function addOnRoutes(app: FastifyInstance): Promise<void> {
  const read = { config: { audience: "staff" as const }, preHandler: [...preHandler, requirePermission("packages.read")] };
  const manage = { config: { audience: "staff" as const }, preHandler: [...preHandler, requirePermission("packages.manage")] };

  app.get("/", read, async (request, reply) => {
    reply.send(successResponse(await listAddOns(requireTenant(request.user!.tenantId)), request.id));
  });

  app.post("/", manage, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const body = addOnSchema.parse(request.body);
    const addOn = await createAddOn(tenantId, body);
    await audit(request, tenantId, "addon.created", addOn.id, body);
    reply.status(201).send(successResponse(addOn, request.id));
  });

  app.patch("/:addOnId", manage, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const { addOnId } = idParams.parse(request.params);
    const body = addOnSchema.omit({ kind: true }).partial().parse(request.body);
    const addOn = await updateAddOn(tenantId, addOnId, body);
    await audit(request, tenantId, "addon.updated", addOnId, body);
    reply.send(successResponse(addOn, request.id));
  });

  app.delete("/:addOnId", manage, async (request, reply) => {
    const tenantId = requireTenant(request.user!.tenantId);
    const { addOnId } = idParams.parse(request.params);
    await deleteAddOn(tenantId, addOnId);
    await audit(request, tenantId, "addon.deleted", addOnId);
    reply.send(successResponse({ deleted: true }, request.id));
  });

  /** Recent purchases across the ISP, newest first. */
  app.get("/purchases", { config: { audience: "staff" as const }, preHandler: [...preHandler, requirePermission("customer_services.read")] }, async (request, reply) => {
    reply.send(successResponse(await listRecentPurchases(requireTenant(request.user!.tenantId)), request.id));
  });

  /** Give an add-on to a customer's plan for free; it starts at once. */
  app.post(
    "/:addOnId/grant",
    { config: { audience: "staff" as const }, preHandler: [...preHandler, requirePermission("customer_services.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { addOnId } = idParams.parse(request.params);
      const { subscriptionId } = z.object({ subscriptionId: z.string().uuid() }).parse(request.body);
      const purchase = await grantAddOn(tenantId, subscriptionId, addOnId);
      await audit(request, tenantId, "addon.granted", addOnId, { subscriptionId, purchaseId: purchase.id, endsAt: purchase.endsAt });
      reply.status(201).send(successResponse(purchase, request.id));
    }
  );
}
