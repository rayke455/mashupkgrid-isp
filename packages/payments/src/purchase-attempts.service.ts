import { prisma } from "@mashupkgrid/database";

/**
 * A unified, read-only view of every payment a customer STARTED — not just the ones that
 * succeeded.
 *
 * Until now a tenant could only see money that arrived: invoices, payments, vouchers. A customer
 * who tapped Buy, entered their number and then never completed the M-Pesa prompt left a row in
 * `mpesa_stk_requests` that nothing in the dashboard ever surfaced. That is precisely the
 * customer worth calling back — they wanted to pay and something stopped them — and it is also
 * the only way an operator can tell "nobody is buying" apart from "everybody is failing at the
 * same step", which look identical from a revenue report.
 *
 * Reads two tables because that is how the data is stored: M-Pesa STK pushes live in
 * `mpesa_stk_requests`, while BOTH Paystack and Pesapal share `paystack_transactions` (Pesapal
 * was added by reusing that table rather than adding a parallel one).
 */

export type PurchaseAttemptProvider = "MPESA" | "PAYSTACK" | "PESAPAL";
/** The two source tables disagree on one name: an M-Pesa push the payer dismissed is CANCELLED,
 *  while a Paystack/Pesapal checkout the payer walked away from is ABANDONED. They mean the same
 *  thing to an operator — "they changed their mind" — so both surface as ABANDONED here, and the
 *  maps below translate back when filtering each table. */
export type PurchaseAttemptStatus = "PENDING" | "COMPLETED" | "FAILED" | "ABANDONED";

const MPESA_STATUS = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  ABANDONED: "CANCELLED",
} as const;

const GATEWAY_STATUS = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  ABANDONED: "ABANDONED",
} as const;

export interface PurchaseAttempt {
  id: string;
  provider: PurchaseAttemptProvider;
  /** The gateway's own handle — an M-Pesa CheckoutRequestID, or a Paystack/Pesapal reference.
   *  This is what a support agent quotes when chasing a payment with the provider. */
  reference: string;
  createdAt: Date;
  updatedAt: Date;
  phone: string | null;
  email: string | null;
  amountMinor: number;
  currency: string;
  packageName: string | null;
  customerName: string | null;
  status: PurchaseAttemptStatus;
  /** Why it did not complete, in the gateway's own words ("Request cancelled by user",
   *  "Insufficient balance") — the part that makes an attempt actionable rather than just a
   *  number in a failure count. */
  failureReason: string | null;
  /** Set once an attempt succeeded and issued a hotspot voucher. */
  voucherCode: string | null;
}

export interface ListPurchaseAttemptsOptions {
  status?: PurchaseAttemptStatus;
  /** How far back to look. */
  days?: number;
  /** Cap on returned rows after merging both sources. */
  limit?: number;
}

/** Pesapal reuses the Paystack table, and the reference prefix is the only thing that
 *  distinguishes the two (see initiatePesapalHotspotPurchase, which builds "PESA-..."). */
function providerForReference(reference: string): PurchaseAttemptProvider {
  return reference.startsWith("PESA-") ? "PESAPAL" : "PAYSTACK";
}

export async function listPurchaseAttempts(
  tenantId: string,
  options: ListPurchaseAttemptsOptions = {}
): Promise<PurchaseAttempt[]> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const since = new Date(Date.now() - (options.days ?? 7) * 24 * 60 * 60 * 1000);


  // Each source is capped at `limit` before merging: the merged list is then sorted and cut to
  // `limit` again, so a tenant using one gateway heavily cannot push the other off the page.
  const [stk, gateway] = await Promise.all([
    prisma.mpesaStkRequest.findMany({
      where: {
        tenantId,
        createdAt: { gte: since },
        ...(options.status ? { status: MPESA_STATUS[options.status] } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { hotspotPackage: { select: { name: true } }, customer: { select: { fullName: true } } },
    }),
    prisma.paystackTransaction.findMany({
      where: {
        tenantId,
        createdAt: { gte: since },
        ...(options.status ? { status: GATEWAY_STATUS[options.status] } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { hotspotPackage: { select: { name: true } }, customer: { select: { fullName: true } } },
    }),
  ]);

  const attempts: PurchaseAttempt[] = [
    ...stk.map((r) => ({
      id: r.id,
      provider: "MPESA" as const,
      reference: r.checkoutRequestId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      phone: r.phone,
      email: null,
      amountMinor: r.amountMinor,
      currency: "KES",
      packageName: r.hotspotPackage?.name ?? null,
      customerName: r.customer?.fullName ?? null,
      status: (r.status === "CANCELLED" ? "ABANDONED" : r.status) as PurchaseAttemptStatus,
      // Only meaningful once it has stopped being PENDING; Daraja sends resultDesc even on
      // success ("The service request is processed successfully"), which is noise here.
      failureReason: r.status === "PENDING" || r.status === "COMPLETED" ? null : r.resultDesc,
      voucherCode: r.hotspotVoucherCode,
    })),
    ...gateway.map((t) => ({
      id: t.id,
      provider: providerForReference(t.reference),
      reference: t.reference,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      phone: t.hotspotPhone,
      email: t.hotspotEmail,
      amountMinor: t.amountMinor,
      currency: t.currency,
      packageName: t.hotspotPackage?.name ?? null,
      customerName: t.customer?.fullName ?? null,
      status: t.status as PurchaseAttemptStatus,
      failureReason: t.status === "PENDING" || t.status === "COMPLETED" ? null : t.gatewayResponse,
      voucherCode: t.hotspotVoucherCode,
    })),
  ];

  return attempts
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

export interface PurchaseAttemptSummary {
  total: number;
  completed: number;
  pending: number;
  failed: number;
  /** Attempts the customer walked away from, as opposed to ones the gateway rejected. Worth
   *  separating: a wall of FAILED points at a configuration or balance problem, a wall of
   *  ABANDONED points at price or a confusing checkout. */
  abandoned: number;
  /** Completed as a percentage of all attempts, rounded. Null when there were no attempts at
   *  all — a conversion rate of "0%" reads as a broken funnel, which is a different and much
   *  more alarming statement than "nobody tried". */
  conversionRate: number | null;
}

export async function summarisePurchaseAttempts(
  tenantId: string,
  days = 7
): Promise<PurchaseAttemptSummary> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const where = { tenantId, createdAt: { gte: since } };

  const [stkGroups, gatewayGroups] = await Promise.all([
    prisma.mpesaStkRequest.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.paystackTransaction.groupBy({ by: ["status"], where, _count: { _all: true } }),
  ]);

  const counts: Record<string, number> = {};
  for (const group of [...stkGroups, ...gatewayGroups]) {
    counts[group.status] = (counts[group.status] ?? 0) + group._count._all;
  }

  const completed = counts.COMPLETED ?? 0;
  const pending = counts.PENDING ?? 0;
  const failed = counts.FAILED ?? 0;
  const abandoned = (counts.CANCELLED ?? 0) + (counts.ABANDONED ?? 0);
  const total = completed + pending + failed + abandoned;

  return {
    total,
    completed,
    pending,
    failed,
    abandoned,
    conversionRate: total === 0 ? null : Math.round((completed / total) * 100),
  };
}
