-- Auto-populates radacct."tenantId" on insert. FreeRADIUS's stock rlm_sql accounting query
-- (infrastructure/freeradius/raddb/mods-available/sql) is deliberately unmodified vanilla SQL —
-- it has no idea "tenant" is a concept, so it INSERTs a radacct row without that column at all.
-- Since "tenantId" is NOT NULL (every other tenant-scoped table in this schema requires it), the
-- trigger below derives it the same way the app itself would resolve "whose session is this":
-- by the RADIUS username, checked first against a real subscriber (radius_users, the common
-- PPPoE case) and then against a hotspot voucher (hotspot_vouchers.code doubles as its RADIUS
-- username, per packages/radius/src/voucher.service.ts). A username matching neither is a
-- genuine anomaly — a NAS accounting for a session FreeRADIUS never actually authenticated
-- through this app's data — so it fails loudly instead of writing an orphaned, tenant-less row.
CREATE OR REPLACE FUNCTION set_radacct_tenant_id() RETURNS trigger AS $$
DECLARE
  resolved_tenant_id TEXT;
BEGIN
  SELECT "tenantId" INTO resolved_tenant_id FROM "radius_users" WHERE username = NEW.username LIMIT 1;

  IF resolved_tenant_id IS NULL THEN
    SELECT "tenantId" INTO resolved_tenant_id FROM "hotspot_vouchers" WHERE code = NEW.username LIMIT 1;
  END IF;

  IF resolved_tenant_id IS NULL THEN
    RAISE EXCEPTION 'radacct: no radius_users or hotspot_vouchers row for username "%" — cannot resolve tenantId', NEW.username;
  END IF;

  NEW."tenantId" := resolved_tenant_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS radacct_set_tenant_id ON "radacct";
CREATE TRIGGER radacct_set_tenant_id
  BEFORE INSERT ON "radacct"
  FOR EACH ROW
  EXECUTE FUNCTION set_radacct_tenant_id();
