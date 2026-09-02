-- Per-router anti-tethering toggle.
--
-- Detection is TTL-based and cannot be perfect, so this is opt-in per router rather than a
-- platform-wide default: an operator turns it on for a site where voucher sharing is actually
-- costing them, and leaves it off where a false positive would be worse than the leakage.
ALTER TABLE "routers" ADD COLUMN "blockTethering" BOOLEAN NOT NULL DEFAULT false;
