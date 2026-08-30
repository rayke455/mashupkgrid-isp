import { prisma } from "@mashupkgrid/database";

export interface AuditContext {
  tenantId?: string | null;
  actorUserId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditEntry extends AuditContext {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
}

/** Writes a single AuditLog row. Callers that mutate data inside a $transaction should pass
 *  the transaction client via `tx` so the audit row commits/rolls back atomically with the
 *  mutation it describes (docs/architecture/00-overview.md, §4). */
export async function writeAuditLog(
  entry: AuditEntry,
  tx: Pick<typeof prisma, "auditLog"> = prisma
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: entry.tenantId ?? null,
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId ?? null,
      before: entry.before === undefined ? undefined : (entry.before as object),
      after: entry.after === undefined ? undefined : (entry.after as object),
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
    },
  });
}
