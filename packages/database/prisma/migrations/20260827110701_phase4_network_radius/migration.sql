-- CreateEnum
CREATE TYPE "RouterVendor" AS ENUM ('MIKROTIK');

-- CreateEnum
CREATE TYPE "RouterStatus" AS ENUM ('UNKNOWN', 'ONLINE', 'WARNING', 'DOWN');

-- CreateEnum
CREATE TYPE "IpVersion" AS ENUM ('IPV4', 'IPV6');

-- CreateEnum
CREATE TYPE "IPAddressStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'ASSIGNED');

-- CreateEnum
CREATE TYPE "RadiusUserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('UNUSED', 'ACTIVE', 'EXPIRED', 'USED');

-- CreateEnum
CREATE TYPE "SyncTaskStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "SyncTaskAction" AS ENUM ('DISCONNECT_USER');

-- CreateTable
CREATE TABLE "routers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vendor" "RouterVendor" NOT NULL DEFAULT 'MIKROTIK',
    "host" TEXT NOT NULL,
    "apiPort" INTEGER NOT NULL DEFAULT 8728,
    "useTls" BOOLEAN NOT NULL DEFAULT false,
    "usernameEncrypted" TEXT NOT NULL,
    "passwordEncrypted" TEXT NOT NULL,
    "status" "RouterStatus" NOT NULL DEFAULT 'UNKNOWN',
    "lastSeenAt" TIMESTAMP(3),
    "lastError" TEXT,
    "cpuLoadPercent" INTEGER,
    "memoryUsedBytes" BIGINT,
    "memoryTotalBytes" BIGINT,
    "uptimeSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "routers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ip_pools" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "routerId" TEXT,
    "name" TEXT NOT NULL,
    "version" "IpVersion" NOT NULL DEFAULT 'IPV4',
    "cidr" TEXT NOT NULL,
    "gateway" TEXT,
    "dnsServers" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ip_pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ip_addresses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "status" "IPAddressStatus" NOT NULL DEFAULT 'AVAILABLE',
    "assignedToRadiusUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ip_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nas" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "routerId" TEXT,
    "nasname" TEXT NOT NULL,
    "shortname" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'other',
    "ports" INTEGER,
    "secret" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radius_users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerServiceId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordEncrypted" TEXT NOT NULL,
    "status" "RadiusUserStatus" NOT NULL DEFAULT 'ACTIVE',
    "connectionType" TEXT NOT NULL DEFAULT 'PPPOE',
    "staticIp" TEXT,
    "downloadKbps" INTEGER,
    "uploadKbps" INTEGER,
    "simultaneousUse" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "radius_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radcheck" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "attribute" TEXT NOT NULL,
    "op" TEXT NOT NULL DEFAULT '==',
    "value" TEXT NOT NULL,

    CONSTRAINT "radcheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radreply" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "attribute" TEXT NOT NULL,
    "op" TEXT NOT NULL DEFAULT '=',
    "value" TEXT NOT NULL,

    CONSTRAINT "radreply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radacct" (
    "radacctid" BIGSERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "acctsessionid" TEXT NOT NULL,
    "acctuniqueid" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "nasipaddress" TEXT NOT NULL,
    "nasportid" TEXT,
    "nasporttype" TEXT,
    "acctstarttime" TIMESTAMP(3),
    "acctupdatetime" TIMESTAMP(3),
    "acctstoptime" TIMESTAMP(3),
    "acctsessiontime" INTEGER,
    "acctinputoctets" BIGINT,
    "acctoutputoctets" BIGINT,
    "calledstationid" TEXT,
    "callingstationid" TEXT,
    "acctterminatecause" TEXT,
    "framedprotocol" TEXT,
    "framedipaddress" TEXT,
    "framedipv6address" TEXT,

    CONSTRAINT "radacct_pkey" PRIMARY KEY ("radacctid")
);

