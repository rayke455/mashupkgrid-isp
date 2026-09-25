-- CreateTable
CREATE TABLE "hotspot_devices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "macAddress" TEXT NOT NULL,
    "voucherCode" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotspot_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hotspot_devices_tenantId_voucherCode_idx" ON "hotspot_devices"("tenantId", "voucherCode");

-- CreateIndex
CREATE UNIQUE INDEX "hotspot_devices_tenantId_macAddress_key" ON "hotspot_devices"("tenantId", "macAddress");

