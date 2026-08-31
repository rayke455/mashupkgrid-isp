-- CreateEnum
CREATE TYPE "VlanType" AS ENUM ('CUSTOMER_INTERNET', 'BUSINESS_INTERNET', 'IPTV', 'VOIP', 'HOTSPOT', 'MANAGEMENT', 'GUEST', 'CUSTOM');

-- CreateEnum
CREATE TYPE "VlanProvisioningStatus" AS ENUM ('NOT_PROVISIONED', 'PENDING', 'ACTIVE', 'FAILED');

-- CreateEnum
CREATE TYPE "NetworkServiceType" AS ENUM ('PPPOE', 'HOTSPOT', 'STATIC_IP', 'IPTV');

-- AlterTable
ALTER TABLE "packages" ADD COLUMN     "fairUsagePolicy" TEXT,
ADD COLUMN     "hotspotProfile" TEXT,
ADD COLUMN     "ipPoolId" TEXT,
ADD COLUMN     "pppoeProfile" TEXT,
ADD COLUMN     "routerId" TEXT,
ADD COLUMN     "serviceType" "NetworkServiceType" NOT NULL DEFAULT 'PPPOE',
ADD COLUMN     "vlanId" TEXT;

-- CreateTable
CREATE TABLE "vlans" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vlanTag" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "VlanType" NOT NULL DEFAULT 'CUSTOMER_INTERNET',
    "customTypeLabel" TEXT,
    "routerId" TEXT,
    "subnetCidr" TEXT,
    "gateway" TEXT,
    "ipPoolId" TEXT,
    "dnsServers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "downloadKbps" INTEGER,
    "uploadKbps" INTEGER,
    "mtu" INTEGER,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "provisioningStatus" "VlanProvisioningStatus" NOT NULL DEFAULT 'NOT_PROVISIONED',
    "lastProvisioningError" TEXT,
    "lastProvisionedAt" TIMESTAMP(3),
    "oltDeviceRef" TEXT,
    "ponPort" TEXT,
    "serviceVlanTag" INTEGER,
    "customerVlanTag" INTEGER,
    "vlanMode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vlans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vlans_tenantId_isEnabled_idx" ON "vlans"("tenantId", "isEnabled");

-- CreateIndex
CREATE INDEX "vlans_tenantId_type_idx" ON "vlans"("tenantId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "vlans_routerId_vlanTag_key" ON "vlans"("routerId", "vlanTag");

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_vlanId_fkey" FOREIGN KEY ("vlanId") REFERENCES "vlans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_ipPoolId_fkey" FOREIGN KEY ("ipPoolId") REFERENCES "ip_pools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_routerId_fkey" FOREIGN KEY ("routerId") REFERENCES "routers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vlans" ADD CONSTRAINT "vlans_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vlans" ADD CONSTRAINT "vlans_routerId_fkey" FOREIGN KEY ("routerId") REFERENCES "routers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vlans" ADD CONSTRAINT "vlans_ipPoolId_fkey" FOREIGN KEY ("ipPoolId") REFERENCES "ip_pools"("id") ON DELETE SET NULL ON UPDATE CASCADE;
