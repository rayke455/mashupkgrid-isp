-- Keeps super-admin (tenantId IS NULL) emails globally unique.
-- Prisma's schema language can't express a partial index; the compound
-- @@unique([tenantId, email]) alone would allow duplicate emails among
-- tenantId = NULL rows since Postgres treats NULL <> NULL in a unique
-- constraint. See docs/architecture/01-database-erd-and-schema.md.
CREATE UNIQUE INDEX "users_email_platform_unique" ON "users" ("email") WHERE "tenantId" IS NULL;
