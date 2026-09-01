import { prisma } from "@mashupkgrid/database";
import { dayKeyInTimeZone } from "@mashupkgrid/shared";

/** The tenant's own timezone, for bucketing report rows into the days its operator actually
 *  experiences. Falls back to the same default the Tenant model uses. */
async function tenantTimeZone(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } });
  return tenant?.timezone || "Africa/Nairobi";
}

export interface RevenueByDay {
  date: string;
  totalMinor: number;
  paymentCount: number;
}

/** Real revenue computed from completed payments — never cached, never hard-coded
 *  (project instruction §78/§59). Callers needing this frequently should add caching at the
 *  route layer with a short TTL, not bake staleness into this function. */
export async function getRevenueByDay(tenantId: string, days = 30): Promise<RevenueByDay[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [timeZone, payments] = await Promise.all([
    tenantTimeZone(tenantId),
    prisma.payment.findMany({
      where: { tenantId, status: "COMPLETED", createdAt: { gte: since } },
      select: { amountMinor: true, createdAt: true },
    }),
  ]);

  const byDay = new Map<string, { totalMinor: number; paymentCount: number }>();
  for (const payment of payments) {
    const key = dayKeyInTimeZone(payment.createdAt, timeZone);
    const bucket = byDay.get(key) ?? { totalMinor: 0, paymentCount: 0 };
    bucket.totalMinor += payment.amountMinor;
    bucket.paymentCount += 1;
    byDay.set(key, bucket);
  }

  return [...byDay.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface OutstandingSummary {
  outstandingMinor: number;
  overdueCount: number;
  overdueMinor: number;
  invoiceCount: number;
}

export async function getOutstandingSummary(tenantId: string): Promise<OutstandingSummary> {
  const invoices = await prisma.invoice.findMany({
    where: { tenantId, status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] } },
    select: { totalMinor: true, amountPaidMinor: true, dueDate: true },
  });

  const now = new Date();
  let outstandingMinor = 0;
  let overdueCount = 0;
  let overdueMinor = 0;

  for (const invoice of invoices) {
    const remaining = invoice.totalMinor - invoice.amountPaidMinor;
    outstandingMinor += remaining;
    if (invoice.dueDate < now) {
      overdueCount += 1;
      overdueMinor += remaining;
    }
  }

  return { outstandingMinor, overdueCount, overdueMinor, invoiceCount: invoices.length };
}
