-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "preferences" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "routers" ADD COLUMN "siteName" TEXT,
ADD COLUMN "latitude" DOUBLE PRECISION,
ADD COLUMN "longitude" DOUBLE PRECISION;
