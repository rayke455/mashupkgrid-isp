-- AlterTable
ALTER TABLE "routers" ADD COLUMN     "vpnConfiguredAt" TIMESTAMP(3),
ADD COLUMN     "vpnIp" TEXT,
ADD COLUMN     "vpnPublicKey" TEXT,
ADD COLUMN     "vpnRegisterTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "routers_vpnRegisterTokenHash_key" ON "routers"("vpnRegisterTokenHash");

