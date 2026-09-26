-- CreateEnum
CREATE TYPE "UpgradeSuggestionStatus" AS ENUM ('PENDING', 'APPLIED', 'DISMISSED');

-- CreateTable
CREATE TABLE "upgrade_suggestions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerServiceId" TEXT NOT NULL,
    "fromPackageId" TEXT NOT NULL,
    "fromPackageName" TEXT NOT NULL,
    "toPackageId" TEXT NOT NULL,
    "toPackageName" TEXT NOT NULL,
    "toPriceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "usedMb" INTEGER NOT NULL,
    "capMb" INTEGER NOT NULL,
    "status" "UpgradeSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "smsSentAt" TIMESTAMP(3),
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upgrade_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "upgrade_suggestions_tenantId_status_idx" ON "upgrade_suggestions"("tenantId", "status");

-- CreateIndex
CREATE INDEX "upgrade_suggestions_customerServiceId_createdAt_idx" ON "upgrade_suggestions"("customerServiceId", "createdAt");

-- AddForeignKey
ALTER TABLE "upgrade_suggestions" ADD CONSTRAINT "upgrade_suggestions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upgrade_suggestions" ADD CONSTRAINT "upgrade_suggestions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upgrade_suggestions" ADD CONSTRAINT "upgrade_suggestions_customerServiceId_fkey" FOREIGN KEY ("customerServiceId") REFERENCES "customer_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

