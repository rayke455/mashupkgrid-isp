import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { resolveCname } from "node:dns/promises";
import { prisma } from "@mashupkgrid/database";
import { env } from "@mashupkgrid/config";
import { successResponse, ConflictError, NotFoundError, ValidationError, generateSecureToken } from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { writeAuditLog } from "../lib/audit.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

// Lowercase labels separated by dots, each 1-63 chars, alphanumeric+hyphen, never starting or
// ending with a hyphen — a real domain name, not a bare label, protocol, or path.
const HOSTNAME_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

const addDomainSchema = z.object({
  hostname: z.string().min(4).max(253).toLowerCase().regex(HOSTNAME_PATTERN, "Enter a real domain, e.g. billing.yourcompany.co.ke"),
});

const idParamsSchema = z.object({ domainId: z.string().uuid() });

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) {
    throw new ConflictError("Custom domains are not available at the platform level");
  }
  return tenantId;
}

/** The CNAME target every custom domain must point at — the tenant's own already-unique platform
 *  subdomain, not a shared generic value. A successful lookup that matches this proves both DNS
 *  control *and* correct tenant association in one real check (see the multi-tenant-domains
 *  plan's rationale). */
function expectedCnameTarget(tenantSlug: string): string {
  return `${tenantSlug}.${env.PLATFORM_BASE_DOMAIN}`;
}

function normalizeHostname(value: string): string {
  return value.toLowerCase().replace(/\.$/, "");
}

async function getDomainOrThrow(tenantId: string, domainId: string) {
  const domain = await prisma.domain.findFirst({ where: { id: domainId, tenantId } });
  if (!domain) throw new NotFoundError("Domain");
  return domain;
}

export async function domainRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("settings.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const domains = await prisma.domain.findMany({
        where: { tenantId, status: { not: "REMOVED" } },
        orderBy: { createdAt: "asc" },
      });
      reply.send(successResponse(domains, request.id));
    }
  );

  app.post(
    "/",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("settings.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { hostname } = addDomainSchema.parse(request.body);

      // A tenant pointing their custom-domain form at their own (or anyone else's) platform
      // subdomain is a confusing no-op, not a real custom domain — reject it clearly rather than
      // silently accepting a row that could never usefully differ from what already works.
      if (hostname === `.${env.PLATFORM_BASE_DOMAIN}` || hostname.endsWith(`.${env.PLATFORM_BASE_DOMAIN}`)) {
        throw new ValidationError(
          `"${hostname}" is a platform subdomain, not a custom domain you need to connect separately`
        );
      }

      const existing = await prisma.domain.findUnique({ where: { hostname } });
      if (existing) {
        throw new ConflictError(`"${hostname}" is already connected to a tenant on this platform`);
      }

      const domain = await prisma.domain.create({
        data: { tenantId, hostname, verificationToken: generateSecureToken(16), status: "PENDING" },
      });

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "domain.added",
        resourceType: "Domain",
        resourceId: domain.id,
        after: { hostname: domain.hostname },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.status(201).send(successResponse(domain, request.id));
    }
  );

  /** Real DNS verification — a synchronous check-on-click against the domain's actual CNAME
   *  record. Never marks a domain verified just because it was submitted (project instruction
   *  and this session's own established discipline throughout: no guesswork, no simulated
   *  success). */
  app.post(
    "/:domainId/verify",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("settings.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { domainId } = idParamsSchema.parse(request.params);
      const domain = await getDomainOrThrow(tenantId, domainId);
      const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

      const expectedTarget = normalizeHostname(expectedCnameTarget(tenant.slug));
      let status: "VERIFIED" | "DNS_ERROR";
      let lastError: string | null;

      try {
        const records = await resolveCname(domain.hostname);
        const matched = records.some((record) => normalizeHostname(record) === expectedTarget);
        if (matched) {
          status = "VERIFIED";
          lastError = null;
        } else {
          status = "DNS_ERROR";
          lastError = `Found a CNAME pointing to "${records.join(", ")}", but expected "${expectedTarget}"`;
        }
      } catch (err) {
        status = "DNS_ERROR";
        const reason = err instanceof Error ? err.message : String(err);
        lastError = `No CNAME record found for "${domain.hostname}": ${reason}`;
      }

      const updated = await prisma.domain.update({
        where: { id: domain.id },
        data: {
          status,
          lastError,
          lastCheckedAt: new Date(),
          verifiedAt: status === "VERIFIED" ? new Date() : domain.verifiedAt,
        },
      });

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "domain.verification_checked",
        resourceType: "Domain",
        resourceId: domain.id,
        after: { status: updated.status, lastError: updated.lastError },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(updated, request.id));
    }
  );

  app.post(
    "/:domainId/set-primary",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("settings.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { domainId } = idParamsSchema.parse(request.params);
      const domain = await getDomainOrThrow(tenantId, domainId);

      if (domain.status !== "VERIFIED" && domain.status !== "SSL_ACTIVE") {
        throw new ConflictError("Only a verified domain can be made primary");
      }

      const [, updated] = await prisma.$transaction([
        prisma.domain.updateMany({ where: { tenantId, isPrimary: true }, data: { isPrimary: false } }),
        prisma.domain.update({ where: { id: domain.id }, data: { isPrimary: true } }),
      ]);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "domain.set_primary",
        resourceType: "Domain",
        resourceId: domain.id,
        after: { hostname: domain.hostname },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(updated, request.id));
    }
  );

  app.delete(
    "/:domainId",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("settings.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { domainId } = idParamsSchema.parse(request.params);
      const domain = await getDomainOrThrow(tenantId, domainId);

      const updated = await prisma.domain.update({
        where: { id: domain.id },
        data: { status: "REMOVED", isPrimary: false },
      });

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "domain.removed",
        resourceType: "Domain",
        resourceId: domain.id,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(updated, request.id));
    }
  );

  /**
   * Public — no auth, called by apps/web's middleware on every request to a login/register/root
   * page to figure out which tenant a hostname belongs to. Deliberately does not check tenant
   * status (suspended/trial-expired): this is a pre-fill convenience, not an authorization
   * decision — the real check still happens in resolveTenantBySlug at actual login time.
   */
  app.get(
    "/resolve",
    { config: { audience: "public" }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      const { host } = z.object({ host: z.string().min(1) }).parse(request.query);
      const hostname = host.split(":")[0]!.toLowerCase();

      const suffix = `.${env.PLATFORM_BASE_DOMAIN}`;
      if (hostname.endsWith(suffix)) {
        const slug = hostname.slice(0, -suffix.length);
        if (slug && !slug.includes(".")) {
          const tenant = await prisma.tenant.findFirst({ where: { slug, deletedAt: null } });
          if (tenant) {
            reply.send(successResponse({ tenantSlug: tenant.slug }, request.id));
            return;
          }
        }
      }

      const domain = await prisma.domain.findFirst({
        where: { hostname, status: { in: ["VERIFIED", "SSL_ACTIVE"] } },
        include: { tenant: true },
      });
      if (domain && !domain.tenant.deletedAt) {
        reply.send(successResponse({ tenantSlug: domain.tenant.slug }, request.id));
        return;
      }

      throw new NotFoundError("A tenant for this host");
    }
  );
}
