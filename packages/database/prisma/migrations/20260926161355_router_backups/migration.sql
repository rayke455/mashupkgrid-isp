-- CreateTable
CREATE TABLE "router_backups" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "routerId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "contentEncrypted" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "routerOsVersion" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restoreTokenHash" TEXT,
    "restoreTokenExpiresAt" TIMESTAMP(3),
    "restoredAt" TIMESTAMP(3),

    CONSTRAINT "router_backups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "router_backups_restoreTokenHash_key" ON "router_backups"("restoreTokenHash");

-- CreateIndex
CREATE INDEX "router_backups_routerId_createdAt_idx" ON "router_backups"("routerId", "createdAt");

-- CreateIndex
CREATE INDEX "router_backups_tenantId_createdAt_idx" ON "router_backups"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "router_backups" ADD CONSTRAINT "router_backups_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "router_backups" ADD CONSTRAINT "router_backups_routerId_fkey" FOREIGN KEY ("routerId") REFERENCES "routers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

