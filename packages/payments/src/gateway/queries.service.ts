import { prisma, Prisma, type GatewayTransaction, type TenantPayout } from "@mashupkgrid/database";
import { NotFoundError } from "@mashupkgrid/shared";
import { getTenantBalance } from "../ledger.service.js";
import { getSettlementSettings, getEffectiveFeeRule } from "./settings.service.js";
import { getActiveDestination, presentDestination } from "./destination.service.js";
import { maskPhone } from "./common.js";

/**
 * Read models for the payment dashboards. Every tenant-facing query takes the tenant id as a
 * mandatory filter supplied by the route from the caller's own token — never from the request —
 * so one tenant can never page into another's records.
 */

const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Midnight in Nairobi, as a UTC instant. */
export function startOfDayEat(now = new Date()): Date {
  const local = new Date(now.getTime() + EAT_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - EAT_OFFSET_MS);
}

export function startOfMonthEat(now = new Date()): Date {
  const local = new Date(now.getTime() + EAT_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - EAT_OFFSET_MS);
}

const n = (v: bigint | number | null | undefined) => Number(v ?? 0);

export interface DailyPoint {
  /** YYYY-MM-DD, Nairobi calendar day. */
  day: string;
  grossMinor: number;
  feeMinor: number;
  count: number;
}

async function dailySeries(from: Date, to: Date, tenantId?: string): Promise<DailyPoint[]> {
  const tenantFilter = tenantId ? Prisma.sql`AND "tenantId" = ${tenantId}` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ day: string; gross: bigint; fee: bigint; n: bigint }[]>`
    SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Nairobi', 'YYYY-MM-DD') AS day,
           SUM("grossMinor")::bigint AS gross, SUM("feeMinor")::bigint AS fee, COUNT(*) AS n
    FROM "gateway_transactions"
    WHERE "createdAt" >= ${from} AND "createdAt" < ${to} ${tenantFilter}
    GROUP BY 1 ORDER BY 1`;
  const byDay = new Map(rows.map((r) => [r.day, r]));
  // Every day in the range, zero-filled — a chart with gaps reads as missing data.
  const out: DailyPoint[] = [];
  for (let t = startOfDayEat(from).getTime(); t < to.getTime(); t += 24 * 60 * 60 * 1000) {
    const day = new Date(t + EAT_OFFSET_MS).toISOString().slice(0, 10);
    const r = byDay.get(day);
    out.push({ day, grossMinor: n(r?.gross), feeMinor: n(r?.fee), count: n(r?.n) });
  }
  return out;
}

export interface PlatformPaymentsOverview {
  todayCollectionsMinor: number;
  todayCount: number;
  monthCollectionsMinor: number;
  pendingSettlementsMinor: number;
  pendingSettlementsCount: number;
  awaitingApprovalCount: number;
  settledMinor30d: number;
  platformRevenueMinor30d: number;
  failedPayments30d: number;
  refundsMinor30d: number;
  totalOwedMinor: number;
  environment: "SANDBOX" | "PRODUCTION";
  gatewayEnabled: boolean;
  series: DailyPoint[];
}

