-- AlterTable
ALTER TABLE "hotspot_devices" ADD COLUMN     "baselineBytesIn" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "baselineBytesOut" BIGINT NOT NULL DEFAULT 0;

