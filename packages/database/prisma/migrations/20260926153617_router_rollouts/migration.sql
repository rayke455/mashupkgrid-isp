-- CreateEnum
CREATE TYPE "RouterRolloutStatus" AS ENUM ('SCHEDULED', 'RUNNING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RouterRolloutTargetStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "routers" ADD COLUMN     "boardName" TEXT,
ADD COLUMN     "firmwareVersion" TEXT,
ADD COLUMN     "routerOsVersion" TEXT,
ADD COLUMN     "versionCheckedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "router_rollouts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "params" JSONB,
    "status" "RouterRolloutStatus" NOT NULL DEFAULT 'RUNNING',
    "canaryFirst" BOOLEAN NOT NULL DEFAULT true,
    "scheduledFor" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "router_rollouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "router_rollout_targets" (
    "id" TEXT NOT NULL,
    "rolloutId" TEXT NOT NULL,
    "routerId" TEXT,
    "routerName" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "RouterRolloutTargetStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "router_rollout_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "router_rollouts_tenantId_createdAt_idx" ON "router_rollouts"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "router_rollouts_status_scheduledFor_idx" ON "router_rollouts"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "router_rollout_targets_rolloutId_position_idx" ON "router_rollout_targets"("rolloutId", "position");

-- AddForeignKey
ALTER TABLE "router_rollouts" ADD CONSTRAINT "router_rollouts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "router_rollout_targets" ADD CONSTRAINT "router_rollout_targets_rolloutId_fkey" FOREIGN KEY ("rolloutId") REFERENCES "router_rollouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "router_rollout_targets" ADD CONSTRAINT "router_rollout_targets_routerId_fkey" FOREIGN KEY ("routerId") REFERENCES "routers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

