-- CreateTable
CREATE TABLE "captive_portal_configs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phone" TEXT,
    "supportPhone" TEXT,
    "brandName" TEXT,
    "welcomeTitle" TEXT,
    "bannerSubtitle" TEXT,
    "activeThemeId" TEXT,
    "installationFee" TEXT,
    "fiberRates" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "captive_portal_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "captive_portal_configs_tenantId_key" ON "captive_portal_configs"("tenantId");

-- AddForeignKey
ALTER TABLE "captive_portal_configs" ADD CONSTRAINT "captive_portal_configs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
