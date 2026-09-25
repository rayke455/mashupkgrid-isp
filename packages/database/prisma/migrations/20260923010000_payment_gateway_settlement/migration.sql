-- MashupHost Payment Gateway & Settlement
-- See the header comment in schema.prisma for the money flow this schema models.

-- ==== Enums ====
-- CreateEnum
CREATE TYPE "TenantLedgerEntryType" AS ENUM ('CUSTOMER_PAYMENT', 'PLATFORM_FEE', 'SETTLEMENT', 'SETTLEMENT_REVERSAL', 'PAYMENT_REVERSAL', 'FEE_REVERSAL', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('REQUESTED', 'AWAITING_APPROVAL', 'PROCESSING', 'SETTLED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SettlementProviderKind" AS ENUM ('MPESA_B2B', 'MPESA_B2C', 'MANUAL', 'SANDBOX');

-- CreateEnum
CREATE TYPE "SettlementTrigger" AS ENUM ('AUTOMATIC', 'TENANT_REQUEST', 'ADMIN');

-- CreateEnum
CREATE TYPE "SettlementMode" AS ENUM ('AUTOMATIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "SettlementFrequency" AS ENUM ('INSTANT', 'DAILY', 'WEEKLY', 'MANUAL');

-- CreateEnum
CREATE TYPE "SettlementDestinationType" AS ENUM ('MPESA_PHONE', 'BANK_ACCOUNT', 'TILL', 'PAYBILL');

-- CreateEnum
CREATE TYPE "DestinationVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentEnvironment" AS ENUM ('SANDBOX', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "GatewayChannel" AS ENUM ('MPESA_STK', 'MPESA_C2B');

-- CreateEnum
CREATE TYPE "GatewayTransactionStatus" AS ENUM ('COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'REVERSED');

-- CreateEnum
CREATE TYPE "TransactionSettlementStatus" AS ENUM ('UNSETTLED', 'SETTLEMENT_PENDING', 'SETTLED');

-- CreateEnum
CREATE TYPE "PaymentReferencePurpose" AS ENUM ('CUSTOMER_ACCOUNT', 'INVOICE');

-- CreateEnum
CREATE TYPE "GatewayRefundKind" AS ENUM ('REFUND', 'REVERSAL');

-- CreateEnum
CREATE TYPE "GatewayRefundStatus" AS ENUM ('PENDING_CUSTOMER_PAYOUT', 'COMPLETED');

-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'DUPLICATE', 'IGNORED', 'REJECTED', 'FAILED');


-- ============================================================================================
-- Existing tables, altered in place (no data loss)
-- ============================================================================================

-- Tenant-owned financial rows now RESTRICT deletion instead of cascading it: a tenant with money
-- history cannot be hard-deleted out from under its ledger (tenants are soft-deleted anyway).
ALTER TABLE "tenant_ledger_entries" DROP CONSTRAINT "tenant_ledger_entries_tenantId_fkey";
ALTER TABLE "tenant_payouts" DROP CONSTRAINT "tenant_payouts_tenantId_fkey";

-- Platform-paybill C2B payments can arrive before they are attributed to a tenant.
ALTER TABLE "mpesa_c2b_transactions" ADD COLUMN "assignedByUserId" TEXT,
ADD COLUMN "collectedBy" "TenantCollectionMode" NOT NULL DEFAULT 'OWN',
ALTER COLUMN "tenantId" DROP NOT NULL;

ALTER TABLE "mpesa_stk_requests" ADD COLUMN "collectedBy" "TenantCollectionMode" NOT NULL DEFAULT 'OWN',
ADD COLUMN "paymentReferenceId" TEXT;

ALTER TABLE "platform_mpesa_config" ADD COLUMN "b2cInitiatorCredentialEncrypted" TEXT,
ADD COLUMN "b2cInitiatorName" TEXT,
ADD COLUMN "b2cShortcode" TEXT;

ALTER TABLE "tenants" ADD COLUMN "feeFixedMinorOverride" INTEGER,
ADD COLUMN "feePercentBpsOverride" INTEGER;

-- Ledger: entryType is backfilled below, then made NOT NULL without a default.
ALTER TABLE "tenant_ledger_entries" ADD COLUMN "createdByUserId" TEXT,
ADD COLUMN "entryType" "TenantLedgerEntryType",
ADD COLUMN "gatewayTransactionId" TEXT,
ADD COLUMN "settlementId" TEXT;

-- Payouts become settlements. The status column is CONVERTED, not dropped and re-added, so no
-- existing payout loses its state: PENDING → REQUESTED, COMPLETED → SETTLED.
ALTER TABLE "tenant_payouts" ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "approvedByUserId" TEXT,
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "destinationId" TEXT,
ADD COLUMN "destinationSnapshot" JSONB,
ADD COLUMN "environment" "PaymentEnvironment" NOT NULL DEFAULT 'PRODUCTION',
ADD COLUMN "failedAt" TIMESTAMP(3),
ADD COLUMN "notes" TEXT,
ADD COLUMN "processingStartedAt" TIMESTAMP(3),
ADD COLUMN "provider" "SettlementProviderKind" NOT NULL DEFAULT 'MPESA_B2B',
ADD COLUMN "providerConfirmedAt" TIMESTAMP(3),
ADD COLUMN "requestedByUserId" TEXT,
ADD COLUMN "resolvedByUserId" TEXT,
ADD COLUMN "retryOfId" TEXT,
ADD COLUMN "settlementNumber" TEXT,
ADD COLUMN "timedOutAt" TIMESTAMP(3),
ADD COLUMN "trigger" "SettlementTrigger" NOT NULL DEFAULT 'AUTOMATIC',
ALTER COLUMN "destinationShortcode" DROP NOT NULL;

ALTER TABLE "tenant_payouts" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "tenant_payouts" ALTER COLUMN "status" TYPE "SettlementStatus" USING (
  CASE "status"::text
    WHEN 'PENDING' THEN 'REQUESTED'
    WHEN 'COMPLETED' THEN 'SETTLED'
    ELSE "status"::text
  END
)::"SettlementStatus";
ALTER TABLE "tenant_payouts" ALTER COLUMN "status" SET DEFAULT 'REQUESTED';
DROP TYPE "TenantPayoutStatus";

-- ==== New tables and indexes ====
-- CreateTable
CREATE TABLE "settlement_destinations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "SettlementDestinationType" NOT NULL,
    "accountName" TEXT NOT NULL,
    "phone" TEXT,
    "bankName" TEXT,
    "bankBranch" TEXT,
    "bankAccountNumberEncrypted" TEXT,
    "bankAccountLast4" TEXT,
    "tillNumber" TEXT,
    "paybillNumber" TEXT,
    "paybillAccountReference" TEXT,
    "verificationStatus" "DestinationVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlement_destinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gateway_transactions" (
    "id" TEXT NOT NULL,
    "txnNumber" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "customerId" TEXT,
    "invoiceId" TEXT,
    "paymentReferenceId" TEXT,
    "channel" "GatewayChannel" NOT NULL,
    "providerReference" TEXT NOT NULL,
    "providerRequestId" TEXT,
    "payerPhone" TEXT,
    "environment" "PaymentEnvironment" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "grossMinor" INTEGER NOT NULL,
    "feeMinor" INTEGER NOT NULL,
    "netMinor" INTEGER NOT NULL,
    "feePercentBps" INTEGER NOT NULL,
    "feeFixedMinor" INTEGER NOT NULL,
    "refundedMinor" INTEGER NOT NULL DEFAULT 0,
    "status" "GatewayTransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "settlementStatus" "TransactionSettlementStatus" NOT NULL DEFAULT 'UNSETTLED',
    "settlementId" TEXT,
    "description" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gateway_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_references" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT,
    "invoiceId" TEXT,
    "purpose" "PaymentReferencePurpose" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gateway_refunds" (
    "id" TEXT NOT NULL,
    "refundNumber" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "gatewayTransactionId" TEXT NOT NULL,
    "kind" "GatewayRefundKind" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "feeReturnedMinor" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "GatewayRefundStatus" NOT NULL,
    "externalReference" TEXT,
    "createdByUserId" TEXT,
    "completedByUserId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gateway_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "externalId" TEXT,
    "tenantId" TEXT,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "transactionReference" TEXT,
    "payload" JSONB NOT NULL,
    "response" JSONB,
    "errorMessage" TEXT,
    "sourceIp" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settlement_settings" (
    "id" TEXT NOT NULL DEFAULT 'platform',
    "gatewayEnabled" BOOLEAN NOT NULL DEFAULT false,
    "feePercentBps" INTEGER NOT NULL DEFAULT 0,
    "feeFixedMinor" INTEGER NOT NULL DEFAULT 0,
    "settlementMode" "SettlementMode" NOT NULL DEFAULT 'AUTOMATIC',
    "settlementFrequency" "SettlementFrequency" NOT NULL DEFAULT 'DAILY',
    "settlementMinimumMinor" INTEGER NOT NULL DEFAULT 100,
    "settlementHourEat" INTEGER NOT NULL DEFAULT 9,
    "settlementWeekday" INTEGER NOT NULL DEFAULT 1,
    "lastScheduledRunAt" TIMESTAMP(3),
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settlement_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "settlement_destinations_tenantId_isActive_idx" ON "settlement_destinations"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_transactions_txnNumber_key" ON "gateway_transactions"("txnNumber");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_transactions_paymentId_key" ON "gateway_transactions"("paymentId");

-- CreateIndex
CREATE INDEX "gateway_transactions_tenantId_createdAt_idx" ON "gateway_transactions"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "gateway_transactions_tenantId_status_idx" ON "gateway_transactions"("tenantId", "status");

-- CreateIndex
CREATE INDEX "gateway_transactions_settlementId_idx" ON "gateway_transactions"("settlementId");

-- CreateIndex
CREATE INDEX "gateway_transactions_customerId_idx" ON "gateway_transactions"("customerId");

-- CreateIndex
CREATE INDEX "gateway_transactions_createdAt_idx" ON "gateway_transactions"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_transactions_channel_providerReference_key" ON "gateway_transactions"("channel", "providerReference");

-- CreateIndex
CREATE UNIQUE INDEX "payment_references_reference_key" ON "payment_references"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "payment_references_invoiceId_key" ON "payment_references"("invoiceId");

-- CreateIndex
CREATE INDEX "payment_references_tenantId_idx" ON "payment_references"("tenantId");

-- CreateIndex
CREATE INDEX "payment_references_customerId_idx" ON "payment_references"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_refunds_refundNumber_key" ON "gateway_refunds"("refundNumber");

-- CreateIndex
CREATE INDEX "gateway_refunds_gatewayTransactionId_idx" ON "gateway_refunds"("gatewayTransactionId");

-- CreateIndex
CREATE INDEX "gateway_refunds_tenantId_createdAt_idx" ON "gateway_refunds"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "payment_webhook_events_provider_eventType_externalId_idx" ON "payment_webhook_events"("provider", "eventType", "externalId");

-- CreateIndex
CREATE INDEX "payment_webhook_events_receivedAt_idx" ON "payment_webhook_events"("receivedAt");

-- CreateIndex
CREATE INDEX "payment_webhook_events_status_receivedAt_idx" ON "payment_webhook_events"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "payment_webhook_events_tenantId_receivedAt_idx" ON "payment_webhook_events"("tenantId", "receivedAt");

-- CreateIndex
CREATE INDEX "tenant_ledger_entries_gatewayTransactionId_idx" ON "tenant_ledger_entries"("gatewayTransactionId");

-- CreateIndex
CREATE INDEX "tenant_ledger_entries_settlementId_idx" ON "tenant_ledger_entries"("settlementId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_payouts_settlementNumber_key" ON "tenant_payouts"("settlementNumber");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_payouts_retryOfId_key" ON "tenant_payouts"("retryOfId");

-- CreateIndex
CREATE INDEX "tenant_payouts_status_createdAt_idx" ON "tenant_payouts"("status", "createdAt");

-- ==== Foreign keys ====
-- AddForeignKey
ALTER TABLE "tenant_ledger_entries" ADD CONSTRAINT "tenant_ledger_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_ledger_entries" ADD CONSTRAINT "tenant_ledger_entries_gatewayTransactionId_fkey" FOREIGN KEY ("gatewayTransactionId") REFERENCES "gateway_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_ledger_entries" ADD CONSTRAINT "tenant_ledger_entries_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "tenant_payouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_payouts" ADD CONSTRAINT "tenant_payouts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_payouts" ADD CONSTRAINT "tenant_payouts_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "settlement_destinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_payouts" ADD CONSTRAINT "tenant_payouts_retryOfId_fkey" FOREIGN KEY ("retryOfId") REFERENCES "tenant_payouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_destinations" ADD CONSTRAINT "settlement_destinations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateway_transactions" ADD CONSTRAINT "gateway_transactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateway_transactions" ADD CONSTRAINT "gateway_transactions_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateway_transactions" ADD CONSTRAINT "gateway_transactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateway_transactions" ADD CONSTRAINT "gateway_transactions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateway_transactions" ADD CONSTRAINT "gateway_transactions_paymentReferenceId_fkey" FOREIGN KEY ("paymentReferenceId") REFERENCES "payment_references"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateway_transactions" ADD CONSTRAINT "gateway_transactions_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "tenant_payouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_references" ADD CONSTRAINT "payment_references_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_references" ADD CONSTRAINT "payment_references_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_references" ADD CONSTRAINT "payment_references_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateway_refunds" ADD CONSTRAINT "gateway_refunds_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateway_refunds" ADD CONSTRAINT "gateway_refunds_gatewayTransactionId_fkey" FOREIGN KEY ("gatewayTransactionId") REFERENCES "gateway_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mpesa_stk_requests" ADD CONSTRAINT "mpesa_stk_requests_paymentReferenceId_fkey" FOREIGN KEY ("paymentReferenceId") REFERENCES "payment_references"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ============================================================================================
-- Human-readable, collision-free numbers. Sequences, not "count + 1": two concurrent inserts can
-- never be handed the same number.
-- ============================================================================================
CREATE SEQUENCE "gateway_txn_number_seq";
CREATE SEQUENCE "settlement_number_seq";
CREATE SEQUENCE "gateway_refund_number_seq";

-- ============================================================================================
-- Backfill existing data
-- ============================================================================================

-- Platform settings: preserve today's behaviour exactly. The gateway is on if any tenant is
-- already collected by the platform; fees start at zero (a super admin sets them); the old hourly
-- automatic payout becomes AUTOMATIC + INSTANT; the old payout floor carries over.
INSERT INTO "platform_settlement_settings"
  ("id", "gatewayEnabled", "feePercentBps", "feeFixedMinor", "settlementMode", "settlementFrequency",
   "settlementMinimumMinor", "updatedAt")
SELECT
  'platform',
  EXISTS (SELECT 1 FROM "tenants" WHERE "collectionMode" = 'PLATFORM' AND "deletedAt" IS NULL),
  0,
  0,
  'AUTOMATIC',
  'INSTANT',
  GREATEST(COALESCE((SELECT "payoutMinimumMinor" FROM "platform_mpesa_config" ORDER BY "createdAt" LIMIT 1), 100), 100),
  CURRENT_TIMESTAMP;

-- Ledger entry types from the existing source types.
UPDATE "tenant_ledger_entries" SET
  "entryType" = (CASE "sourceType"
    WHEN 'Payment' THEN 'CUSTOMER_PAYMENT'
    WHEN 'TenantPayout' THEN 'SETTLEMENT'
    ELSE 'ADJUSTMENT'
  END)::"TenantLedgerEntryType",
  "settlementId" = CASE WHEN "sourceType" = 'TenantPayout' THEN "sourceId" END;
ALTER TABLE "tenant_ledger_entries" ALTER COLUMN "entryType" SET NOT NULL;

-- STK pushes that were actually collected by the platform: exactly those whose payment was
-- credited to a tenant's ledger, plus any still pending for a tenant on PLATFORM right now.
UPDATE "mpesa_stk_requests" SET "collectedBy" = 'PLATFORM'
WHERE "paymentId" IN (SELECT "sourceId" FROM "tenant_ledger_entries" WHERE "sourceType" = 'Payment')
   OR ("status" = 'PENDING' AND "tenantId" IN (SELECT "id" FROM "tenants" WHERE "collectionMode" = 'PLATFORM'));

-- Each tenant's existing payout paybill/till becomes their first settlement destination. It is
-- VERIFIED if a payout to it has already been confirmed.
INSERT INTO "settlement_destinations"
  ("id", "tenantId", "type", "accountName", "tillNumber", "paybillNumber", "paybillAccountReference",
   "verificationStatus", "verifiedAt", "isActive", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  t."id",
  (CASE WHEN t."payoutShortcodeType" = 'TILL' THEN 'TILL' ELSE 'PAYBILL' END)::"SettlementDestinationType",
  t."name",
  CASE WHEN t."payoutShortcodeType" = 'TILL' THEN t."payoutShortcode" END,
  CASE WHEN t."payoutShortcodeType" = 'TILL' THEN NULL ELSE t."payoutShortcode" END,
  CASE WHEN t."payoutShortcodeType" = 'TILL' THEN NULL ELSE t."slug" END,
  (CASE WHEN EXISTS (
      SELECT 1 FROM "tenant_payouts" p
      WHERE p."tenantId" = t."id" AND p."destinationShortcode" = t."payoutShortcode" AND p."status" = 'SETTLED'
    ) THEN 'VERIFIED' ELSE 'UNVERIFIED' END)::"DestinationVerificationStatus",
  (SELECT MAX(p."completedAt") FROM "tenant_payouts" p
    WHERE p."tenantId" = t."id" AND p."destinationShortcode" = t."payoutShortcode" AND p."status" = 'SETTLED'),
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "tenants" t
WHERE t."payoutShortcode" IS NOT NULL AND btrim(t."payoutShortcode") <> '';

-- Existing payouts: number, environment, destination link, and snapshot.
UPDATE "tenant_payouts" SET
  "settlementNumber" = 'STL-' || to_char("createdAt", 'YYYYMMDD') || '-' || lpad(nextval('settlement_number_seq')::text, 6, '0'),
  "environment" = (CASE WHEN (SELECT "environment" FROM "platform_mpesa_config" ORDER BY "createdAt" LIMIT 1) = 'production'
    THEN 'PRODUCTION' ELSE 'SANDBOX' END)::"PaymentEnvironment",
  "provider" = 'MPESA_B2B',
  "destinationSnapshot" = jsonb_build_object('type', "destinationType", 'number', "destinationShortcode"),
  "failedAt" = CASE WHEN "status" = 'FAILED' THEN "updatedAt" END;
UPDATE "tenant_payouts" p SET "destinationId" = d."id"
FROM "settlement_destinations" d
WHERE d."tenantId" = p."tenantId" AND COALESCE(d."paybillNumber", d."tillNumber") = p."destinationShortcode";
-- A payout left PENDING (REQUESTED) by the old code means the process stopped between reserving
-- the balance and calling Daraja — outcome unknown. Surface it for review rather than resend it.
UPDATE "tenant_payouts" SET
  "status" = 'PROCESSING',
  "notes" = 'Migrated from a PENDING payout whose Daraja call never completed — verify with Safaricom before resolving.'
WHERE "status" = 'REQUESTED';
ALTER TABLE "tenant_payouts" ALTER COLUMN "settlementNumber" SET NOT NULL;

-- Genuine platform STK collections credited before this migration get a gateway transaction
-- record (fee 0 — no fee existed then). Paystack/Pesapal credits are deliberately NOT given one:
-- those were collected with the tenant's own keys, so the platform never held that money. The
-- reconciliation report lists them for review instead of silently legitimising them.
INSERT INTO "gateway_transactions"
  ("id", "txnNumber", "tenantId", "paymentId", "customerId", "invoiceId", "channel", "providerReference",
   "providerRequestId", "payerPhone", "environment", "currency", "grossMinor", "feeMinor", "netMinor",
   "feePercentBps", "feeFixedMinor", "status", "settlementStatus", "description", "completedAt",
   "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  'TXN-' || to_char(p."createdAt", 'YYYYMMDD') || '-' || lpad(nextval('gateway_txn_number_seq')::text, 6, '0'),
  p."tenantId",
  p."id",
  p."customerId",
  p."invoiceId",
  'MPESA_STK',
  COALESCE(s."mpesaReceiptNumber", p."reference", p."id"),
  s."checkoutRequestId",
  s."phone",
  (CASE WHEN (SELECT "environment" FROM "platform_mpesa_config" ORDER BY "createdAt" LIMIT 1) = 'production'
    THEN 'PRODUCTION' ELSE 'SANDBOX' END)::"PaymentEnvironment",
  p."currency",
  l."amountMinor",
  0,
  l."amountMinor",
  0,
  0,
  'COMPLETED',
  'UNSETTLED',
  'Platform collection recorded before the fee engine (' || l."description" || ')',
  p."createdAt",
  p."createdAt",
  CURRENT_TIMESTAMP
FROM "payments" p
JOIN "tenant_ledger_entries" l ON l."sourceType" = 'Payment' AND l."sourceId" = p."id"
JOIN "mpesa_stk_requests" s ON s."paymentId" = p."id";

UPDATE "tenant_ledger_entries" l SET "gatewayTransactionId" = g."id"
FROM "gateway_transactions" g
WHERE l."sourceType" = 'Payment' AND l."sourceId" = g."paymentId";

-- Mark legacy transactions SETTLED first-in-first-out against what has actually been paid out.
-- The old system tracked balances, not which payment each payout covered, so this attribution is
-- an approximation — it never affects balances, which come from the ledger alone.
WITH paid AS (
  SELECT "tenantId", COALESCE(SUM("amountMinor"), 0) AS total
  FROM "tenant_payouts" WHERE "status" = 'SETTLED' GROUP BY "tenantId"
), running AS (
  SELECT g."id", g."tenantId",
         SUM(g."netMinor") OVER (PARTITION BY g."tenantId" ORDER BY g."createdAt", g."id") AS cumulative
  FROM "gateway_transactions" g
)
UPDATE "gateway_transactions" g SET "settlementStatus" = 'SETTLED'
FROM running r JOIN paid ON paid."tenantId" = r."tenantId"
WHERE g."id" = r."id" AND r.cumulative <= paid.total;

-- ============================================================================================
-- Integrity rules the application relies on — enforced by the database, not just by code
-- ============================================================================================

ALTER TABLE "tenant_ledger_entries"
  ADD CONSTRAINT "tenant_ledger_entries_amount_positive" CHECK ("amountMinor" > 0);

ALTER TABLE "gateway_transactions"
  ADD CONSTRAINT "gateway_transactions_gross_positive" CHECK ("grossMinor" > 0),
  ADD CONSTRAINT "gateway_transactions_fee_nonnegative" CHECK ("feeMinor" >= 0),
  ADD CONSTRAINT "gateway_transactions_net_nonnegative" CHECK ("netMinor" >= 0),
  ADD CONSTRAINT "gateway_transactions_net_is_gross_minus_fee" CHECK ("grossMinor" = "feeMinor" + "netMinor"),
  ADD CONSTRAINT "gateway_transactions_refund_bounds" CHECK ("refundedMinor" >= 0 AND "refundedMinor" <= "grossMinor"),
  ADD CONSTRAINT "gateway_transactions_fee_rule_bounds" CHECK ("feePercentBps" BETWEEN 0 AND 10000 AND "feeFixedMinor" >= 0);

ALTER TABLE "tenant_payouts"
  ADD CONSTRAINT "tenant_payouts_amount_positive" CHECK ("amountMinor" > 0),
  ADD CONSTRAINT "tenant_payouts_not_own_retry" CHECK ("retryOfId" IS NULL OR "retryOfId" <> "id");

ALTER TABLE "gateway_refunds"
  ADD CONSTRAINT "gateway_refunds_amount_positive" CHECK ("amountMinor" > 0),
  ADD CONSTRAINT "gateway_refunds_fee_bounds" CHECK ("feeReturnedMinor" >= 0 AND "feeReturnedMinor" <= "amountMinor");

ALTER TABLE "platform_settlement_settings"
  ADD CONSTRAINT "platform_settlement_settings_singleton" CHECK ("id" = 'platform'),
  ADD CONSTRAINT "platform_settlement_settings_fee_bounds" CHECK ("feePercentBps" BETWEEN 0 AND 10000 AND "feeFixedMinor" >= 0),
  ADD CONSTRAINT "platform_settlement_settings_minimum" CHECK ("settlementMinimumMinor" >= 100),
  ADD CONSTRAINT "platform_settlement_settings_schedule" CHECK ("settlementHourEat" BETWEEN 0 AND 23 AND "settlementWeekday" BETWEEN 1 AND 7);

ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_fee_override_bounds" CHECK (
    ("feePercentBpsOverride" IS NULL OR "feePercentBpsOverride" BETWEEN 0 AND 10000)
    AND ("feeFixedMinorOverride" IS NULL OR "feeFixedMinorOverride" >= 0)
  );

ALTER TABLE "settlement_destinations"
  ADD CONSTRAINT "settlement_destinations_required_fields" CHECK (
    ("type" <> 'MPESA_PHONE' OR "phone" IS NOT NULL)
    AND ("type" <> 'BANK_ACCOUNT' OR ("bankName" IS NOT NULL AND "bankAccountNumberEncrypted" IS NOT NULL))
    AND ("type" <> 'TILL' OR "tillNumber" IS NOT NULL)
    AND ("type" <> 'PAYBILL' OR "paybillNumber" IS NOT NULL)
  );

-- At most one active destination per tenant.
CREATE UNIQUE INDEX "settlement_destinations_one_active_per_tenant"
  ON "settlement_destinations"("tenantId") WHERE "isActive";

-- At most one settlement per tenant waiting to be dispatched. Together with the row lock taken
-- when a settlement is created, this is what makes a duplicate settlement impossible.
CREATE UNIQUE INDEX "tenant_payouts_one_queued_per_tenant"
  ON "tenant_payouts"("tenantId") WHERE "status" IN ('REQUESTED', 'AWAITING_APPROVAL');

-- One standing account reference per customer.
CREATE UNIQUE INDEX "payment_references_one_account_per_customer"
  ON "payment_references"("customerId") WHERE "purpose" = 'CUSTOMER_ACCOUNT';

-- A transaction can be reversed once.
CREATE UNIQUE INDEX "gateway_refunds_one_reversal_per_transaction"
  ON "gateway_refunds"("gatewayTransactionId") WHERE "kind" = 'REVERSAL';

-- ============================================================================================
-- Immutability
-- ============================================================================================

CREATE OR REPLACE FUNCTION "mh_reject_financial_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed. Record a correcting entry instead.', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "tenant_ledger_entries_append_only"
  BEFORE UPDATE OR DELETE ON "tenant_ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION "mh_reject_financial_mutation"();

CREATE OR REPLACE FUNCTION "mh_guard_gateway_transaction"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'gateway_transactions rows cannot be deleted' USING ERRCODE = 'P0001';
  END IF;
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
     OR NEW."paymentId" IS DISTINCT FROM OLD."paymentId"
     OR NEW."txnNumber" IS DISTINCT FROM OLD."txnNumber"
     OR NEW."channel" IS DISTINCT FROM OLD."channel"
     OR NEW."environment" IS DISTINCT FROM OLD."environment"
     OR NEW."currency" IS DISTINCT FROM OLD."currency"
     OR NEW."grossMinor" IS DISTINCT FROM OLD."grossMinor"
     OR NEW."feeMinor" IS DISTINCT FROM OLD."feeMinor"
     OR NEW."netMinor" IS DISTINCT FROM OLD."netMinor"
     OR NEW."feePercentBps" IS DISTINCT FROM OLD."feePercentBps"
     OR NEW."feeFixedMinor" IS DISTINCT FROM OLD."feeFixedMinor" THEN
    RAISE EXCEPTION 'gateway_transactions amounts and ownership are immutable' USING ERRCODE = 'P0001';
  END IF;
  IF NEW."refundedMinor" < OLD."refundedMinor" THEN
    RAISE EXCEPTION 'gateway_transactions.refundedMinor can only increase' USING ERRCODE = 'P0001';
  END IF;
  IF NEW."providerReference" IS DISTINCT FROM OLD."providerReference" AND OLD."providerReference" NOT LIKE 'PRV-%' THEN
    RAISE EXCEPTION 'providerReference can only replace a provisional (PRV-) receipt' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "gateway_transactions_guard"
  BEFORE UPDATE OR DELETE ON "gateway_transactions"
  FOR EACH ROW EXECUTE FUNCTION "mh_guard_gateway_transaction"();

CREATE OR REPLACE FUNCTION "mh_guard_settlement"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'tenant_payouts rows cannot be deleted' USING ERRCODE = 'P0001';
  END IF;
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
     OR NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor"
     OR NEW."settlementNumber" IS DISTINCT FROM OLD."settlementNumber" THEN
    RAISE EXCEPTION 'A settlement''s tenant, amount and number are immutable' USING ERRCODE = 'P0001';
  END IF;
  IF OLD."status" IN ('SETTLED', 'FAILED', 'CANCELLED') AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    RAISE EXCEPTION 'Settlement % is % — a final state cannot change', OLD."settlementNumber", OLD."status"
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "tenant_payouts_guard"
  BEFORE UPDATE OR DELETE ON "tenant_payouts"
  FOR EACH ROW EXECUTE FUNCTION "mh_guard_settlement"();

CREATE OR REPLACE FUNCTION "mh_guard_gateway_refund"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'gateway_refunds rows cannot be deleted' USING ERRCODE = 'P0001';
  END IF;
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
     OR NEW."gatewayTransactionId" IS DISTINCT FROM OLD."gatewayTransactionId"
     OR NEW."kind" IS DISTINCT FROM OLD."kind"
     OR NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor"
     OR NEW."feeReturnedMinor" IS DISTINCT FROM OLD."feeReturnedMinor" THEN
    RAISE EXCEPTION 'A refund''s amounts and transaction are immutable' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "gateway_refunds_guard"
  BEFORE UPDATE OR DELETE ON "gateway_refunds"
  FOR EACH ROW EXECUTE FUNCTION "mh_guard_gateway_refund"();

-- ============================================================================================
-- Permissions (mirrors packages/shared/src/permissions.ts for databases already seeded)
-- ============================================================================================

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid()::text, 'platform_payments.read', 'View platform-wide payment collections, settlements, webhooks and reconciliation'),
  (gen_random_uuid()::text, 'platform_payments.manage', 'Configure the platform payment gateway, fees and settlement policy'),
  (gen_random_uuid()::text, 'settlements.approve', 'Approve, retry, cancel and resolve tenant settlements'),
  (gen_random_uuid()::text, 'settlements.request', 'Request a settlement of the tenant''s available balance'),
  (gen_random_uuid()::text, 'settlement_destinations.manage', 'Change where the tenant''s settlements are sent')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "roles" r JOIN "permissions" p ON p."key" IN (
  'platform_payments.read', 'platform_payments.manage', 'settlements.approve', 'settlements.request', 'settlement_destinations.manage'
)
WHERE r."name" = 'SUPER_ADMIN' AND r."tenantId" IS NULL AND r."isSystem"
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "roles" r JOIN "permissions" p ON p."key" IN ('settlements.request', 'settlement_destinations.manage')
WHERE r."name" IN ('ISP_OWNER', 'ADMIN') AND r."tenantId" IS NULL AND r."isSystem"
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "roles" r JOIN "permissions" p ON p."key" = 'settlements.request'
WHERE r."name" = 'FINANCE_MANAGER' AND r."tenantId" IS NULL AND r."isSystem"
ON CONFLICT DO NOTHING;
