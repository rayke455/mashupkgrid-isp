import { Prisma, prisma } from "@mashupkgrid/database";

/**
 * The questions an ISP owner actually asks of their numbers: is revenue growing, what sells,
 * when do people pay, and which customers are about to leave. Sums and groupings run in SQL so a
 * tenant with years of payments is not loaded into memory; everything is scoped to one tenant and
 * bucketed in that tenant's own timezone.
 */

export interface RevenueAnalytics {
  currency: string;
  months: { month: string; revenueMinor: number; payments: number; newCustomers: number }[];
  growth: { thisMonthMinor: number; lastMonthMinor: number; changePercent: number | null };
  subscribers: { active: number; suspended: number; arpuMinor: number | null };
  byPackage: { name: string; kind: "SUBSCRIPTION" | "HOTSPOT"; revenueMinor: number; sales: number }[];
  byHour: { hour: number; payments: number }[];
  byWeekday: { weekday: number; payments: number }[];
  atRisk: { customerId: string; fullName: string; phone: string; reason: string; since: string | null; owedMinor: number }[];
}

const DAY = 86_400_000;

export async function getRevenueAnalytics(tenantId: string, monthsBack = 6): Promise<RevenueAnalytics> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true, currency: true } });
  const tz = tenant.timezone || "Africa/Nairobi";
  const months = Math.min(24, Math.max(2, monthsBack));
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * DAY);

  const [monthlyRevenue, monthlyCustomers, subscriptionPackages, hotspotPackages, hours, weekdays] = await Promise.all([
    prisma.$queryRaw<{ month: Date; revenue: bigint | null; payments: bigint }[]>`
      SELECT date_trunc('month', "createdAt" AT TIME ZONE ${tz}) AS month,
             SUM("amountMinor")::bigint AS revenue, COUNT(*)::bigint AS payments
      FROM payments
      WHERE "tenantId" = ${tenantId} AND status = 'COMPLETED' AND "reversedAt" IS NULL AND "createdAt" >= ${since}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ month: Date; customers: bigint }[]>`
      SELECT date_trunc('month', "createdAt" AT TIME ZONE ${tz}) AS month, COUNT(*)::bigint AS customers
      FROM customers
      WHERE "tenantId" = ${tenantId} AND "deletedAt" IS NULL AND "createdAt" >= ${since}
      GROUP BY 1`,
    prisma.$queryRaw<{ name: string; revenue: bigint | null; sales: bigint }[]>`
      SELECT p.name, SUM(pay."amountMinor")::bigint AS revenue, COUNT(DISTINCT i.id)::bigint AS sales
      FROM payments pay
      JOIN invoices i ON i.id = pay."invoiceId"
      JOIN customer_services cs ON cs.id = i."customerServiceId"
      JOIN packages p ON p.id = cs."packageId"
      WHERE pay."tenantId" = ${tenantId} AND pay.status = 'COMPLETED' AND pay."reversedAt" IS NULL AND pay."createdAt" >= ${since}
      GROUP BY p.name`,
    prisma.$queryRaw<{ name: string; revenue: bigint | null; sales: bigint }[]>`
      SELECT hp.name, SUM(s."amountMinor")::bigint AS revenue, COUNT(*)::bigint AS sales
      FROM mpesa_stk_requests s
      JOIN hotspot_packages hp ON hp.id = s."hotspotPackageId"
      WHERE s."tenantId" = ${tenantId} AND s.status = 'COMPLETED' AND s."createdAt" >= ${since}
      GROUP BY hp.name`,
    prisma.$queryRaw<{ hour: number; payments: bigint }[]>`
      SELECT EXTRACT(HOUR FROM "createdAt" AT TIME ZONE ${tz})::int AS hour, COUNT(*)::bigint AS payments
      FROM payments
      WHERE "tenantId" = ${tenantId} AND status = 'COMPLETED' AND "createdAt" >= ${ninetyDaysAgo}
      GROUP BY 1`,
    prisma.$queryRaw<{ weekday: number; payments: bigint }[]>`
      SELECT EXTRACT(DOW FROM "createdAt" AT TIME ZONE ${tz})::int AS weekday, COUNT(*)::bigint AS payments
      FROM payments
      WHERE "tenantId" = ${tenantId} AND status = 'COMPLETED' AND "createdAt" >= ${ninetyDaysAgo}
      GROUP BY 1`,
  ]);

  // One row per month in the window, including months with nothing in them.
  const key = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const revenueByMonth = new Map(monthlyRevenue.map((r) => [key(r.month), r]));
  const customersByMonth = new Map(monthlyCustomers.map((r) => [key(r.month), Number(r.customers)]));
  const monthRows: RevenueAnalytics["months"] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(since.getFullYear(), since.getMonth() + i, 1));
    const k = key(d);
    const r = revenueByMonth.get(k);
    monthRows.push({ month: k, revenueMinor: Number(r?.revenue ?? 0), payments: Number(r?.payments ?? 0), newCustomers: customersByMonth.get(k) ?? 0 });
  }
  const thisMonth = monthRows[monthRows.length - 1]?.revenueMinor ?? 0;
  const lastMonth = monthRows[monthRows.length - 2]?.revenueMinor ?? 0;

  const [active, suspended, last30] = await Promise.all([
    prisma.customerService.count({ where: { tenantId, status: "ACTIVE" } }),
    prisma.customerService.count({ where: { tenantId, status: "SUSPENDED" } }),
    prisma.payment.aggregate({ where: { tenantId, status: "COMPLETED", reversedAt: null, createdAt: { gte: new Date(now.getTime() - 30 * DAY) }, customerId: { not: null } }, _sum: { amountMinor: true } }),
  ]);

  return {
    currency: tenant.currency,
    months: monthRows,
    growth: {
      thisMonthMinor: thisMonth,
      lastMonthMinor: lastMonth,
      changePercent: lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 1000) / 10 : null,
    },
    subscribers: { active, suspended, arpuMinor: active > 0 ? Math.round((last30._sum.amountMinor ?? 0) / active) : null },
    byPackage: [
      ...subscriptionPackages.map((p) => ({ name: p.name, kind: "SUBSCRIPTION" as const, revenueMinor: Number(p.revenue ?? 0), sales: Number(p.sales) })),
      ...hotspotPackages.map((p) => ({ name: p.name, kind: "HOTSPOT" as const, revenueMinor: Number(p.revenue ?? 0), sales: Number(p.sales) })),
    ].sort((a, b) => b.revenueMinor - a.revenueMinor),
    byHour: Array.from({ length: 24 }, (_, hour) => ({ hour, payments: Number(hours.find((h) => h.hour === hour)?.payments ?? 0) })),
    byWeekday: Array.from({ length: 7 }, (_, weekday) => ({ weekday, payments: Number(weekdays.find((w) => w.weekday === weekday)?.payments ?? 0) })),
    atRisk: await listCustomersAtRisk(tenantId),
  };
}

/**
 * Customers likely to leave, most urgent first: suspended right now, an overdue invoice, or a
 * paying customer who has gone quiet. Each gets one plain reason an operator can act on.
 */
export async function listCustomersAtRisk(tenantId: string, limit = 25): Promise<RevenueAnalytics["atRisk"]> {
  const quietSince = new Date(Date.now() - 40 * DAY);
  const rows = await prisma.$queryRaw<
    { id: string; fullName: string; phone: string; suspended: boolean; overdueSince: Date | null; owed: bigint | null; lastPaid: Date | null }[]
  >(Prisma.sql`
    SELECT c.id, c."fullName", c.phone,
           bool_or(cs.status = 'SUSPENDED') AS suspended,
           MIN(i."dueDate") FILTER (WHERE i.status = 'OVERDUE') AS "overdueSince",
           SUM(i."totalMinor" - i."amountPaidMinor") FILTER (WHERE i.status IN ('OVERDUE', 'PENDING', 'PARTIALLY_PAID'))::bigint AS owed,
           (SELECT MAX(p."createdAt") FROM payments p WHERE p."customerId" = c.id AND p.status = 'COMPLETED') AS "lastPaid"
    FROM customers c
    JOIN customer_services cs ON cs."customerId" = c.id AND cs.status IN ('ACTIVE', 'SUSPENDED')
    LEFT JOIN invoices i ON i."customerId" = c.id
    WHERE c."tenantId" = ${tenantId} AND c."deletedAt" IS NULL
    GROUP BY c.id`);

  const scored = rows
    .map((r) => {
      const owedMinor = Number(r.owed ?? 0);
      if (r.suspended) return { r, rank: 0, reason: "Suspended for non-payment", since: r.overdueSince, owedMinor };
      if (r.overdueSince) return { r, rank: 1, reason: "Invoice overdue", since: r.overdueSince, owedMinor };
      if (r.lastPaid && r.lastPaid < quietSince) return { r, rank: 2, reason: "No payment in over 40 days", since: r.lastPaid, owedMinor };
      return null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.rank - b.rank || (a.since?.getTime() ?? 0) - (b.since?.getTime() ?? 0))
    .slice(0, limit);

  return scored.map(({ r, reason, since, owedMinor }) => ({
    customerId: r.id,
    fullName: r.fullName,
    phone: r.phone,
    reason,
    since: since ? since.toISOString() : null,
    owedMinor,
  }));
}
