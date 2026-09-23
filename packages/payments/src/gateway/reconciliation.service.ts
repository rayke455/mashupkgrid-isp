import { prisma, Prisma } from "@mashupkgrid/database";

/**
 * Reconciliation: four independent records of the same money, compared.
 *
 *   provider      — what M-Pesa told us (STK callbacks / status queries, C2B confirmations)
 *   transactions  — gateway_transactions (what we say we collected for a tenant)
 *   ledger        — tenant_ledger_entries (what we say we owe)
 *   settlements   — tenant_payouts (what we say we paid out)
 *
 * Every check below is a plain query for one specific way these can disagree. None of them fixes
 * anything: a discrepancy is shown to a person with the rows involved, because the correct fix
 * (assign, reverse, resolve with Safaricom) always needs judgement.
 *
 * Limitation, stated plainly: Safaricom offers no API to list a paybill's transactions, so
 * "provider" here means the callbacks Safaricom actually sent us. A payment Safaricom took but
 * never told us about can only be found by comparing against the M-Pesa statement.
 */

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface DiscrepancyItem {
  id: string;
  tenantId: string | null;
  tenantName: string | null;
  reference: string | null;
  amountMinor: number | null;
  occurredAt: Date | null;
  detail: string;
}

export interface DiscrepancyCheck {
  code: string;
  severity: Severity;
  title: string;
  description: string;
  count: number;
  amountMinor: number;
  items: DiscrepancyItem[];
}

export interface ReconciliationTotals {
  from: Date;
  to: Date;
  providerCollectedMinor: number;
  providerCount: number;
  transactionsGrossMinor: number;
  transactionsCount: number;
  ledgerCustomerCreditsMinor: number;
  platformFeesMinor: number;
  settledMinor: number;
  pendingSettlementMinor: number;
  /** Everything the platform currently owes all tenants (ledger, all time). */
  totalOwedMinor: number;
}

export interface ReconciliationReport {
  generatedAt: Date;
  totals: ReconciliationTotals;
  checks: DiscrepancyCheck[];
}

const ITEM_LIMIT = 100;

type Row = {
  id: string;
  tenant_id: string | null;
  tenant_name: string | null;
  reference: string | null;
  amount: number | bigint | null;
  occurred_at: Date | null;
  detail: string;
};

async function check(
  meta: Omit<DiscrepancyCheck, "count" | "amountMinor" | "items">,
  sql: Prisma.Sql
): Promise<DiscrepancyCheck> {
  const rows = await prisma.$queryRaw<Row[]>(sql);
  const amountMinor = rows.reduce((t, r) => t + Number(r.amount ?? 0), 0);
  return {
    ...meta,
    count: rows.length,
    amountMinor,
    items: rows.slice(0, ITEM_LIMIT).map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      tenantName: r.tenant_name,
      reference: r.reference,
      amountMinor: r.amount === null ? null : Number(r.amount),
      occurredAt: r.occurred_at,
      detail: r.detail,
    })),
  };
}

