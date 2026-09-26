-- CreateEnum
CREATE TYPE "ReferralRewardType" AS ENUM ('DAYS', 'CREDIT');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referralRewardedAt" TIMESTAMP(3),
ADD COLUMN     "referredById" TEXT;

-- CreateTable
CREATE TABLE "referral_rewards" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredId" TEXT NOT NULL,
    "type" "ReferralRewardType" NOT NULL,
    "days" INTEGER,
    "amountMinor" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "referral_rewards_referredId_key" ON "referral_rewards"("referredId");

-- CreateIndex
CREATE INDEX "referral_rewards_tenantId_createdAt_idx" ON "referral_rewards"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenantId_referralCode_key" ON "customers"("tenantId", "referralCode");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_referredId_fkey" FOREIGN KEY ("referredId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

