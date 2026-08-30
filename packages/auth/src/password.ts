// Canonical hashing API for the rest of the app. The actual implementation lives in
// @mashupkgrid/shared (dependency-free) so packages/database's seed script can use it without
// creating an auth <-> database import cycle — see docs/architecture/03-rbac-and-multitenancy.md.
export { hashPassword, verifyPassword, isPasswordStrongEnough } from "@mashupkgrid/shared";
