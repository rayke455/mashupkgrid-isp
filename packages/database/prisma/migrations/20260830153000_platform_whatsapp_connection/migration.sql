-- The platform WhatsApp line (the one that sends ISP-registration OTPs) has no tenant, so
-- whatsapp_connections could not represent it at all. Allow tenantId to be NULL for that row.
-- The existing foreign key stays: a NULL column simply references nothing.
ALTER TABLE "whatsapp_connections" ALTER COLUMN "tenantId" DROP NOT NULL;

-- whatsapp_connections_tenantId_key still keeps one row per tenant, but Postgres treats NULLs
-- as distinct in a unique index, so on its own it would happily allow unlimited platform rows.
-- This partial index constrains the NULL case to exactly one.
CREATE UNIQUE INDEX "whatsapp_connections_platform_singleton"
  ON "whatsapp_connections" (("tenantId" IS NULL))
  WHERE "tenantId" IS NULL;
