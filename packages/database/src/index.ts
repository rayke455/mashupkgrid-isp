import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/**
 * Singleton PrismaClient. In dev, Node's module cache can be bypassed by hot-reload tooling,
 * so we stash the instance on globalThis to avoid exhausting the Postgres connection pool by
 * creating a new client per reload.
 */
export const prisma: PrismaClient =
  globalThis.__prisma ??
  new PrismaClient({
    // Same levels in every environment, deliberately. This was previously written as a
    // prod-vs-dev ternary with identical arrays on both sides (dead code); adding "query" to the
    // dev branch to give it meaning turned out to bury everything else the dev servers log —
    // several lines of SQL per request drowning out the worker's own output. Turn "query" on
    // locally only while actually debugging a query.
    log: ["error", "warn"],
  });

if (process.env["NODE_ENV"] !== "production") {
  globalThis.__prisma = prisma;
}

export * from "@prisma/client";
