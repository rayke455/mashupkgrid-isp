import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import { successResponse, ConflictError } from "@mashupkgrid/shared";
import { isPushConfigured, pushToUser, vapidPublicKey } from "@mashupkgrid/push";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";

/**
 * Push alerts on a staff member's own devices. Any signed-in dashboard user may turn alerts on
 * for themselves; which alerts reach them is decided by their permissions when an alert is sent
 * (router alerts need routers.manage, payment alerts payments.read).
 */

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2000).refine((u) => u.startsWith("https://"), "Push endpoints are always https"),
  keys: z.object({ p256dh: z.string().min(16).max(256), auth: z.string().min(8).max(64) }),
});
const unsubscribeSchema = z.object({ endpoint: z.string().max(2000) });

export async function pushRoutes(app: FastifyInstance): Promise<void> {
  app.get("/config", { config: { audience: "staff" }, preHandler: [...preHandler] }, async (request, reply) => {
    const devices = await prisma.pushSubscription.count({ where: { userId: request.user!.id } });
    reply.send(successResponse({ configured: isPushConfigured(), publicKey: vapidPublicKey(), devices }, request.id));
  });

  app.post("/subscriptions", { config: { audience: "staff" }, preHandler: [...preHandler] }, async (request, reply) => {
    if (!isPushConfigured()) throw new ConflictError("Push alerts are not set up on this server yet");
    const body = subscribeSchema.parse(request.body);
    const userAgent = (request.headers["user-agent"] ?? "").slice(0, 300) || null;
    // One row per device. If someone else signs in on the same browser, the device moves to them.
    await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: { userId: request.user!.id, tenantId: request.user!.tenantId, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth, userAgent },
      update: { userId: request.user!.id, tenantId: request.user!.tenantId, p256dh: body.keys.p256dh, auth: body.keys.auth, userAgent },
    });
    reply.status(201).send(successResponse({ subscribed: true }, request.id));
  });

  app.delete("/subscriptions", { config: { audience: "staff" }, preHandler: [...preHandler] }, async (request, reply) => {
    const body = unsubscribeSchema.parse(request.body);
    // Only ever this user's own device.
    const result = await prisma.pushSubscription.deleteMany({ where: { endpoint: body.endpoint, userId: request.user!.id } });
    reply.send(successResponse({ removed: result.count }, request.id));
  });

  app.post("/test", { config: { audience: "staff" }, preHandler: [...preHandler] }, async (request, reply) => {
    if (!isPushConfigured()) throw new ConflictError("Push alerts are not set up on this server yet");
    const sent = await pushToUser(request.user!.id, {
      title: "Alerts are working",
      body: "You will get an alert here when a router goes down or a large payment arrives.",
      url: "/settings/alerts",
      tag: "test",
    });
    reply.send(successResponse({ sent }, request.id));
  });
}
