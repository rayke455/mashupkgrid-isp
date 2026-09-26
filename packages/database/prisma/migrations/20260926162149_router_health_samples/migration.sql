-- CreateTable
CREATE TABLE "router_health_samples" (
    "id" BIGSERIAL NOT NULL,
    "routerId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reachable" BOOLEAN NOT NULL,
    "cpuPercent" INTEGER,
    "memoryPercent" INTEGER,
    "temperatureC" DOUBLE PRECISION,
    "uptimeSeconds" INTEGER,

    CONSTRAINT "router_health_samples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "router_health_samples_routerId_at_idx" ON "router_health_samples"("routerId", "at");

-- CreateIndex
CREATE INDEX "router_health_samples_at_idx" ON "router_health_samples"("at");

-- AddForeignKey
ALTER TABLE "router_health_samples" ADD CONSTRAINT "router_health_samples_routerId_fkey" FOREIGN KEY ("routerId") REFERENCES "routers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

