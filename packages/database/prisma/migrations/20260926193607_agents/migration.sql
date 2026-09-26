-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AgentSaleKind" AS ENUM ('VOUCHER', 'COLLECTION');

-- AlterTable
ALTER TABLE "hotspot_vouchers" ADD COLUMN     "agentId" TEXT;

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "location" TEXT,
    "voucherCommissionPercent" INTEGER NOT NULL DEFAULT 10,
    "collectionCommissionPercent" INTEGER NOT NULL DEFAULT 2,
    "status" "AgentStatus" NOT NULL DEFAULT 'ACTIVE',
    "inviteCode" TEXT,
    "inviteExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_sales" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "kind" "AgentSaleKind" NOT NULL,
    "voucherId" TEXT,
    "paymentId" TEXT,
    "customerId" TEXT,
    "description" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "commissionMinor" INTEGER NOT NULL,
    "buyerPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_remittances" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "recordedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_remittances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agents_userId_key" ON "agents"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "agents_inviteCode_key" ON "agents"("inviteCode");

-- CreateIndex
CREATE INDEX "agents_tenantId_idx" ON "agents"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_sales_voucherId_key" ON "agent_sales"("voucherId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_sales_paymentId_key" ON "agent_sales"("paymentId");

-- CreateIndex
CREATE INDEX "agent_sales_agentId_createdAt_idx" ON "agent_sales"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "agent_sales_tenantId_createdAt_idx" ON "agent_sales"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "agent_remittances_agentId_createdAt_idx" ON "agent_remittances"("agentId", "createdAt");

-- AddForeignKey
ALTER TABLE "hotspot_vouchers" ADD CONSTRAINT "hotspot_vouchers_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sales" ADD CONSTRAINT "agent_sales_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sales" ADD CONSTRAINT "agent_sales_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sales" ADD CONSTRAINT "agent_sales_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "hotspot_vouchers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_remittances" ADD CONSTRAINT "agent_remittances_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_remittances" ADD CONSTRAINT "agent_remittances_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

