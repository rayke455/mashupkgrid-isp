-- CreateEnum
CREATE TYPE "AnnouncementSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "disabledFeatures" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "platform_mpesa_config" (
    "id" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "consumerKeyEncrypted" TEXT,
    "consumerSecretEncrypted" TEXT,
    "shortcode" TEXT,
    "passkeyEncrypted" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'sandbox',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_mpesa_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_onboarding_fees" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL DEFAULT 45000,
    "phone" TEXT,
    "status" "MpesaTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "merchantRequestId" TEXT,
    "checkoutRequestId" TEXT,
    "mpesaReceiptNumber" TEXT,
    "resultDesc" TEXT,
    "rawCallback" JSONB,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_onboarding_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_announcements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "severity" "AnnouncementSeverity" NOT NULL DEFAULT 'INFO',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "platform_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_dismissals" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_dismissals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_onboarding_fees_tenantId_key" ON "tenant_onboarding_fees"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_onboarding_fees_checkoutRequestId_key" ON "tenant_onboarding_fees"("checkoutRequestId");

-- CreateIndex
CREATE INDEX "platform_announcements_tenantId_idx" ON "platform_announcements"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "announcement_dismissals_announcementId_userId_key" ON "announcement_dismissals"("announcementId", "userId");

-- AddForeignKey
ALTER TABLE "tenant_onboarding_fees" ADD CONSTRAINT "tenant_onboarding_fees_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_announcements" ADD CONSTRAINT "platform_announcements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_dismissals" ADD CONSTRAINT "announcement_dismissals_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "platform_announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

