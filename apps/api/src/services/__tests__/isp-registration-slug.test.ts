import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Guards the slug rules on `registerIspTenant` — the endpoint that ACTUALLY creates a tenant.
 *
 * The rules already existed, but only in `/isp-registration/check-slug`, the wizard's live
 * preview. That made them advisory: a caller who skipped the wizard and posted straight to
 * `/isp-registration` could register `api`, `admin`, or `portal` and be handed that subdomain of
 * the platform's own domain — which the reverse proxy routes and which the API's CORS check
 * (plugins/security.ts) treats as a trusted origin.
 *
 * The lesson these tests encode is the general one, not the specific hole: validation belongs at
 * the point where state changes, not at the point where the UI happens to ask. So every case
 * below drives the service directly, with no HTTP layer and no wizard in front of it — exactly
 * the way an attacker reaches it.
 */

const h = vi.hoisted(() => ({
  prisma: {
    tenant: { findUnique: vi.fn(), create: vi.fn() },
    user: { findFirst: vi.fn(), create: vi.fn() },
    tenantPlan: { findFirst: vi.fn() },
    role: { findFirst: vi.fn() },
    userRole: { upsert: vi.fn() },
  },
  createSession: vi.fn(),
  enqueueSendWhatsappTenantWelcome: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@mashupkgrid/database", () => ({ prisma: h.prisma }));
vi.mock("@mashupkgrid/auth", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createSession: h.createSession,
}));
vi.mock("../../lib/queue.js", () => ({
  enqueueSendVerificationEmail: vi.fn(),
  enqueueSendPasswordResetEmail: vi.fn(),
  enqueueSendWhatsappTenantWelcome: h.enqueueSendWhatsappTenantWelcome,
}));
vi.mock("../../lib/redis.js", () => ({ redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }));

import { registerIspTenant } from "../auth.service.js";
import { ConflictError, ValidationError, RESERVED_SUBDOMAINS } from "@mashupkgrid/shared";

const BASE_BODY = {
  name: "Jane Owner",
  company: "Acme Fibre",
  slug: "acme",
  email: "owner@acme.test",
  phone: "+254700000000",
  password: "a-long-enough-password",
};

const DEVICE = { ipAddress: "127.0.0.1", userAgent: "vitest" };

/** Puts every downstream lookup in the "this signup should succeed" state, so any rejection a
 *  test observes came from the slug rules and not from an incidental missing mock. */
function allowEverythingDownstream(): void {
  h.prisma.tenant.findUnique.mockResolvedValue(null);
  h.prisma.user.findFirst.mockResolvedValue(null);
  h.prisma.tenantPlan.findFirst.mockResolvedValue(null);
  h.prisma.tenant.create.mockResolvedValue({ id: "t1", name: "Acme Fibre", slug: "acme" });
  h.prisma.user.create.mockResolvedValue({ id: "u1", email: BASE_BODY.email, tenantId: "t1" });
  h.prisma.role.findFirst.mockResolvedValue({ id: "r1", name: "ISP_OWNER", tenantId: null });
  h.prisma.userRole.upsert.mockResolvedValue({ id: "ur1" });
  h.createSession.mockResolvedValue({
    accessToken: "at",
    refreshToken: "rt",
    session: { id: "s1" },
    expiresInSeconds: 900,
  });
}

describe("registerIspTenant slug enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    allowEverythingDownstream();
  });

  it.each([...RESERVED_SUBDOMAINS])("refuses to create a tenant on the reserved slug %s", async (slug) => {
    await expect(registerIspTenant({ ...BASE_BODY, slug }, DEVICE)).rejects.toBeInstanceOf(ConflictError);
    expect(h.prisma.tenant.create).not.toHaveBeenCalled();
  });

  it("refuses a reserved slug regardless of casing or padding", async () => {
    await expect(registerIspTenant({ ...BASE_BODY, slug: "  ADMIN " }, DEVICE)).rejects.toBeInstanceOf(
      ConflictError
    );
    expect(h.prisma.tenant.create).not.toHaveBeenCalled();
  });

  it("refuses a slug that only reaches the 3-character minimum before sanitizing", async () => {
    // The request schema checks min(3) on the RAW value, but the service strips everything
    // outside [a-z0-9-] — so "a@@b" arrived at the database as the 2-character "ab".
    await expect(registerIspTenant({ ...BASE_BODY, slug: "a@@b" }, DEVICE)).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(h.prisma.tenant.create).not.toHaveBeenCalled();
  });

  it("refuses a slug of only hyphens, which passes a naive character check but is not a hostname label", async () => {
    await expect(registerIspTenant({ ...BASE_BODY, slug: "---" }, DEVICE)).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(h.prisma.tenant.create).not.toHaveBeenCalled();
  });

  it("refuses a slug that starts or ends with a hyphen", async () => {
    for (const slug of ["-acme", "acme-"]) {
      await expect(registerIspTenant({ ...BASE_BODY, slug }, DEVICE)).rejects.toBeInstanceOf(
        ValidationError
      );
    }
    expect(h.prisma.tenant.create).not.toHaveBeenCalled();
  });

  it("still creates a tenant for an ordinary slug", async () => {
    const result = await registerIspTenant({ ...BASE_BODY, slug: "acme-fibre" }, DEVICE);
    expect(h.prisma.tenant.create).toHaveBeenCalledTimes(1);
    expect(h.prisma.tenant.create.mock.calls[0]![0].data.slug).toBe("acme-fibre");
    expect(result.session.accessToken).toBe("at");
  });

  it("refuses an owner account whose email already exists anywhere on the platform", async () => {
    h.prisma.user.findFirst.mockResolvedValue({ id: "existing", email: BASE_BODY.email });
    await expect(registerIspTenant(BASE_BODY, DEVICE)).rejects.toBeInstanceOf(ConflictError);
    expect(h.prisma.tenant.create).not.toHaveBeenCalled();
  });

  it("fails loudly rather than creating a powerless owner when no system role exists", async () => {
    // Seed data is what guarantees a role to assign. If it is missing that is a deployment fault,
    // and the old behaviour — a silently skipped assignment — handed out an account that could do
    // nothing, with no error anywhere.
    h.prisma.role.findFirst.mockResolvedValue(null);
    await expect(registerIspTenant(BASE_BODY, DEVICE)).rejects.toThrow(/no system role/i);
  });
});
