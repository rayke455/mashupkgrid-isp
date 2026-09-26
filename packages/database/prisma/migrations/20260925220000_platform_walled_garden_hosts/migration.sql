-- CreateTable
CREATE TABLE "platform_walled_garden_hosts" (
    "id" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_walled_garden_hosts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_walled_garden_hosts_host_key" ON "platform_walled_garden_hosts"("host");
