-- CreateEnum
CREATE TYPE "JobCardType" AS ENUM ('INSTALLATION', 'REPAIR', 'SURVEY', 'RELOCATION', 'REMOVAL');

-- CreateEnum
CREATE TYPE "JobCardStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobCardAttachmentKind" AS ENUM ('PHOTO', 'SIGNATURE');

-- CreateTable
CREATE TABLE "job_cards" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" "JobCardType" NOT NULL,
    "status" "JobCardStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "customerId" TEXT,
    "address" TEXT,
    "contactPhone" TEXT,
    "assignedToUserId" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "equipment" TEXT,
    "completionNotes" TEXT,
    "signedByName" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_card_attachments" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "kind" "JobCardAttachmentKind" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_card_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_cards_tenantId_status_idx" ON "job_cards"("tenantId", "status");

-- CreateIndex
CREATE INDEX "job_cards_assignedToUserId_status_idx" ON "job_cards"("assignedToUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "job_cards_tenantId_number_key" ON "job_cards"("tenantId", "number");

-- CreateIndex
CREATE INDEX "job_card_attachments_jobCardId_idx" ON "job_card_attachments"("jobCardId");

-- AddForeignKey
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_card_attachments" ADD CONSTRAINT "job_card_attachments_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "job_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

