import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

/** Caddy asks this endpoint before issuing a certificate for a hostname it has no site block
 *  for. A 200 for the wrong name lets a stranger consume certificates in the platform's name, so
 *  only verified custom domains and real tenant subdomains may pass. */

const h = vi.hoisted(() => ({
  prisma: {
    domain: { findFirst: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    tenant: { findFirst: vi.fn() },
  },
}));

vi.mock("@mashupkgrid/database", () => ({ prisma: h.prisma }));
vi.mock("../../lib/redis.js", () => ({ redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }));
vi.mock("../../lib/permission-cache.js", () => ({ getCachedPermissions: vi.fn() }));
vi.mock("../../lib/maintenance-state.js", () => ({
  getCurrentMaintenanceState: vi.fn().mockResolvedValue({ enabled: false, level: 1, allowedIps: [], allowedRoles: [] }),
}));
vi.mock("../../lib/audit.js", () => ({ writeAuditLog: vi.fn() }));

import { env } from "@mashupkgrid/config";
import { registerErrorHandler } from "../../plugins/error-handler.js";
import { domainRoutes } from "../domains.js";

const base = env.PLATFORM_BASE_DOMAIN;

describe("custom domain TLS check and host resolution", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    registerErrorHandler(app);
    await app.register(domainRoutes, { prefix: "/api/v1/domains" });
    await app.ready();
  });
  afterAll(() => app.close());

  beforeEach(() => {
    h.prisma.domain.findFirst.mockReset();
    h.prisma.domain.update.mockClear();
    h.prisma.tenant.findFirst.mockReset();
  });

  it("lets Caddy issue for a verified custom domain and marks it SSL active", async () => {
    h.prisma.domain.findFirst.mockResolvedValue({ id: "d1", hostname: "wifi.acme.co.ke", status: "VERIFIED", tenant: { deletedAt: null, status: "ACTIVE" } });
    const res = await app.inject({ method: "GET", url: "/api/v1/domains/tls-check?domain=WIFI.acme.co.ke" });
    expect(res.statusCode).toBe(200);
    expect(h.prisma.domain.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ hostname: "wifi.acme.co.ke" }) }));
    expect(h.prisma.domain.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "d1" }, data: expect.objectContaining({ status: "SSL_ACTIVE" }) }));
  });

  it("refuses an unknown or unverified name", async () => {
    h.prisma.domain.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: "/api/v1/domains/tls-check?domain=evil.example.com" });
    expect(res.statusCode).toBe(404);
    expect(h.prisma.domain.update).not.toHaveBeenCalled();
  });

  it("refuses a verified domain whose tenant is suspended", async () => {
    h.prisma.domain.findFirst.mockResolvedValue({ id: "d2", hostname: "wifi.acme.co.ke", status: "SSL_ACTIVE", tenant: { deletedAt: null, status: "SUSPENDED" } });
    const res = await app.inject({ method: "GET", url: "/api/v1/domains/tls-check?domain=wifi.acme.co.ke" });
    expect(res.statusCode).toBe(404);
  });

  it("allows the platform's own tenant subdomains without a database row", async () => {
    const res = await app.inject({ method: "GET", url: `/api/v1/domains/tls-check?domain=acme.${base}` });
    expect(res.statusCode).toBe(200);
    expect(h.prisma.domain.findFirst).not.toHaveBeenCalled();
    const deep = await app.inject({ method: "GET", url: `/api/v1/domains/tls-check?domain=a.b.${base}` });
    expect(deep.statusCode).toBe(404);
  });

  it("resolves a verified custom domain to its tenant for the login page", async () => {
    h.prisma.domain.findFirst.mockResolvedValue({ hostname: "wifi.acme.co.ke", status: "VERIFIED", tenant: { slug: "acme", deletedAt: null } });
    const res = await app.inject({ method: "GET", url: "/api/v1/domains/resolve?host=wifi.acme.co.ke:443" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ tenantSlug: "acme" });
  });
});
