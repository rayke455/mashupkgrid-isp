import type { PrismaClient, Prisma } from "@mashupkgrid/database";

export type Db = PrismaClient | Prisma.TransactionClient;
