-- AlterTable
ALTER TABLE "routers" ADD COLUMN     "provisionTokenHash" TEXT,
ADD COLUMN     "provisionedAt" TIMESTAMP(3),
ALTER COLUMN "host" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "routers_provisionTokenHash_key" ON "routers"("provisionTokenHash");

