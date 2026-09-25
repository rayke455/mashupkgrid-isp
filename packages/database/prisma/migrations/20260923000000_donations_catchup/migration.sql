-- Catch-up: the donations table and the donate settings were added to schema.prisma and applied
-- with `prisma db push`, but no migration was ever written — so a database built from migrations
-- alone (every fresh production install) was missing them. IF NOT EXISTS keeps this a no-op on
-- databases that already have them.

ALTER TABLE "platform_mpesa_config" ADD COLUMN IF NOT EXISTS "donateAccountReference" TEXT;
ALTER TABLE "platform_mpesa_config" ADD COLUMN IF NOT EXISTS "donateEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform_mpesa_config" ADD COLUMN IF NOT EXISTS "donatePaybill" TEXT;

CREATE TABLE IF NOT EXISTS "donations" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "donorName" TEXT,
    "donorMessage" TEXT,
    "merchantRequestId" TEXT NOT NULL,
    "checkoutRequestId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resultCode" INTEGER,
    "resultDesc" TEXT,
    "mpesaReceiptNumber" TEXT,
    "rawCallback" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "donations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "donations_checkoutRequestId_key" ON "donations"("checkoutRequestId");
CREATE UNIQUE INDEX IF NOT EXISTS "donations_mpesaReceiptNumber_key" ON "donations"("mpesaReceiptNumber");
