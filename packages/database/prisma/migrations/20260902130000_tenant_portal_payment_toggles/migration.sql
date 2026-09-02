-- Which payment methods a tenant shows on their captive portal.
--
-- A disable-list, not an enable-list: a method that becomes available (a gateway is configured,
-- or the tenant is switched to platform collection) should appear without anyone remembering to
-- opt them in. Empty default means every tenant keeps showing everything they can currently use.
ALTER TABLE "tenants" ADD COLUMN "portalPaymentsDisabled" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
