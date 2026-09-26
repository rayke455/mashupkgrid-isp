-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "installActivatedAt" TIMESTAMP(3),
ADD COLUMN     "installCode" TEXT,
ADD COLUMN     "installCodeExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "customers_installCode_key" ON "customers"("installCode");

