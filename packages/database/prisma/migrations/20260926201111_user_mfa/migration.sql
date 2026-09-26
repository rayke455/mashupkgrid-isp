-- CreateEnum
CREATE TYPE "MfaMethod" AS ENUM ('TOTP', 'SMS');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mfaMethod" "MfaMethod",
ADD COLUMN     "mfaRecoveryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];

