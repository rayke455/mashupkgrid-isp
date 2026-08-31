-- CreateEnum
CREATE TYPE "ProvisioningOperation" AS ENUM ('PROVISION', 'SUSPEND', 'RESTORE', 'DEPROVISION');

-- CreateEnum
CREATE TYPE "ProvisioningJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServiceProvisioningStatus" AS ENUM ('PENDING', 'PROCESSING', 'ACTIVE', 'FAILED', 'SUSPENDED', 'DEPROVISIONED');

-- AlterTable
ALTER TABLE "customer_services" ADD COLUMN     "provisioningStatus" "ServiceProvisioningStatus" NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "provisioning_jobs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerServiceId" TEXT NOT NULL,
    "vlanId" TEXT,
    "routerId" TEXT,
    "operation" "ProvisioningOperation" NOT NULL,
    "status" "ProvisioningJobStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastError" TEXT,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provisioning_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provisioning_logs" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "message" TEXT NOT NULL,
    "steps" JSONB,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provisioning_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "provisioning_jobs_idempotencyKey_key" ON "provisioning_jobs"("idempotencyKey");

-- CreateIndex
CREATE INDEX "provisioning_jobs_tenantId_status_idx" ON "provisioning_jobs"("tenantId", "status");

-- CreateIndex
CREATE INDEX "provisioning_jobs_status_createdAt_idx" ON "provisioning_jobs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "provisioning_logs_jobId_attempt_idx" ON "provisioning_logs"("jobId", "attempt");

-- AddForeignKey
ALTER TABLE "provisioning_jobs" ADD CONSTRAINT "provisioning_jobs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provisioning_jobs" ADD CONSTRAINT "provisioning_jobs_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provisioning_jobs" ADD CONSTRAINT "provisioning_jobs_customerServiceId_fkey" FOREIGN KEY ("customerServiceId") REFERENCES "customer_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provisioning_jobs" ADD CONSTRAINT "provisioning_jobs_vlanId_fkey" FOREIGN KEY ("vlanId") REFERENCES "vlans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provisioning_jobs" ADD CONSTRAINT "provisioning_jobs_routerId_fkey" FOREIGN KEY ("routerId") REFERENCES "routers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provisioning_logs" ADD CONSTRAINT "provisioning_logs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "provisioning_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
