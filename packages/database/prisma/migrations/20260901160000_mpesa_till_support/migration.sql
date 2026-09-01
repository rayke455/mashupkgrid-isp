-- M-Pesa Buy Goods (Till) support.
--
-- Daraja requires a different TransactionType for a Till than for a Paybill, and derives the STK
-- password from the head-office/store number rather than the till itself. Without these columns
-- every tenant was pushed as CustomerPayBillOnline, so a Till-based tenant's STK requests were
-- never completed by the payer's handset.
--
-- Defaults to PAYBILL so every existing row keeps its current, working behaviour.
ALTER TABLE "payment_provider_configs"
  ADD COLUMN "shortcodeType" TEXT NOT NULL DEFAULT 'PAYBILL',
  ADD COLUMN "storeNumber" TEXT;
