-- CreateTable
CREATE TABLE "customer_members" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "canPay" BOOLEAN NOT NULL DEFAULT false,
    "inviteCode" TEXT,
    "inviteExpiresAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_members_userId_key" ON "customer_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_members_inviteCode_key" ON "customer_members"("inviteCode");

-- CreateIndex
CREATE INDEX "customer_members_customerId_idx" ON "customer_members"("customerId");

-- AddForeignKey
ALTER TABLE "customer_members" ADD CONSTRAINT "customer_members_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_members" ADD CONSTRAINT "customer_members_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_members" ADD CONSTRAINT "customer_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

