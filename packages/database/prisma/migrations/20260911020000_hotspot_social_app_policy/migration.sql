-- AlterTable
ALTER TABLE "hotspot_packages" ADD COLUMN IF NOT EXISTS "appPolicy" TEXT DEFAULT 'ALL';

-- AlterTable
ALTER TABLE "hotspot_vouchers" ADD COLUMN IF NOT EXISTS "appPolicy" TEXT DEFAULT 'ALL';
