import { prisma } from "@mashupkgrid/database";
import { dayKeyInTimeZone } from "@mashupkgrid/shared";

/** The tenant's own timezone, for bucketing report rows into the days its operator actually
 *  experiences. Falls back to the same default the Tenant model uses. */
export async function tenantTimeZone(tenantId: string): Promise<string> {
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

// ---------------------------------------------------------------------------------------------
// Comprehensive Revenue Report (Day, Week, Month, Custom with Stamped Date & CSV/PDF ready data)
// ---------------------------------------------------------------------------------------------

export interface RevenueReportOptions {
  period?: "day" | "week" | "month" | "year" | "custom" | "all";
  date?: string; // e.g. YYYY-MM-DD or YYYY-MM
  startDate?: string;
  endDate?: string;
  days?: number;
}

export interface RevenueRecordItem {
  id: string;
  receiptNumber: string;
  paidAt: string;
  stampedDate: string;
  customerId: string | null;
  customerName: string;
  customerNumber: string;
  customerPhone: string;
  serviceOrPurpose: string;
  method: string;
  reference: string;
  amountMinor: number;
  currency: string;
  status: string;
}

export interface ComprehensiveRevenueReport {
  tenant: {
    id: string;
    name: string;
    currency: string;
    timezone: string;
    logoUrl: string | null;
    brandColor: string | null;
  };
  period: string;
  periodLabel: string;
  dateRange: {
    from: string;
    to: string;
  };
  stampedAt: string;
  stampHash: string;
  certifiedBy: string;
  summary: {
    totalRevenueMinor: number;
    paymentCount: number;
    uniqueClientsCount: number;
    averageSpendMinor: number;
    byMethod: Record<string, { count: number; totalMinor: number }>;
    byDay: Array<{ date: string; totalMinor: number; paymentCount: number }>;
  };
  records: RevenueRecordItem[];
}

function formatDateInTz(date: Date, timeZone: string, includeTime = true): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      dateStyle: "medium",
      ...(includeTime ? { timeStyle: "medium" } : {}),
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

export async function getComprehensiveRevenueReport(
  tenantId: string,
  options: RevenueReportOptions = {}
): Promise<ComprehensiveRevenueReport> {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { id: true, name: true, currency: true, timezone: true, logoUrl: true, brandColor: true },
  });

  const timeZone = tenant.timezone || "Africa/Nairobi";
  const now = new Date();

  let fromDate: Date;
  let toDate: Date = new Date();
  let periodLabel = "All Time";
  const period = options.period ?? "month";

  if (period === "day") {
    const targetDate = options.date ? new Date(options.date) : now;
    fromDate = new Date(targetDate);
    fromDate.setHours(0, 0, 0, 0);
    toDate = new Date(targetDate);
    toDate.setHours(23, 59, 59, 999);
    periodLabel = `Daily Revenue (${formatDateInTz(fromDate, timeZone, false)})`;
  } else if (period === "week") {
    // Current week: Monday to Sunday
    const currentDay = now.getDay();
    const diffToMonday = (currentDay + 6) % 7;
    fromDate = new Date(now);
    fromDate.setDate(now.getDate() - diffToMonday);
    fromDate.setHours(0, 0, 0, 0);
    toDate = new Date(fromDate);
    toDate.setDate(fromDate.getDate() + 6);
    toDate.setHours(23, 59, 59, 999);
    periodLabel = `Weekly Revenue (${formatDateInTz(fromDate, timeZone, false)} – ${formatDateInTz(toDate, timeZone, false)})`;
  } else if (period === "month") {
    let year = now.getFullYear();
    let month = now.getMonth();
    if (options.date && options.date.includes("-")) {
      const parts = options.date.split("-").map(Number);
      if (parts[0] && parts[1]) {
        year = parts[0];
        month = parts[1] - 1;
      }
    }
    fromDate = new Date(year, month, 1, 0, 0, 0, 0);
    toDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
    const monthName = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone }).format(fromDate);
    periodLabel = `Monthly Revenue (${monthName})`;
  } else if (period === "custom" && options.startDate && options.endDate) {
    fromDate = new Date(options.startDate);
    fromDate.setHours(0, 0, 0, 0);
    toDate = new Date(options.endDate);
    toDate.setHours(23, 59, 59, 999);
    periodLabel = `Custom Period (${formatDateInTz(fromDate, timeZone, false)} – ${formatDateInTz(toDate, timeZone, false)})`;
  } else {
    const days = options.days ?? 30;
    fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    toDate = now;
    periodLabel = `Past ${days} Days`;
  }

  const payments = (await prisma.payment.findMany({
    where: {
      tenantId,
      status: "COMPLETED",
      createdAt: { gte: fromDate, lte: toDate },
    },
    include: {
      customer: { select: { id: true, customerNumber: true, fullName: true, phone: true } },
      receipt: { select: { id: true, receiptNumber: true, issuedAt: true } },
      invoice: { select: { id: true, invoiceNumber: true, items: { select: { description: true } } } },
      gatewayTransaction: { select: { txnNumber: true, providerReference: true, channel: true } },
      mpesaStkRequest: { select: { mpesaReceiptNumber: true, phone: true } },
      mpesaC2BTxn: { select: { transactionId: true, msisdn: true, billRefNumber: true } },
    },
    orderBy: { createdAt: "desc" },
  })) as any[];

  const byMethod: Record<string, { count: number; totalMinor: number }> = {};
  const byDayMap = new Map<string, { totalMinor: number; paymentCount: number }>();
  const uniqueClients = new Set<string>();

  let totalRevenueMinor = 0;

  const records: RevenueRecordItem[] = payments.map((p) => {
    totalRevenueMinor += p.amountMinor;

    const clientId = p.customerId ?? p.customer?.id ?? p.mpesaStkRequest?.phone ?? p.mpesaC2BTxn?.msisdn ?? p.id;
    uniqueClients.add(clientId);

    // Method bucket
    const methodKey = p.method ?? "OTHER";
    if (!byMethod[methodKey]) byMethod[methodKey] = { count: 0, totalMinor: 0 };
    byMethod[methodKey].count += 1;
    byMethod[methodKey].totalMinor += p.amountMinor;

    // Day bucket
    const dayKey = dayKeyInTimeZone(p.createdAt, timeZone);
    const dayBucket = byDayMap.get(dayKey) ?? { totalMinor: 0, paymentCount: 0 };
    dayBucket.totalMinor += p.amountMinor;
    dayBucket.paymentCount += 1;
    byDayMap.set(dayKey, dayBucket);

    const receiptNum = p.receipt?.receiptNumber ?? `RCT-${p.id.slice(0, 8).toUpperCase()}`;
    const customerName = p.customer?.fullName ??
      (p.mpesaStkRequest?.phone ? `Hotspot Guest (${p.mpesaStkRequest.phone})` :
      (p.mpesaC2BTxn?.msisdn ? `M-Pesa (${p.mpesaC2BTxn.msisdn})` : "Walk-in Guest"));
    const customerPhone = p.customer?.phone ?? p.mpesaStkRequest?.phone ?? p.mpesaC2BTxn?.msisdn ?? "—";
    const ref = p.reference ?? p.gatewayTransaction?.providerReference ?? p.mpesaStkRequest?.mpesaReceiptNumber ?? p.mpesaC2BTxn?.transactionId ?? "—";
    const purpose = p.invoice?.items?.[0]?.description ?? (p.invoice ? `Invoice #${p.invoice.invoiceNumber}` : "Internet Package / Voucher");

    return {
      id: p.id,
      receiptNumber: receiptNum,
      paidAt: p.createdAt.toISOString(),
      stampedDate: formatDateInTz(p.createdAt, timeZone, true),
      customerId: p.customerId,
      customerName,
      customerNumber: p.customer?.customerNumber ?? "GUEST",
      customerPhone,
      serviceOrPurpose: purpose,
      method: p.method,
      reference: ref,
      amountMinor: p.amountMinor,
      currency: p.currency,
      status: p.status,
    };
  });

  const byDay = [...byDayMap.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const stampedAt = formatDateInTz(now, timeZone, true);
  const stampHash = `MASH-STAMP-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 8999 + 1000)}`;

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      currency: tenant.currency,
      timezone: timeZone,
      logoUrl: tenant.logoUrl,
      brandColor: tenant.brandColor,
    },
    period,
    periodLabel,
    dateRange: {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    },
    stampedAt,
    stampHash,
    certifiedBy: `${tenant.name} Revenue & Accounts`,
    summary: {
      totalRevenueMinor,
      paymentCount: payments.length,
      uniqueClientsCount: uniqueClients.size,
      averageSpendMinor: uniqueClients.size > 0 ? Math.round(totalRevenueMinor / uniqueClients.size) : 0,
      byMethod,
      byDay,
    },
    records,
  };
}

