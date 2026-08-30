-- AlterEnum
ALTER TYPE "PaymentProviderKind" ADD VALUE 'PAYSTACK';

-- AlterTable
ALTER TABLE "payment_provider_configs" ADD COLUMN     "publicKey" TEXT,
ADD COLUMN     "secretKeyEncrypted" TEXT;
