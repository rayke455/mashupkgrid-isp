import type { PrismaClient, Prisma } from "@mashupkgrid/database";

/**
 * A Prisma client or an interactive-transaction client — every billing service function that
 * mutates data accepts this so callers can compose several mutations into one atomic
 * `$transaction` (project instruction §51) instead of each function opening its own.
 */
export type Db = PrismaClient | Prisma.TransactionClient;