export async function runReconciliation(range: { from?: Date; to?: Date } = {}): Promise<ReconciliationReport> {
  const to = range.to ?? new Date();
  const from = range.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

  const checks = await Promise.all([
    check(
      {
        code: "PAYMENT_NOT_CREDITED",
        severity: "critical",
        title: "Payment received but tenant not credited",
        description:
          "M-Pesa confirmed a payment into the platform paybill and it was recorded against an invoice or wallet, but no gateway transaction or ledger credit exists for the tenant.",
      },
      Prisma.sql`
        SELECT s."id", s."tenantId" AS tenant_id, t."name" AS tenant_name, s."mpesaReceiptNumber" AS reference,
               s."amountMinor" AS amount, s."updatedAt" AS occurred_at, 'STK push ' || s."checkoutRequestId" AS detail
        FROM "mpesa_stk_requests" s JOIN "tenants" t ON t."id" = s."tenantId"
        WHERE s."collectedBy" = 'PLATFORM' AND s."status" = 'COMPLETED' AND s."paymentId" IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM "gateway_transactions" g WHERE g."paymentId" = s."paymentId")
        UNION ALL
        SELECT c."id", c."tenantId", t."name", c."transactionId", c."amountMinor", c."transactionTime", 'Paybill payment'
        FROM "mpesa_c2b_transactions" c LEFT JOIN "tenants" t ON t."id" = c."tenantId"
        WHERE c."collectedBy" = 'PLATFORM' AND c."paymentId" IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM "gateway_transactions" g WHERE g."paymentId" = c."paymentId")
        ORDER BY occurred_at DESC`
    ),
    check(
      {
        code: "PROVIDER_RECORD_MISSING",
        severity: "critical",
        title: "Tenant credited but no provider record",
        description:
          "A gateway transaction exists, but there is no completed M-Pesa callback or paybill confirmation behind its payment.",
      },
      Prisma.sql`
        SELECT g."id", g."tenantId" AS tenant_id, t."name" AS tenant_name, g."txnNumber" AS reference,
               g."grossMinor" AS amount, g."createdAt" AS occurred_at, g."channel"::text || ' ' || g."providerReference" AS detail
        FROM "gateway_transactions" g JOIN "tenants" t ON t."id" = g."tenantId"
        WHERE (g."channel" = 'MPESA_STK' AND NOT EXISTS (
                 SELECT 1 FROM "mpesa_stk_requests" s WHERE s."paymentId" = g."paymentId" AND s."status" = 'COMPLETED'))
           OR (g."channel" = 'MPESA_C2B' AND NOT EXISTS (
                 SELECT 1 FROM "mpesa_c2b_transactions" c WHERE c."paymentId" = g."paymentId"))
        ORDER BY g."createdAt" DESC`
    ),
    check(
      {
        code: "LEDGER_INCOMPLETE",
        severity: "critical",
        title: "Transaction missing its ledger entries",
        description: "A gateway transaction has no customer-payment credit, or has a fee but no fee debit.",
      },
      Prisma.sql`
        SELECT g."id", g."tenantId" AS tenant_id, t."name" AS tenant_name, g."txnNumber" AS reference,
               g."grossMinor" AS amount, g."createdAt" AS occurred_at,
               CASE WHEN NOT EXISTS (SELECT 1 FROM "tenant_ledger_entries" l
                                     WHERE l."gatewayTransactionId" = g."id" AND l."entryType" = 'CUSTOMER_PAYMENT')
                    THEN 'No customer-payment credit' ELSE 'No platform-fee debit' END AS detail
        FROM "gateway_transactions" g JOIN "tenants" t ON t."id" = g."tenantId"
        WHERE NOT EXISTS (SELECT 1 FROM "tenant_ledger_entries" l
                          WHERE l."gatewayTransactionId" = g."id" AND l."entryType" = 'CUSTOMER_PAYMENT')
           OR (g."feeMinor" > 0 AND NOT EXISTS (SELECT 1 FROM "tenant_ledger_entries" l
                          WHERE l."gatewayTransactionId" = g."id" AND l."entryType" = 'PLATFORM_FEE'))
        ORDER BY g."createdAt" DESC`
    ),
    check(
      {
        code: "REVERSED_PAYMENT_STILL_CREDITED",
        severity: "high",
        title: "Reversed payment still credited to tenant",
        description:
          "The billing payment was reversed, but the gateway transaction was never reversed — the tenant is still credited for money that went back.",
      },
      Prisma.sql`
        SELECT g."id", g."tenantId" AS tenant_id, t."name" AS tenant_name, g."txnNumber" AS reference,
               (g."grossMinor" - g."refundedMinor") AS amount, p."reversedAt" AS occurred_at,
               'Payment reversed: ' || COALESCE(p."reversalReason", 'no reason recorded') AS detail
        FROM "gateway_transactions" g
        JOIN "payments" p ON p."id" = g."paymentId"
        JOIN "tenants" t ON t."id" = g."tenantId"
        WHERE p."status" = 'REVERSED' AND g."status" IN ('COMPLETED', 'PARTIALLY_REFUNDED')
        ORDER BY p."reversedAt" DESC NULLS LAST`
    ),
    check(
      {
        code: "CREDIT_WITHOUT_PLATFORM_COLLECTION",
        severity: "high",
        title: "Ledger credit for money the platform never held",
        description:
          "A customer-payment credit with no gateway transaction behind it. Before this release, Paystack and Pesapal payments collected with the tenant's own keys were credited here in error; review each and correct with an adjustment.",
      },
      Prisma.sql`
        SELECT l."id", l."tenantId" AS tenant_id, t."name" AS tenant_name, p."reference" AS reference,
               l."amountMinor" AS amount, l."createdAt" AS occurred_at,
               COALESCE(p."method"::text, 'unknown method') || ' payment · ' || l."description" AS detail
        FROM "tenant_ledger_entries" l
        JOIN "tenants" t ON t."id" = l."tenantId"
        LEFT JOIN "payments" p ON l."sourceType" = 'Payment' AND p."id" = l."sourceId"
        WHERE l."entryType" = 'CUSTOMER_PAYMENT' AND l."gatewayTransactionId" IS NULL
        ORDER BY l."createdAt" DESC`
    ),
    check(
      {
        code: "UNMATCHED_PLATFORM_PAYBILL",
        severity: "high",
        title: "Platform paybill payment not assigned to a tenant",
        description: "Money arrived in the platform paybill with an account number that matched no payment reference.",
      },
      Prisma.sql`
        SELECT c."id", c."tenantId" AS tenant_id, t."name" AS tenant_name, c."transactionId" AS reference,
               c."amountMinor" AS amount, c."transactionTime" AS occurred_at,
               'Account number entered: ' || COALESCE(c."billRefNumber", '(none)') || ' · from ' || c."msisdn" AS detail
        FROM "mpesa_c2b_transactions" c LEFT JOIN "tenants" t ON t."id" = c."tenantId"
        WHERE c."collectedBy" = 'PLATFORM' AND c."reconciled" = false
        ORDER BY c."transactionTime" DESC`
    ),
    check(
      {
        code: "SETTLEMENT_LEDGER_MISMATCH",
        severity: "critical",
        title: "Settlement and ledger disagree",
        description:
          "A settlement's ledger entries don't match its state: a live or settled settlement must have a reservation debit and no reversal; a failed or cancelled one must have both or neither.",
      },
      Prisma.sql`
        WITH s AS (
          SELECT p.*, EXISTS (SELECT 1 FROM "tenant_ledger_entries" l WHERE l."settlementId" = p."id"
                                AND l."entryType" = 'SETTLEMENT') AS has_debit,
                      EXISTS (SELECT 1 FROM "tenant_ledger_entries" l WHERE l."settlementId" = p."id"
                                AND l."entryType" = 'SETTLEMENT_REVERSAL') AS has_reversal
          FROM "tenant_payouts" p
        )
        SELECT s."id", s."tenantId" AS tenant_id, t."name" AS tenant_name, s."settlementNumber" AS reference,
               s."amountMinor" AS amount, s."updatedAt" AS occurred_at,
               s."status"::text || ': reservation ' || CASE WHEN has_debit THEN 'present' ELSE 'missing' END
                 || ', reversal ' || CASE WHEN has_reversal THEN 'present' ELSE 'missing' END AS detail
        FROM s JOIN "tenants" t ON t."id" = s."tenantId"
        WHERE (s."status" IN ('REQUESTED', 'AWAITING_APPROVAL', 'PROCESSING', 'SETTLED') AND (NOT has_debit OR has_reversal))
           OR (s."status" IN ('FAILED', 'CANCELLED') AND has_debit <> has_reversal)
        ORDER BY s."updatedAt" DESC`
    ),
    check(
      {
        code: "SETTLEMENT_STUCK",
        severity: "high",
        title: "Settlement outcome unknown",
        description:
          "Processing for over 24 hours, timed out in the M-Pesa queue, or the provider call failed without a definite answer. Confirm with Safaricom, then resolve it as settled or failed.",
      },
      Prisma.sql`
        SELECT p."id", p."tenantId" AS tenant_id, t."name" AS tenant_name, p."settlementNumber" AS reference,
               p."amountMinor" AS amount, COALESCE(p."processingStartedAt", p."updatedAt") AS occurred_at,
               CASE WHEN p."timedOutAt" IS NOT NULL THEN 'M-Pesa queue timeout'
                    WHEN p."failureReason" IS NOT NULL THEN p."failureReason"
                    WHEN p."provider" = 'MANUAL' THEN 'Manual transfer not yet recorded'
                    ELSE 'No provider result for over 24 hours' END AS detail
        FROM "tenant_payouts" p JOIN "tenants" t ON t."id" = p."tenantId"
        WHERE p."status" = 'PROCESSING'
          AND (p."timedOutAt" IS NOT NULL OR p."failureReason" IS NOT NULL
               OR COALESCE(p."processingStartedAt", p."updatedAt") < now() - interval '24 hours')
        ORDER BY occurred_at ASC`
    ),
    check(
      {
        code: "SETTLEMENT_FAILED",
        severity: "medium",
        title: "Failed settlement not retried",
        description: "The balance has been restored to the tenant; retry once the cause is fixed.",
      },
      Prisma.sql`
        SELECT p."id", p."tenantId" AS tenant_id, t."name" AS tenant_name, p."settlementNumber" AS reference,
               p."amountMinor" AS amount, COALESCE(p."failedAt", p."updatedAt") AS occurred_at,
               COALESCE(p."failureReason", 'No reason recorded') AS detail
        FROM "tenant_payouts" p JOIN "tenants" t ON t."id" = p."tenantId"
        WHERE p."status" = 'FAILED' AND NOT EXISTS (SELECT 1 FROM "tenant_payouts" r WHERE r."retryOfId" = p."id")
        ORDER BY occurred_at DESC`
    ),
    check(
      {
        code: "REFUND_AWAITING_CUSTOMER_PAYOUT",
        severity: "medium",
        title: "Refund owed to a customer",
        description: "Recorded against the tenant, but the customer has not yet been paid back.",
      },
      Prisma.sql`
        SELECT r."id", r."tenantId" AS tenant_id, t."name" AS tenant_name, r."refundNumber" AS reference,
               r."amountMinor" AS amount, r."createdAt" AS occurred_at, r."kind"::text || ': ' || r."reason" AS detail
        FROM "gateway_refunds" r JOIN "tenants" t ON t."id" = r."tenantId"
        WHERE r."status" = 'PENDING_CUSTOMER_PAYOUT'
        ORDER BY r."createdAt" ASC`
    ),
    check(
      {
        code: "NEGATIVE_BALANCE",
        severity: "medium",
        title: "Tenant owes the platform",
        description: "A refund or reversal of money already settled has left the tenant's balance below zero.",
      },
      Prisma.sql`
        SELECT l."tenantId" AS id, l."tenantId" AS tenant_id, t."name" AS tenant_name, t."slug" AS reference,
               SUM(CASE WHEN l."direction" = 'CREDIT' THEN l."amountMinor"::bigint ELSE -l."amountMinor"::bigint END) AS amount,
               MAX(l."createdAt") AS occurred_at, 'Negative available balance' AS detail
        FROM "tenant_ledger_entries" l JOIN "tenants" t ON t."id" = l."tenantId"
        GROUP BY l."tenantId", t."name", t."slug"
        HAVING SUM(CASE WHEN l."direction" = 'CREDIT' THEN l."amountMinor"::bigint ELSE -l."amountMinor"::bigint END) < 0`
    ),
    check(
      {
        code: "PROVISIONAL_RECEIPT",
        severity: "low",
        title: "Awaiting Safaricom's receipt number",
        description:
          "Completed from a status query, which does not return a receipt. The real receipt replaces the provisional one when Safaricom's callback arrives.",
      },
      Prisma.sql`
        SELECT g."id", g."tenantId" AS tenant_id, t."name" AS tenant_name, g."txnNumber" AS reference,
               g."grossMinor" AS amount, g."createdAt" AS occurred_at, g."providerReference" AS detail
        FROM "gateway_transactions" g JOIN "tenants" t ON t."id" = g."tenantId"
        WHERE g."providerReference" LIKE 'PRV-%' AND g."createdAt" < now() - interval '1 hour'
        ORDER BY g."createdAt" DESC`
    ),
    check(
      {
        code: "REJECTED_CALLBACKS",
        severity: "medium",
        title: "Rejected callbacks",
        description: "Callbacks refused in this period (bad token, wrong shortcode, malformed). Repeated rejections can mean a misconfigured URL — or someone probing it.",
      },
      Prisma.sql`
        SELECT e."id", e."tenantId" AS tenant_id, t."name" AS tenant_name, e."externalId" AS reference,
               NULL::integer AS amount, e."receivedAt" AS occurred_at,
               e."eventType" || ': ' || COALESCE(e."errorMessage", 'rejected') AS detail
        FROM "payment_webhook_events" e LEFT JOIN "tenants" t ON t."id" = e."tenantId"
        WHERE e."status" = 'REJECTED' AND e."receivedAt" BETWEEN ${from} AND ${to}
        ORDER BY e."receivedAt" DESC`
    ),
    check(
      {
        code: "DUPLICATE_CALLBACKS",
        severity: "info",
        title: "Duplicate callbacks ignored",
        description: "Safaricom re-sent a callback that had already been processed. Each was ignored — no money was moved twice.",
      },
      Prisma.sql`
        SELECT e."id", e."tenantId" AS tenant_id, t."name" AS tenant_name, e."externalId" AS reference,
               NULL::integer AS amount, e."receivedAt" AS occurred_at, e."eventType" AS detail
        FROM "payment_webhook_events" e LEFT JOIN "tenants" t ON t."id" = e."tenantId"
        WHERE e."status" = 'DUPLICATE' AND e."receivedAt" BETWEEN ${from} AND ${to}
        ORDER BY e."receivedAt" DESC`
    ),
  ]);

  const [provider] = await prisma.$queryRaw<{ amount: bigint | null; n: bigint }[]>`
    SELECT SUM(amount)::bigint AS amount, COUNT(*) AS n FROM (
      SELECT s."amountMinor" AS amount FROM "mpesa_stk_requests" s
      WHERE s."collectedBy" = 'PLATFORM' AND s."status" = 'COMPLETED' AND s."updatedAt" BETWEEN ${from} AND ${to}
      UNION ALL
      SELECT c."amountMinor" FROM "mpesa_c2b_transactions" c
      WHERE c."collectedBy" = 'PLATFORM' AND c."transactionTime" BETWEEN ${from} AND ${to}
    ) x`;
  const [txns] = await prisma.$queryRaw<{ gross: bigint | null; n: bigint }[]>`
    SELECT SUM("grossMinor")::bigint AS gross, COUNT(*) AS n FROM "gateway_transactions"
    WHERE "createdAt" BETWEEN ${from} AND ${to}`;
  const [ledger] = await prisma.$queryRaw<{ credits: bigint | null; fees: bigint | null; fee_returns: bigint | null }[]>`
    SELECT SUM(CASE WHEN "entryType" = 'CUSTOMER_PAYMENT' THEN "amountMinor"::bigint ELSE 0 END) AS credits,
           SUM(CASE WHEN "entryType" = 'PLATFORM_FEE' THEN "amountMinor"::bigint ELSE 0 END) AS fees,
           SUM(CASE WHEN "entryType" = 'FEE_REVERSAL' THEN "amountMinor"::bigint ELSE 0 END) AS fee_returns
    FROM "tenant_ledger_entries" WHERE "createdAt" BETWEEN ${from} AND ${to}`;
  const [settle] = await prisma.$queryRaw<{ settled: bigint | null; pending: bigint | null }[]>`
    SELECT SUM(CASE WHEN "status" = 'SETTLED' AND "completedAt" BETWEEN ${from} AND ${to} THEN "amountMinor"::bigint ELSE 0 END) AS settled,
           SUM(CASE WHEN "status" IN ('REQUESTED', 'AWAITING_APPROVAL', 'PROCESSING') THEN "amountMinor"::bigint ELSE 0 END) AS pending
    FROM "tenant_payouts"`;
  const [owed] = await prisma.$queryRaw<{ owed: bigint | null }[]>`
    SELECT SUM(CASE WHEN "direction" = 'CREDIT' THEN "amountMinor"::bigint ELSE -"amountMinor"::bigint END) AS owed
    FROM "tenant_ledger_entries"`;

  const n = (v: bigint | null | undefined) => Number(v ?? 0n);
  return {
    generatedAt: new Date(),
    totals: {
      from,
      to,
      providerCollectedMinor: n(provider?.amount),
      providerCount: n(provider?.n),
      transactionsGrossMinor: n(txns?.gross),
      transactionsCount: n(txns?.n),
      ledgerCustomerCreditsMinor: n(ledger?.credits),
      platformFeesMinor: n(ledger?.fees) - n(ledger?.fee_returns),
      settledMinor: n(settle?.settled),
      pendingSettlementMinor: n(settle?.pending),
      totalOwedMinor: n(owed?.owed),
    },
    checks,
  };
}
