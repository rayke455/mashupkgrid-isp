-- Aggregator settlement: collect into the platform paybill, owe the tenant, pay them out.
--
-- collectionMode defaults to OWN so every existing tenant is untouched: their own M-Pesa
-- credentials keep collecting directly and no ledger entry is ever created for them. Only a
-- tenant explicitly switched to PLATFORM has money collected on their behalf, and therefore a
-- balance owed.
CREATE TYPE "TenantCollectionMode" AS ENUM ('OWN', 'PLATFORM');
CREATE TYPE "TenantLedgerDirection" AS ENUM ('CREDIT', 'DEBIT');
CREATE TYPE "TenantPayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

ALTER TABLE "tenants"
  ADD COLUMN "collectionMode" "TenantCollectionMode" NOT NULL DEFAULT 'OWN',
  ADD COLUMN "payoutShortcode" TEXT,
  ADD COLUMN "payoutShortcodeType" TEXT NOT NULL DEFAULT 'PAYBILL';

ALTER TABLE "platform_mpesa_config"
  ADD COLUMN "initiatorName" TEXT,
  ADD COLUMN "initiatorCredentialEncrypted" TEXT;

CREATE TABLE "tenant_ledger_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "direction" "TenantLedgerDirection" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "description" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tenant_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- The idempotency guarantee: a replayed gateway callback reaching the same payment twice cannot
-- credit the tenant twice, because the second insert violates this.
CREATE UNIQUE INDEX "tenant_ledger_entries_sourceType_sourceId_key"
  ON "tenant_ledger_entries"("sourceType", "sourceId");
CREATE INDEX "tenant_ledger_entries_tenantId_createdAt_idx"
  ON "tenant_ledger_entries"("tenantId", "createdAt");

CREATE TABLE "tenant_payouts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "destinationShortcode" TEXT NOT NULL,
    "destinationType" TEXT NOT NULL,
    "status" "TenantPayoutStatus" NOT NULL DEFAULT 'PENDING',
    "conversationId" TEXT,
    "originatorConversationId" TEXT,
    "transactionId" TEXT,
    "resultCode" INTEGER,
    "resultDesc" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "tenant_payouts_pkey" PRIMARY KEY ("id")
);

-- Daraja echoes OriginatorConversationID back on the result callback; unique so that callback
-- resolves to exactly one payout and a duplicate delivery cannot settle it twice.
CREATE UNIQUE INDEX "tenant_payouts_originatorConversationId_key"
  ON "tenant_payouts"("originatorConversationId");
CREATE INDEX "tenant_payouts_tenantId_createdAt_idx" ON "tenant_payouts"("tenantId", "createdAt");

ALTER TABLE "tenant_ledger_entries" ADD CONSTRAINT "tenant_ledger_entries_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenant_payouts" ADD CONSTRAINT "tenant_payouts_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
