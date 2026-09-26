-- CreateEnum
CREATE TYPE "WinBackStatus" AS ENUM ('SENT', 'REDEEMED', 'EXPIRED', 'FAILED');

-- CreateTable
CREATE TABLE "win_back_offers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "owedMinor" INTEGER NOT NULL DEFAULT 0,
    "discountPercent" INTEGER NOT NULL,
    "status" "WinBackStatus" NOT NULL DEFAULT 'SENT',
    "message" TEXT NOT NULL,
    "sentByUserId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "paidMinor" INTEGER,
    "creditMinor" INTEGER,

    CONSTRAINT "win_back_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "win_back_offers_tenantId_sentAt_idx" ON "win_back_offers"("tenantId", "sentAt");

-- CreateIndex
CREATE INDEX "win_back_offers_status_expiresAt_idx" ON "win_back_offers"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "win_back_offers_customerId_sentAt_idx" ON "win_back_offers"("customerId", "sentAt");

-- AddForeignKey
ALTER TABLE "win_back_offers" ADD CONSTRAINT "win_back_offers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "win_back_offers" ADD CONSTRAINT "win_back_offers_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

