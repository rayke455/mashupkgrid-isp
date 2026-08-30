-- CreateEnum
CREATE TYPE "PaystackTransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'ABANDONED');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'PAYSTACK';

-- CreateTable
CREATE TABLE "paystack_transactions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "initiatedByUserId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "status" "PaystackTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "authorizationUrl" TEXT,
    "gatewayResponse" TEXT,
    "paymentId" TEXT,
    "rawWebhook" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paystack_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "paystack_transactions_reference_key" ON "paystack_transactions"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "paystack_transactions_paymentId_key" ON "paystack_transactions"("paymentId");

-- CreateIndex
CREATE INDEX "paystack_transactions_tenantId_status_idx" ON "paystack_transactions"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "paystack_transactions" ADD CONSTRAINT "paystack_transactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paystack_transactions" ADD CONSTRAINT "paystack_transactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paystack_transactions" ADD CONSTRAINT "paystack_transactions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paystack_transactions" ADD CONSTRAINT "paystack_transactions_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
