-- The application supplies tenantId for MAC-based hotspot accounting, where the
-- RADIUS User-Name is the device MAC rather than a voucher code.
CREATE OR REPLACE FUNCTION set_radacct_tenant_id() RETURNS trigger AS $$
DECLARE
  resolved_tenant_id TEXT;
BEGIN
  IF NEW."tenantId" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT "tenantId" INTO resolved_tenant_id
  FROM "radius_users"
  WHERE username = NEW.username
  LIMIT 1;

  IF resolved_tenant_id IS NULL THEN
    SELECT "tenantId" INTO resolved_tenant_id
    FROM "hotspot_vouchers"
    WHERE code = NEW.username
    LIMIT 1;
  END IF;

  IF resolved_tenant_id IS NULL THEN
    RAISE EXCEPTION 'radacct: no radius_users or hotspot_vouchers row for username "%" — cannot resolve tenantId', NEW.username;
  END IF;

  NEW."tenantId" := resolved_tenant_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
