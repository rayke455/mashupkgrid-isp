-- Payout floor as a platform setting rather than an environment variable.
--
-- Whether a Safaricom B2B fee is worth paying on a small balance is a commercial judgement the
-- operator makes and revises, not something that should require editing .env and redeploying.
-- Defaults to 1 cent: everything collected is remitted.
ALTER TABLE "platform_mpesa_config" ADD COLUMN "payoutMinimumMinor" INTEGER NOT NULL DEFAULT 1;