// ---------------------------------------------------------------------------------------------
// Clients Tracking Report (Joined When, Lifetime Spend, Payments Count, Latest Receipt)
// ---------------------------------------------------------------------------------------------

export interface ClientsReportOptions {
  search?: string;
  joinedPeriod?: "all" | "today" | "this_week" | "this_month";
  status?: string;
  limit?: number;
}

export interface ClientTrackItem {
  id: string;
  customerNumber: string;
  fullName: string;
  phone: string;
  email: string | null;
  status: string;
  address: string | null;
  joinedAt: string;
  joinedDateFormatted: string;
  totalSpendMinor: number;
  paymentCount: number;
  lastPaymentDate: string | null;
  lastPaymentDateFormatted: string | null;
  latestReceiptNumber: string | null;
  latestPaymentId: string | null;
  activePackages: string;
  walletBalanceMinor: number;
}

export interface ComprehensiveClientsReport {
  tenant: {
    id: string;
    name: string;
    currency: string;
    timezone: string;
  };
  stampedAt: string;
  stampHash: string;
  summary: {
    totalClients: number;
    activeClients: number;
    totalSpendAllClientsMinor: number;
    averageSpendPerClientMinor: number;
  };
  clients: ClientTrackItem[];
}

export async function getClientsTrackingReport(
  tenantId: string,
  options: ClientsReportOptions = {}
): Promise<ComprehensiveClientsReport> {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { id: true, name: true, currency: true, timezone: true },
  });

  const timeZone = tenant.timezone || "Africa/Nairobi";
  const now = new Date();

  let createdAtFilter: { gte?: Date } | undefined;
  if (options.joinedPeriod === "today") {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    createdAtFilter = { gte: today };
  } else if (options.joinedPeriod === "this_week") {
    const currentDay = now.getDay();
    const diffToMonday = (currentDay + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);
    monday.setHours(0, 0, 0, 0);
    createdAtFilter = { gte: monday };
  } else if (options.joinedPeriod === "this_month") {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    createdAtFilter = { gte: startOfMonth };
  }

  const where = {
    tenantId,
    deletedAt: null,
    ...(options.status ? { status: options.status as never } : {}),
    ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
    ...(options.search
      ? {
          OR: [
            { fullName: { contains: options.search, mode: "insensitive" as const } },
            { phone: { contains: options.search, mode: "insensitive" as const } },
            { email: { contains: options.search, mode: "insensitive" as const } },
            { customerNumber: { contains: options.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const customers = await prisma.customer.findMany({
    where,
    take: options.limit ?? 200,
    orderBy: { createdAt: "desc" },
    include: {
      payments: {
        where: { status: "COMPLETED" },
        select: {
          id: true,
          amountMinor: true,
          createdAt: true,
          receipt: { select: { id: true, receiptNumber: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      services: {
        where: { status: "ACTIVE" },
        select: { id: true, package: { select: { name: true } } },
      },
      wallet: { select: { balanceMinor: true } },
    },
  });

  let totalSpendAllClientsMinor = 0;
  let activeClients = 0;

  const clients: ClientTrackItem[] = customers.map((c) => {
    if (c.status === "ACTIVE") activeClients += 1;

    const totalSpendMinor = c.payments.reduce((sum, p) => sum + p.amountMinor, 0);
    totalSpendAllClientsMinor += totalSpendMinor;

    const latestPayment = c.payments[0] ?? null;
    const latestReceiptNumber = latestPayment?.receipt?.receiptNumber ??
      (latestPayment ? `RCT-${latestPayment.id.slice(0, 8).toUpperCase()}` : null);

    const activePackages = c.services.map((s) => s.package.name).join(", ") || "No active broadband";

    return {
      id: c.id,
      customerNumber: c.customerNumber,
      fullName: c.fullName,
      phone: c.phone,
      email: c.email,
      status: c.status,
      address: c.address,
      joinedAt: c.createdAt.toISOString(),
      joinedDateFormatted: formatDateInTz(c.createdAt, timeZone, false),
      totalSpendMinor,
      paymentCount: c.payments.length,
      lastPaymentDate: latestPayment ? latestPayment.createdAt.toISOString() : null,
      lastPaymentDateFormatted: latestPayment ? formatDateInTz(latestPayment.createdAt, timeZone, true) : null,
      latestReceiptNumber,
      latestPaymentId: latestPayment?.id ?? null,
      activePackages,
      walletBalanceMinor: c.wallet?.balanceMinor ?? 0,
    };
  });

  const stampedAt = formatDateInTz(now, timeZone, true);
  const stampHash = `MASH-CLIENTS-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 8999 + 1000)}`;

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      currency: tenant.currency,
      timezone: timeZone,
    },
    stampedAt,
    stampHash,
    summary: {
      totalClients: customers.length,
      activeClients,
      totalSpendAllClientsMinor,
      averageSpendPerClientMinor: customers.length > 0 ? Math.round(totalSpendAllClientsMinor / customers.length) : 0,
    },
    clients,
  };
}

// ---------------------------------------------------------------------------------------------
// Stamped Official Payment Receipt
// ---------------------------------------------------------------------------------------------

export interface StampedPaymentReceipt {
  receiptNumber: string;
  issuedAt: string;
  stampedDate: string;
  verificationStamp: string;
  tenant: {
    id: string;
    name: string;
    currency: string;
    timezone: string;
    logoUrl: string | null;
  };
  customer: {
    id: string | null;
    fullName: string;
    customerNumber: string;
    phone: string;
    email: string | null;
    address: string | null;
  };
  payment: {
    id: string;
    amountMinor: number;
    currency: string;
    method: string;
    reference: string;
    paidAt: string;
    status: string;
  };
  invoice: {
    id: string | null;
    invoiceNumber: string | null;
    dueDate: string | null;
    description: string;
  } | null;
}

export async function getStampedPaymentReceipt(
  tenantId: string,
  paymentId: string
): Promise<StampedPaymentReceipt> {
  const payment = (await prisma.payment.findFirst({
    where: { id: paymentId, tenantId },
    include: {
      tenant: { select: { id: true, name: true, currency: true, timezone: true, logoUrl: true } },
      customer: { select: { id: true, fullName: true, customerNumber: true, phone: true, email: true, address: true } },
      receipt: true,
      invoice: { select: { id: true, invoiceNumber: true, dueDate: true, items: { select: { description: true } } } },
      gatewayTransaction: { select: { providerReference: true, channel: true } },
      mpesaStkRequest: { select: { mpesaReceiptNumber: true, phone: true } },
      mpesaC2BTxn: { select: { transactionId: true, msisdn: true } },
    },
  })) as any;

  if (!payment) {
    throw new Error(`Payment ${paymentId} not found`);
  }

  const timeZone = payment.tenant.timezone || "Africa/Nairobi";

  // Ensure receipt exists in DB or create if missing
  let receiptNumber = payment.receipt?.receiptNumber;
  let issuedAt = payment.receipt?.issuedAt ?? payment.createdAt;

  if (!payment.receipt) {
    const count = await prisma.receipt.count({ where: { tenantId } });
    const generatedNum = `RCT-${String(count + 1).padStart(7, "0")}`;
    try {
      const created = await prisma.receipt.create({
        data: { tenantId, paymentId: payment.id, receiptNumber: generatedNum },
      });
      receiptNumber = created.receiptNumber;
      issuedAt = created.issuedAt;
    } catch {
      receiptNumber = `RCT-${payment.id.slice(0, 8).toUpperCase()}`;
    }
  }

  const ref = payment.reference ?? payment.gatewayTransaction?.providerReference ?? payment.mpesaStkRequest?.mpesaReceiptNumber ?? payment.mpesaC2BTxn?.transactionId ?? "—";
  const customerName = payment.customer?.fullName ??
    (payment.mpesaStkRequest?.phone ? `Hotspot Client (${payment.mpesaStkRequest.phone})` :
    (payment.mpesaC2BTxn?.msisdn ? `M-Pesa Client (${payment.mpesaC2BTxn.msisdn})` : "Walk-in Customer"));

  return {
    receiptNumber: receiptNumber ?? `RCT-${payment.id.slice(0, 8).toUpperCase()}`,
    issuedAt: issuedAt.toISOString(),
    stampedDate: formatDateInTz(issuedAt, timeZone, true),
    verificationStamp: `STAMP-RCT-${payment.id.slice(0, 8).toUpperCase()}-${new Date(issuedAt).getFullYear()}`,
    tenant: {
      id: payment.tenant.id,
      name: payment.tenant.name,
      currency: payment.tenant.currency,
      timezone: timeZone,
      logoUrl: payment.tenant.logoUrl,
    },
    customer: {
      id: payment.customer?.id ?? null,
      fullName: customerName,
      customerNumber: payment.customer?.customerNumber ?? "GUEST",
      phone: payment.customer?.phone ?? payment.mpesaStkRequest?.phone ?? payment.mpesaC2BTxn?.msisdn ?? "—",
      email: payment.customer?.email ?? null,
      address: payment.customer?.address ?? null,
    },
    payment: {
      id: payment.id,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      method: payment.method,
      reference: ref,
      paidAt: payment.createdAt.toISOString(),
      status: payment.status,
    },
    invoice: payment.invoice
      ? {
          id: payment.invoice.id,
          invoiceNumber: payment.invoice.invoiceNumber,
          dueDate: payment.invoice.dueDate.toISOString(),
          description: payment.invoice.items?.[0]?.description ?? `Invoice #${payment.invoice.invoiceNumber}`,
        }
      : {
          id: null,
          invoiceNumber: null,
          dueDate: null,
          description: "Hotspot Internet Voucher / Top-up",
        },
  };
}

