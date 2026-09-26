-- CreateEnum
CREATE TYPE "MaintenanceScope" AS ENUM ('ALL', 'ROUTERS', 'BRANCH');

-- CreateEnum
CREATE TYPE "NetworkMaintenanceStatus" AS ENUM ('SCHEDULED', 'CANCELLED');

-- CreateTable
CREATE TABLE "network_maintenance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "scope" "MaintenanceScope" NOT NULL DEFAULT 'ALL',
    "routerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "branchId" TEXT,
    "notifyHoursBefore" INTEGER NOT NULL DEFAULT 24,
    "status" "NetworkMaintenanceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "beforeSentAt" TIMESTAMP(3),
    "afterSentAt" TIMESTAMP(3),
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "network_maintenance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "network_maintenance_tenantId_startsAt_idx" ON "network_maintenance"("tenantId", "startsAt");

-- CreateIndex
CREATE INDEX "network_maintenance_status_startsAt_idx" ON "network_maintenance"("status", "startsAt");

-- AddForeignKey
ALTER TABLE "network_maintenance" ADD CONSTRAINT "network_maintenance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

