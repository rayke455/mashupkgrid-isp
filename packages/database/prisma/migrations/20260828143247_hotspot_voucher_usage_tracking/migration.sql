-- AlterTable
ALTER TABLE "hotspot_vouchers" ADD COLUMN     "bytesIn" BIGINT,
ADD COLUMN     "bytesOut" BIGINT,
ADD COLUMN     "usageUpdatedAt" TIMESTAMP(3);
