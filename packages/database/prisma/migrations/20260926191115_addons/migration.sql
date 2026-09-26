-- CreateEnum
CREATE TYPE "AddOnKind" AS ENUM ('SPEED', 'DATA');

-- CreateEnum
CREATE TYPE "AddOnPurchaseStatus" AS ENUM ('AWAITING_PAYMENT', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "addons" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "AddOnKind" NOT NULL,
    "downloadKbps" INTEGER,
    "uploadKbps" INTEGER,
    "dataMb" INTEGER,
    "durationHours" INTEGER NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addon_purchases" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerServiceId" TEXT NOT NULL,
    "addOnId" TEXT,
    "invoiceId" TEXT,
    "status" "AddOnPurchaseStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "name" TEXT NOT NULL,
    "kind" "AddOnKind" NOT NULL,
    "downloadKbps" INTEGER,
    "uploadKbps" INTEGER,
    "dataMb" INTEGER,
    "durationHours" INTEGER NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "requestedBy" TEXT NOT NULL DEFAULT 'customer',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "addon_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "addons_tenantId_idx" ON "addons"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "addon_purchases_invoiceId_key" ON "addon_purchases"("invoiceId");

-- CreateIndex
CREATE INDEX "addon_purchases_customerServiceId_status_idx" ON "addon_purchases"("customerServiceId", "status");

-- CreateIndex
CREATE INDEX "addon_purchases_status_endsAt_idx" ON "addon_purchases"("status", "endsAt");

-- AddForeignKey
ALTER TABLE "addons" ADD CONSTRAINT "addons_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addon_purchases" ADD CONSTRAINT "addon_purchases_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addon_purchases" ADD CONSTRAINT "addon_purchases_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addon_purchases" ADD CONSTRAINT "addon_purchases_customerServiceId_fkey" FOREIGN KEY ("customerServiceId") REFERENCES "customer_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addon_purchases" ADD CONSTRAINT "addon_purchases_addOnId_fkey" FOREIGN KEY ("addOnId") REFERENCES "addons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addon_purchases" ADD CONSTRAINT "addon_purchases_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

