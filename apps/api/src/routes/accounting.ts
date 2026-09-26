import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import { ConflictError } from "@mashupkgrid/shared";
import { buildAccountingExport } from "@mashupkgrid/billing";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";

/** Invoices, payments and customers as QuickBooks Online or Xero import files. */

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Midnight at the start of `ymd` in the ISP's time zone, as an instant. */
export function localMidnight(ymd: string, timeZone: string): Date {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const utcGuess = Date.UTC(y, m - 1, d);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(utcGuess))
      .map((x) => [x.type, x.value])
  );
  const shownAsUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  return new Date(utcGuess - (shownAsUtc - utcGuess));
}

export async function accountingRoutes(app: FastifyInstance): Promise<void> {
  app.get("/export", { config: { audience: "staff" as const }, preHandler: [...preHandler, requirePermission("billing.read")] }, async (request, reply) => {
    const tenantId = request.user!.tenantId;
    if (!tenantId) throw new ConflictError("Exports belong to an ISP account");
    const q = z.object({ system: z.enum(["xero", "quickbooks"]), kind: z.enum(["invoices", "payments", "contacts"]), from: day, to: day }).parse(request.query);
    if (q.from > q.to) throw new ConflictError("The start date is after the end date");
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true, slug: true } });
    const from = localMidnight(q.from, tenant.timezone);
    // `to` is the last day included, so the range ends at the following midnight.
    const [ty, tm, td] = q.to.split("-").map(Number) as [number, number, number];
    const to = localMidnight(new Date(Date.UTC(ty, tm - 1, td + 1)).toISOString().slice(0, 10), tenant.timezone);
    const { csv, rows } = await buildAccountingExport(tenantId, q.system, q.kind, from, to);
    await writeAuditLog({ tenantId, actorUserId: request.user!.id, action: "accounting.exported", resourceType: "Tenant", resourceId: tenantId, after: { ...q, rows }, ipAddress: request.ip, userAgent: request.headers["user-agent"] ?? null });
    reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="${tenant.slug}-${q.kind}-${q.system}-${q.from}-to-${q.to}.csv"`)
      .send(csv);
  });
}
