-- AlterTable
ALTER TABLE " hotspot_packages\ ADD COLUMN IF NOT EXISTS \simultaneousUse\ INTEGER NOT NULL DEFAULT 1;
ALTER TABLE \hotspot_packages\ ADD COLUMN IF NOT EXISTS \blockTethering\ BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE \hotspot_vouchers\ ADD COLUMN IF NOT EXISTS \simultaneousUse\ INTEGER DEFAULT 1;
