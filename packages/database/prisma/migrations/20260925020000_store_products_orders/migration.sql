-- CreateEnum
CREATE TYPE "StoreOrderStatus" AS ENUM ('PENDING', 'PAID', 'PROCESSING', 'DISPATCHED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StorePaymentMethod" AS ENUM ('MPESA', 'PAY_ON_DELIVERY');

-- CreateTable
CREATE TABLE "store_products" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "originalPriceMinor" INTEGER,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "badge" TEXT,
    "shortDescription" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "specs" TEXT[],
    "warranty" TEXT NOT NULL,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "county" TEXT NOT NULL,
    "deliveryAddress" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "subtotalMinor" INTEGER NOT NULL,
    "shippingMinor" INTEGER NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "paymentMethod" "StorePaymentMethod" NOT NULL,
    "status" "StoreOrderStatus" NOT NULL DEFAULT 'PENDING',
    "checkoutRequestId" TEXT,
    "mpesaReceiptNumber" TEXT,
    "paymentNote" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_products_slug_key" ON "store_products"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "store_orders_orderNumber_key" ON "store_orders"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "store_orders_checkoutRequestId_key" ON "store_orders"("checkoutRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "store_orders_mpesaReceiptNumber_key" ON "store_orders"("mpesaReceiptNumber");

-- CreateIndex
CREATE INDEX "store_orders_phone_idx" ON "store_orders"("phone");

-- CreateIndex
CREATE INDEX "store_orders_createdAt_idx" ON "store_orders"("createdAt");