-- CreateTable
CREATE TABLE "hotspot_vouchers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "packageId" TEXT,
    "durationMinutes" INTEGER,
    "dataCapMb" INTEGER,
    "status" "VoucherStatus" NOT NULL DEFAULT 'UNUSED',
    "activatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotspot_vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_sync_tasks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "routerId" TEXT NOT NULL,
    "radiusUserId" TEXT,
    "action" "SyncTaskAction" NOT NULL,
    "status" "SyncTaskStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "network_sync_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "routers_tenantId_status_idx" ON "routers"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ip_pools_tenantId_name_key" ON "ip_pools"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ip_addresses_assignedToRadiusUserId_key" ON "ip_addresses"("assignedToRadiusUserId");

-- CreateIndex
CREATE INDEX "ip_addresses_tenantId_status_idx" ON "ip_addresses"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ip_addresses_poolId_address_key" ON "ip_addresses"("poolId", "address");

-- CreateIndex
CREATE INDEX "nas_tenantId_idx" ON "nas"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "nas_nasname_key" ON "nas"("nasname");

-- CreateIndex
CREATE UNIQUE INDEX "radius_users_customerServiceId_key" ON "radius_users"("customerServiceId");

-- CreateIndex
CREATE UNIQUE INDEX "radius_users_username_key" ON "radius_users"("username");

-- CreateIndex
CREATE INDEX "radius_users_tenantId_status_idx" ON "radius_users"("tenantId", "status");

-- CreateIndex
CREATE INDEX "radcheck_username_idx" ON "radcheck"("username");

-- CreateIndex
CREATE INDEX "radreply_username_idx" ON "radreply"("username");

-- CreateIndex
CREATE UNIQUE INDEX "radacct_acctuniqueid_key" ON "radacct"("acctuniqueid");

-- CreateIndex
CREATE INDEX "radacct_tenantId_username_idx" ON "radacct"("tenantId", "username");

-- CreateIndex
CREATE INDEX "radacct_acctstarttime_idx" ON "radacct"("acctstarttime");

-- CreateIndex
CREATE UNIQUE INDEX "hotspot_vouchers_tenantId_code_key" ON "hotspot_vouchers"("tenantId", "code");

-- CreateIndex
CREATE INDEX "network_sync_tasks_tenantId_status_idx" ON "network_sync_tasks"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "routers" ADD CONSTRAINT "routers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_pools" ADD CONSTRAINT "ip_pools_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_pools" ADD CONSTRAINT "ip_pools_routerId_fkey" FOREIGN KEY ("routerId") REFERENCES "routers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_addresses" ADD CONSTRAINT "ip_addresses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_addresses" ADD CONSTRAINT "ip_addresses_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "ip_pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_addresses" ADD CONSTRAINT "ip_addresses_assignedToRadiusUserId_fkey" FOREIGN KEY ("assignedToRadiusUserId") REFERENCES "radius_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nas" ADD CONSTRAINT "nas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nas" ADD CONSTRAINT "nas_routerId_fkey" FOREIGN KEY ("routerId") REFERENCES "routers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radius_users" ADD CONSTRAINT "radius_users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radius_users" ADD CONSTRAINT "radius_users_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radius_users" ADD CONSTRAINT "radius_users_customerServiceId_fkey" FOREIGN KEY ("customerServiceId") REFERENCES "customer_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radacct" ADD CONSTRAINT "radacct_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotspot_vouchers" ADD CONSTRAINT "hotspot_vouchers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotspot_vouchers" ADD CONSTRAINT "hotspot_vouchers_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_sync_tasks" ADD CONSTRAINT "network_sync_tasks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_sync_tasks" ADD CONSTRAINT "network_sync_tasks_routerId_fkey" FOREIGN KEY ("routerId") REFERENCES "routers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_sync_tasks" ADD CONSTRAINT "network_sync_tasks_radiusUserId_fkey" FOREIGN KEY ("radiusUserId") REFERENCES "radius_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