export async function getPlatformPaymentsOverview(now = new Date()): Promise<PlatformPaymentsOverview> {
  const today = startOfDayEat(now);
  const month = startOfMonthEat(now);
  const thirtyDaysAgo = startOfDayEat(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000));

  const [[collections], [settlements], [ledger], [failed], settings, config, series] = await Promise.all([
    prisma.$queryRaw<{ today: bigint | null; today_n: bigint; month: bigint | null }[]>`
      SELECT SUM(CASE WHEN "createdAt" >= ${today} THEN "grossMinor"::bigint ELSE 0 END) AS today,
             COUNT(*) FILTER (WHERE "createdAt" >= ${today}) AS today_n,
             SUM(CASE WHEN "createdAt" >= ${month} THEN "grossMinor"::bigint ELSE 0 END) AS month
      FROM "gateway_transactions" WHERE "createdAt" >= LEAST(${today}, ${month})`,
    prisma.$queryRaw<{ pending: bigint | null; pending_n: bigint; approval_n: bigint; settled: bigint | null }[]>`
      SELECT SUM(CASE WHEN "status" IN ('REQUESTED','AWAITING_APPROVAL','PROCESSING') THEN "amountMinor"::bigint ELSE 0 END) AS pending,
             COUNT(*) FILTER (WHERE "status" IN ('REQUESTED','AWAITING_APPROVAL','PROCESSING')) AS pending_n,
             COUNT(*) FILTER (WHERE "status" = 'AWAITING_APPROVAL') AS approval_n,
             SUM(CASE WHEN "status" = 'SETTLED' AND "completedAt" >= ${thirtyDaysAgo} THEN "amountMinor"::bigint ELSE 0 END) AS settled
      FROM "tenant_payouts"`,
    prisma.$queryRaw<{ fees: bigint | null; fee_returns: bigint | null; refunds: bigint | null; owed: bigint | null }[]>`
      SELECT SUM(CASE WHEN "entryType" = 'PLATFORM_FEE' AND "createdAt" >= ${thirtyDaysAgo} THEN "amountMinor"::bigint ELSE 0 END) AS fees,
             SUM(CASE WHEN "entryType" = 'FEE_REVERSAL' AND "createdAt" >= ${thirtyDaysAgo} THEN "amountMinor"::bigint ELSE 0 END) AS fee_returns,
             SUM(CASE WHEN "entryType" IN ('REFUND','PAYMENT_REVERSAL') AND "createdAt" >= ${thirtyDaysAgo} THEN "amountMinor"::bigint ELSE 0 END) AS refunds,
             SUM(CASE WHEN "direction" = 'CREDIT' THEN "amountMinor"::bigint ELSE -"amountMinor"::bigint END) AS owed
      FROM "tenant_ledger_entries"`,
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM "mpesa_stk_requests"
      WHERE "collectedBy" = 'PLATFORM' AND "status" IN ('FAILED') AND "createdAt" >= ${thirtyDaysAgo}`,
    getSettlementSettings(),
    prisma.platformMpesaConfig.findFirst({ select: { environment: true } }),
    dailySeries(thirtyDaysAgo, new Date(today.getTime() + 24 * 60 * 60 * 1000)),
  ]);

  return {
    todayCollectionsMinor: n(collections?.today),
    todayCount: n(collections?.today_n),
    monthCollectionsMinor: n(collections?.month),
    pendingSettlementsMinor: n(settlements?.pending),
    pendingSettlementsCount: n(settlements?.pending_n),
    awaitingApprovalCount: n(settlements?.approval_n),
    settledMinor30d: n(settlements?.settled),
    platformRevenueMinor30d: n(ledger?.fees) - n(ledger?.fee_returns),
    failedPayments30d: n(failed?.n),
    refundsMinor30d: n(ledger?.refunds),
    totalOwedMinor: n(ledger?.owed),
    environment: config?.environment === "production" ? "PRODUCTION" : "SANDBOX",
    gatewayEnabled: settings.gatewayEnabled,
    series,
  };
}

// ---------------------------------------------------------------------------------------------

export interface TransactionFilters {
  tenantId?: string;
  from?: Date;
  to?: Date;
  status?: GatewayTransaction["status"];
  settlementStatus?: GatewayTransaction["settlementStatus"];
  channel?: GatewayTransaction["channel"];
  /** Transaction number, M-Pesa receipt, or payment reference. */
  search?: string;
  customer?: string;
  page?: number;
  pageSize?: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

function paging(f: { page?: number; pageSize?: number }) {
  const pageSize = Math.min(Math.max(f.pageSize ?? 25, 1), 100);
  const page = Math.max(f.page ?? 1, 1);
  return { take: pageSize, skip: (page - 1) * pageSize, page, pageSize };
}

export async function listGatewayTransactions(filters: TransactionFilters) {
  const { take, skip, page, pageSize } = paging(filters);
  const search = filters.search?.trim();
  const where: Prisma.GatewayTransactionWhereInput = {
    ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.settlementStatus ? { settlementStatus: filters.settlementStatus } : {}),
    ...(filters.channel ? { channel: filters.channel } : {}),
    ...(filters.from || filters.to
      ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
      : {}),
    ...(search
      ? {
          OR: [
            { txnNumber: { contains: search, mode: "insensitive" } },
            { providerReference: { contains: search, mode: "insensitive" } },
            { paymentReference: { reference: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
    ...(filters.customer?.trim()
      ? {
          customer: {
            OR: [
              { fullName: { contains: filters.customer.trim(), mode: "insensitive" } },
              { customerNumber: { contains: filters.customer.trim(), mode: "insensitive" } },
            ],
          },
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.gatewayTransaction.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      skip,
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        customer: { select: { id: true, fullName: true, customerNumber: true } },
        invoice: { select: { id: true, invoiceNumber: true } },
        paymentReference: { select: { reference: true } },
        settlement: { select: { id: true, settlementNumber: true, status: true } },
      },
    }),
    prisma.gatewayTransaction.count({ where }),
  ]);
  return {
    items: rows.map((r) => ({ ...r, payerPhone: maskPhone(r.payerPhone) })),
    total,
    page,
    pageSize,
  };
}

export async function getGatewayTransactionDetail(id: string, tenantId?: string) {
  const txn = await prisma.gatewayTransaction.findFirst({
    where: { id, ...(tenantId ? { tenantId } : {}) },
    include: {
      tenant: { select: { id: true, name: true, slug: true } },
      customer: { select: { id: true, fullName: true, customerNumber: true, phone: true } },
      invoice: { select: { id: true, invoiceNumber: true, status: true, totalMinor: true } },
      paymentReference: { select: { reference: true, purpose: true } },
      payment: { select: { id: true, method: true, status: true, reference: true, reversedAt: true, reversalReason: true } },
      settlement: { select: { id: true, settlementNumber: true, status: true, completedAt: true } },
      ledgerEntries: { orderBy: { createdAt: "asc" } },
      refunds: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!txn) throw new NotFoundError("Transaction");
  return {
    ...txn,
    payerPhone: maskPhone(txn.payerPhone),
    customer: txn.customer ? { ...txn.customer, phone: maskPhone(txn.customer.phone) } : null,
  };
}

// ---------------------------------------------------------------------------------------------

export interface SettlementFilters {
  tenantId?: string;
  status?: TenantPayout["status"];
  provider?: TenantPayout["provider"];
  from?: Date;
  to?: Date;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listSettlements(filters: SettlementFilters) {
  const { take, skip, page, pageSize } = paging(filters);
  const search = filters.search?.trim();
  const where: Prisma.TenantPayoutWhereInput = {
    ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.provider ? { provider: filters.provider } : {}),
    ...(filters.from || filters.to
      ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
      : {}),
    ...(search
      ? {
          OR: [
            { settlementNumber: { contains: search, mode: "insensitive" } },
            { transactionId: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.tenantPayout.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      skip,
      include: { tenant: { select: { id: true, name: true, slug: true } }, retry: { select: { id: true, settlementNumber: true } } },
    }),
    prisma.tenantPayout.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function getSettlementDetail(id: string, tenantId?: string) {
  const settlement = await prisma.tenantPayout.findFirst({
    where: { id, ...(tenantId ? { tenantId } : {}) },
    include: {
      tenant: { select: { id: true, name: true, slug: true } },
      retryOf: { select: { id: true, settlementNumber: true } },
      retry: { select: { id: true, settlementNumber: true, status: true } },
      ledgerEntries: { orderBy: { createdAt: "asc" } },
      gatewayTransactions: {
        orderBy: { createdAt: "asc" },
        take: 200,
        select: { id: true, txnNumber: true, grossMinor: true, feeMinor: true, netMinor: true, createdAt: true, status: true },
      },
    },
  });
  if (!settlement) throw new NotFoundError("Settlement");
  return settlement;
}

// ---------------------------------------------------------------------------------------------

export async function listWebhookEvents(filters: {
  status?: string;
  eventType?: string;
  search?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}) {
  const { take, skip, page, pageSize } = paging(filters);
  const search = filters.search?.trim();
  const where: Prisma.PaymentWebhookEventWhereInput = {
    ...(filters.status ? { status: filters.status as Prisma.EnumWebhookEventStatusFilter["equals"] } : {}),
    ...(filters.eventType ? { eventType: filters.eventType } : {}),
    ...(filters.from || filters.to
      ? { receivedAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
      : {}),
    ...(search
      ? {
          OR: [
            { externalId: { contains: search, mode: "insensitive" } },
            { transactionReference: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.paymentWebhookEvent.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      take,
      skip,
      include: { tenant: { select: { name: true } } },
    }),
    prisma.paymentWebhookEvent.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

// ---------------------------------------------------------------------------------------------

export interface TenantPaymentsOverview {
  gateway: {
    connected: boolean;
    enabledByPlatform: boolean;
    environment: "SANDBOX" | "PRODUCTION";
    paybill: string | null;
  };
  balance: Awaited<ReturnType<typeof getTenantBalance>>;
  todayCollectionsMinor: number;
  monthCollectionsMinor: number;
  monthFeesMinor: number;
  feeRule: { percentBps: number; fixedMinor: number };
  settlement: {
    mode: "AUTOMATIC" | "MANUAL";
    frequency: "INSTANT" | "DAILY" | "WEEKLY" | "MANUAL";
    minimumMinor: number;
    hourEat: number;
    weekday: number;
  };
  destination: ReturnType<typeof presentDestination> | null;
  series: DailyPoint[];
}

export async function getTenantPaymentsOverview(tenantId: string, now = new Date()): Promise<TenantPaymentsOverview> {
  const today = startOfDayEat(now);
  const month = startOfMonthEat(now);
  const thirtyDaysAgo = startOfDayEat(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000));

  const [tenant, settings, config, balance, [sums], feeRule, destination, series] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { collectionMode: true } }),
    getSettlementSettings(),
    prisma.platformMpesaConfig.findFirst({ select: { environment: true, shortcode: true } }),
    getTenantBalance(tenantId),
    prisma.$queryRaw<{ today: bigint | null; month: bigint | null; month_fees: bigint | null }[]>`
      SELECT SUM(CASE WHEN "createdAt" >= ${today} THEN "grossMinor"::bigint ELSE 0 END) AS today,
             SUM(CASE WHEN "createdAt" >= ${month} THEN "grossMinor"::bigint ELSE 0 END) AS month,
             SUM(CASE WHEN "createdAt" >= ${month} THEN "feeMinor"::bigint ELSE 0 END) AS month_fees
      FROM "gateway_transactions" WHERE "tenantId" = ${tenantId} AND "createdAt" >= LEAST(${today}, ${month})`,
    getEffectiveFeeRule(prisma, tenantId),
    getActiveDestination(tenantId),
    dailySeries(thirtyDaysAgo, new Date(today.getTime() + 24 * 60 * 60 * 1000), tenantId),
  ]);

  return {
    gateway: {
      connected: tenant.collectionMode === "PLATFORM",
      enabledByPlatform: settings.gatewayEnabled,
      environment: config?.environment === "production" ? "PRODUCTION" : "SANDBOX",
      // The paybill customers pay into is public information by design.
      paybill: config?.shortcode ?? null,
    },
    balance,
    todayCollectionsMinor: n(sums?.today),
    monthCollectionsMinor: n(sums?.month),
    monthFeesMinor: n(sums?.month_fees),
    feeRule,
    settlement: {
      mode: settings.settlementMode,
      frequency: settings.settlementFrequency,
      minimumMinor: settings.settlementMinimumMinor,
      hourEat: settings.settlementHourEat,
      weekday: settings.settlementWeekday,
    },
    destination: destination ? presentDestination(destination) : null,
    series,
  };
}
