-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "dunningStage" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastDunningAt" TIMESTAMP(3);
