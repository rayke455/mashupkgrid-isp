import type { FastifyInstance } from "fastify";
import { prisma } from "@mashupkgrid/database";
import { redis } from "../lib/redis.js";
import { successResponse } from "@mashupkgrid/shared";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { config: { audience: "system-critical" } }, async (request, reply) => {
    reply.send(successResponse({ status: "ok" }, request.id));
  });

  app.get("/live", { config: { audience: "system-critical" } }, async (request, reply) => {
    reply.send(successResponse({ status: "alive" }, request.id));
  });

  app.get("/ready", { config: { audience: "system-critical" } }, async (request, reply) => {
    const checks: Record<string, boolean> = { database: false, redis: false };

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = true;
    } catch {
      checks.database = false;
    }

    try {
      await redis.ping();
      checks.redis = true;
    } catch {
      checks.redis = false;
    }

    const ready = Object.values(checks).every(Boolean);
    reply.status(ready ? 200 : 503).send(successResponse({ status: ready ? "ready" : "not_ready", checks }, request.id));
  });
}
