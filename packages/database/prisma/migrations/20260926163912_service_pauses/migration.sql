-- AlterTable
ALTER TABLE "customer_services" ADD COLUMN     "pausedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "service_pauses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerServiceId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "days" INTEGER NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "resumedAt" TIMESTAMP(3),

    CONSTRAINT "service_pauses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_pauses_customerServiceId_startsAt_idx" ON "service_pauses"("customerServiceId", "startsAt");

-- AddForeignKey
ALTER TABLE "service_pauses" ADD CONSTRAINT "service_pauses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_pauses" ADD CONSTRAINT "service_pauses_customerServiceId_fkey" FOREIGN KEY ("customerServiceId") REFERENCES "customer_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

