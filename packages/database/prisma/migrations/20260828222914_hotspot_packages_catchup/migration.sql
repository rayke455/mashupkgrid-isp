-- DropForeignKey
ALTER TABLE "mpesa_stk_requests" DROP CONSTRAINT "mpesa_stk_requests_customerId_fkey";

-- DropForeignKey
ALTER TABLE "paystack_transactions" DROP CONSTRAINT "paystack_transactions_customerId_fkey";

-- AlterTable
ALTER TABLE "hotspot_vouchers" ADD COLUMN     "downloadKbps" INTEGER,
ADD COLUMN     "hotspotPackageId" TEXT,
ADD COLUMN     "uploadKbps" INTEGER,
ALTER COLUMN "createdByUserId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "mpesa_stk_requests" ADD COLUMN     "hotspotPackageId" TEXT,
ADD COLUMN     "hotspotVoucherCode" TEXT,
ALTER COLUMN "customerId" DROP NOT NULL,
ALTER COLUMN "initiatedByUserId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "paystack_transactions" ADD COLUMN     "hotspotPackageId" TEXT,
ADD COLUMN     "hotspotVoucherCode" TEXT,
ALTER COLUMN "customerId" DROP NOT NULL,
ALTER COLUMN "initiatedByUserId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "hotspot_packages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "durationMinutes" INTEGER NOT NULL,
    "dataCapMb" INTEGER,
    "downloadKbps" INTEGER,
    "uploadKbps" INTEGER,
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "badge" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotspot_packages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hotspot_packages_tenantId_isActive_idx" ON "hotspot_packages"("tenantId", "isActive");

-- AddForeignKey
ALTER TABLE "mpesa_stk_requests" ADD CONSTRAINT "mpesa_stk_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mpesa_stk_requests" ADD CONSTRAINT "mpesa_stk_requests_hotspotPackageId_fkey" FOREIGN KEY ("hotspotPackageId") REFERENCES "hotspot_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paystack_transactions" ADD CONSTRAINT "paystack_transactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paystack_transactions" ADD CONSTRAINT "paystack_transactions_hotspotPackageId_fkey" FOREIGN KEY ("hotspotPackageId") REFERENCES "hotspot_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotspot_packages" ADD CONSTRAINT "hotspot_packages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotspot_vouchers" ADD CONSTRAINT "hotspot_vouchers_hotspotPackageId_fkey" FOREIGN KEY ("hotspotPackageId") REFERENCES "hotspot_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

