import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, type Router as RouterRow } from "@mashupkgrid/database";
import {
  listRouters,
  getRouterOrThrow,
  createRouter,
  createPendingRouter,
  getGeneratedCredentials,
  completeRouterProvisioning,
  ensureRouterVpnIp,
  startVpnRegistration,
  completeVpnRegistration,
  updateRouter,
  deleteRouter,
  testRouterConnection,
  getRouterActiveSessions,
  disconnectAllRouterSessions,
  applyRouterSpeedtestBoost,
  enforceRouterStrictTimeout,
} from "@mashupkgrid/network";
import {
  getOrCreateNasForRouter,
  buildMikrotikSetupScript,
  buildMikrotikProvisioningScript,
  buildMikrotikHotspotScript,
  buildMikrotikVpnStartScript,
  buildMikrotikVpnCompleteScript,
} from "@mashupkgrid/radius";
import { successResponse, ConflictError, NotFoundError, hashToken } from "@mashupkgrid/shared";
import { env, isProduction } from "@mashupkgrid/config";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { requireFeature } from "../plugins/require-feature.js";
import { writeAuditLog } from "../lib/audit.js";
import { assertWithinPlanLimit } from "../lib/plan-limits.js";

const preHandler = [authenticate, resolveTenant, checkMaintenance] as const;

// Every one of these values gets interpolated directly into a generated RouterOS script or a
// FreeRADIUS clients.conf `client { }` block that staff are told to paste/copy verbatim (see
// packages/radius/src/setup-script.ts) — neither format has any quoting/escaping applied at
// render time, so an unrestricted string here is a real script-injection vector: a name
// containing a newline breaks out of a `#` comment line into a live command, and a value
// containing `}` breaks out of the FreeRADIUS client block into a second, attacker-controlled
// one. These allowlists (not blocklists) are the actual fix — reject anything that isn't a
// plain identifier/hostname rather than trying to escape special characters per-template.
const ROUTER_NAME_PATTERN = /^[a-zA-Z0-9 ._-]+$/;
const HOST_PATTERN = /^[a-zA-Z0-9.:-]+$/;
const ROUTEROS_IDENTIFIER_PATTERN = /^[a-zA-Z0-9_-]+$/;

const createRouterSchema = z.object({
  name: z.string().min(1).max(64).regex(ROUTER_NAME_PATTERN, "Router name may only contain letters, numbers, spaces, and . _ -"),
  vendor: z.enum(["MIKROTIK"]),
  host: z.string().min(1).max(255).regex(HOST_PATTERN, "Host must be a plain hostname or IP address"),
  apiPort: z.number().int().positive().optional(),
  useTls: z.boolean().optional(),
  username: z.string().min(1),
  password: z.string().min(1),
});

const updateRouterSchema = createRouterSchema.partial();

const createPendingRouterSchema = z.object({
  name: z.string().min(1).max(64).regex(ROUTER_NAME_PATTERN, "Router name may only contain letters, numbers, spaces, and . _ -"),
});

const idParamsSchema = z.object({ routerId: z.string().uuid() });
const setupScriptQuerySchema = z.object({
  radiusHost: z.string().min(1).max(255).regex(HOST_PATTERN, "radiusHost must be a plain hostname or IP address"),
});
/** A tenant's own portal hostnames, for the router's walled garden. A white-labelled tenant
 *  sends its customers to its own domain, not the platform's, so a router that only allows the
 *  platform host blocks the exact page it just redirected the customer to — which presents as
 *  the captive portal "not loading" with no clue as to why.
 *
 *  SSL_PENDING is included alongside the fully-live statuses deliberately: allowing a host the
 *  router will need shortly is harmless, whereas re-running the provisioning script every time a
 *  certificate finishes issuing is the kind of step that silently never happens. */
async function getTenantPortalDomains(tenantId: string): Promise<string[]> {
  const domains = await prisma.domain.findMany({
    where: { tenantId, status: { in: ["VERIFIED", "SSL_PENDING", "SSL_ACTIVE"] } },
    select: { hostname: true },
  });
  return domains.map((d) => d.hostname);
}

const hotspotScriptQuerySchema = z.object({
  interfaceName: z.string().min(1).max(64).regex(ROUTEROS_IDENTIFIER_PATTERN, "interfaceName may only contain letters, numbers, _ and -"),
  addressPoolName: z.string().min(1).max(64).regex(ROUTEROS_IDENTIFIER_PATTERN, "addressPoolName may only contain letters, numbers, _ and -"),
  radiusHost: z.string().min(1).max(255).regex(HOST_PATTERN, "radiusHost must be a plain hostname or IP address"),
});
const provisioningScriptQuerySchema = z.object({ provisionToken: z.string().min(1) });
// A WireGuard public key is exactly 32 bytes, standard-base64 encoded: 43 characters plus one
// "=" of padding. Enforcing that shape matters because the value arrives as the raw body of an
// UNAUTHENTICATED callback and is then (a) passed as an argv element to the `wg` binary, where a
// leading "-" would be read as a flag rather than a key, and (b) persisted verbatim to
// Router.vpnPublicKey with no length bound of its own.
// The final character before the padding carries only 4 significant bits, so it is restricted
// to the base64 symbols whose index is a multiple of 4 (A E I M Q U Y c g k o s w 0 4 8).
const WIREGUARD_PUBLIC_KEY_PATTERN = /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/;
const provisionCallbackParamsSchema = z.object({ token: z.string().min(1) });

function requireTenant(tenantId: string | null): string {
  if (tenantId === null) throw new ConflictError("Router management is not available at the platform level");
  return tenantId;
}

/** Never send `usernameEncrypted`/`passwordEncrypted`/`provisionTokenHash` to a client — the
 *  first two are AES-256-GCM ciphertext and the third a SHA-256 hash, harmless in isolation, but
 *  there's no reason to put any of them on the wire at all. `memoryUsedBytes`/`memoryTotalBytes`
 *  are Prisma `BigInt`s (a real device's health check can report a memory size past Postgres's
 *  32-bit Int range) — native `JSON.stringify` has no BigInt support at all, so this was a
 *  latent 500 waiting for the first router that ever actually connected and reported real
 *  memory stats. Converting to `Number` here is safe: even a device with gigabytes of RAM stays
 *  many orders of magnitude under Number.MAX_SAFE_INTEGER measured in bytes. */
function toRouterSummary(router: RouterRow) {
  const { usernameEncrypted: _u, passwordEncrypted: _p, provisionTokenHash: _t, ...summary } = router;
  return {
    ...summary,
    memoryUsedBytes: summary.memoryUsedBytes === null ? null : Number(summary.memoryUsedBytes),
    memoryTotalBytes: summary.memoryTotalBytes === null ? null : Number(summary.memoryTotalBytes),
  };
}

function parseRouterUptime(uptimeStr: string): number {
  const trimmed = uptimeStr.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  let totalSeconds = 0;
  const weeks = trimmed.match(/(\d+)w/);
  if (weeks && weeks[1]) totalSeconds += parseInt(weeks[1], 10) * 7 * 86400;
  const days = trimmed.match(/(\d+)d/);
  if (days && days[1]) totalSeconds += parseInt(days[1], 10) * 86400;
  const timeMatch = trimmed.match(/(?:^|[a-z])(\d{1,2}):(\d{2}):(\d{2})$/);
  if (timeMatch && timeMatch[1] && timeMatch[2] && timeMatch[3]) {
    totalSeconds += parseInt(timeMatch[1], 10) * 3600 + parseInt(timeMatch[2], 10) * 60 + parseInt(timeMatch[3], 10);
  }
  return totalSeconds > 0 ? totalSeconds : 60;
}

export async function routerRoutes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser(
    ["application/x-www-form-urlencoded", "text/plain", "application/octet-stream", "*"],
    { parseAs: "string" },
    (_request, body, done) => {
      done(null, typeof body === "string" ? body : "");
    }
  );

  app.get(
    "/",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const routers = await listRouters(tenantId);
      reply.send(successResponse(routers.map(toRouterSummary), request.id));
    }
  );

  app.post(
    "/",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const body = createRouterSchema.parse(request.body);
      await assertWithinPlanLimit(tenantId, "routers");
      const router = await createRouter(tenantId, body);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "router.created",
        resourceType: "Router",
        resourceId: router.id,
        after: toRouterSummary(router),
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.status(201).send(successResponse(toRouterSummary(router), request.id));
    }
  );

  /** Script-first linking: creates a router with generated credentials and no known address —
   *  the admin only ever names it. Pair with GET /:routerId/provisioning-script and the public
   *  POST /provision/:token/callback below. */
  app.post(
    "/pending",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const body = createPendingRouterSchema.parse(request.body);
      await assertWithinPlanLimit(tenantId, "routers");
      const { router, provisionToken } = await createPendingRouter(tenantId, body.name);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "router.pending_created",
        resourceType: "Router",
        resourceId: router.id,
        after: toRouterSummary(router),
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      // The only point in this router's lifetime the raw provisioning token is available — from
      // here on only its hash is stored, same one-time-reveal pattern as an API key.
      reply.status(201).send(successResponse({ ...toRouterSummary(router), provisionToken }, request.id));
    }
  );

  /** Reveals the ready-to-paste RouterOS script for a pending router — sensitive (it carries the
   *  router's generated API password and provisioning token), so it's audit-logged the same way
   *  the RADIUS setup script and password reveals are. */
  app.get(
    "/:routerId/provisioning-script",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { routerId } = idParamsSchema.parse(request.params);
      const router = await getRouterOrThrow(tenantId, routerId);
      if (!router.provisionTokenHash) {
        throw new ConflictError(
          `"${router.name}" was linked manually and has no provisioning script — remove and re-add it to use the script-first flow.`
        );
      }

      const { provisionToken } = provisioningScriptQuerySchema.parse(request.query);
      const managementSource = env.ROUTER_MANAGEMENT_SOURCE || "68.210.187.104";
      const vpnIp = await ensureRouterVpnIp(router.id);

      let serverPublicKey = env.WIREGUARD_SERVER_PUBLIC_KEY;
      if (!serverPublicKey) {
        try {
          const { execFileSync } = await import("node:child_process");
          serverPublicKey = execFileSync("wg", ["show", env.WIREGUARD_INTERFACE, "public-key"], {
            encoding: "utf-8",
          }).trim();
        } catch {
          serverPublicKey = "";
        }
      }

      const serverHost = env.WIREGUARD_SERVER_ENDPOINT
        ? (env.WIREGUARD_SERVER_ENDPOINT.includes(":") ? env.WIREGUARD_SERVER_ENDPOINT.split(":")[0] : env.WIREGUARD_SERVER_ENDPOINT)
        : "68.210.187.104";

      const credentials = await getGeneratedCredentials(tenantId, routerId);
      const callbackUrl = `${env.APP_API_PUBLIC_URL}/api/v1/routers/provision/${provisionToken}/callback`;
      // No "demo-isp" fallback: the slug decides which tenant's captive portal this router
      // sends its customers to, so guessing it would quietly provision a router to serve
      // ANOTHER tenant's branding, packages and payment accounts. Failing loudly is the only
      // safe behaviour when we cannot tell whose router this is.
      const tenantSlug = request.tenantCtx?.slug;
      if (!tenantSlug) {
        throw new ConflictError("Could not determine this tenant's portal address — reload the dashboard and try again.");
      }
      const loginTemplateUrl = `${env.APP_API_PUBLIC_URL}/api/v1/hotspot/${tenantSlug}/mikrotik-login-template`;

      const script = buildMikrotikProvisioningScript(router, credentials, callbackUrl, {
        radiusHost: process.env.RADIUS_SERVER_HOST || "68.210.187.104",
        managementSource,
        serverPublicKey,
        serverHost,
        serverPort: env.WIREGUARD_LISTEN_PORT || 51820,
        vpnIp,
        loginTemplateUrl,
        portalHost: env.APP_WEB_URL,
        portalDomains: await getTenantPortalDomains(tenantId),
      });

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "router.provisioning_script_revealed",
        resourceType: "Router",
        resourceId: router.id,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      const fetchCommand = `/tool fetch url="${env.APP_API_PUBLIC_URL}/api/v1/routers/provision/${provisionToken}/setup.rsc" dst-path=setup.rsc; :delay 2s; /import setup.rsc;`;
      reply.send(successResponse({ script, fetchCommand, oneLiner: fetchCommand }, request.id));
    }
  );

  app.get(
    "/:routerId",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { routerId } = idParamsSchema.parse(request.params);
      const router = await getRouterOrThrow(tenantId, routerId);
      reply.send(successResponse(toRouterSummary(router), request.id));
    }
  );

  app.patch(
    "/:routerId",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { routerId } = idParamsSchema.parse(request.params);
      const body = updateRouterSchema.parse(request.body);
      const before = await getRouterOrThrow(tenantId, routerId);
      const after = await updateRouter(tenantId, routerId, body);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "router.updated",
        resourceType: "Router",
        resourceId: routerId,
        before: toRouterSummary(before),
        after: toRouterSummary(after),
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(toRouterSummary(after), request.id));
    }
  );

  app.delete(
    "/:routerId",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { routerId } = idParamsSchema.parse(request.params);
      await getRouterOrThrow(tenantId, routerId);
      await deleteRouter(tenantId, routerId);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "router.deleted",
        resourceType: "Router",
        resourceId: routerId,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse({ deleted: true }, request.id));
    }
  );

  app.post(
    "/:routerId/test-connection",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { routerId } = idParamsSchema.parse(request.params);
      const health = await testRouterConnection(tenantId, routerId);
      // Same BigInt-can't-JSON.stringify issue as toRouterSummary above — DeviceHealth carries
      // the same raw bigint fields straight from the adapter, not just the persisted Router row.
      reply.send(
        successResponse(
          {
            ...health,
            memoryUsedBytes: health.memoryUsedBytes === undefined ? undefined : Number(health.memoryUsedBytes),
            memoryTotalBytes: health.memoryTotalBytes === undefined ? undefined : Number(health.memoryTotalBytes),
          },
          request.id
        )
      );
    }
  );

  /** Reveals a real, deployable RouterOS setup script (and the matching FreeRADIUS `client {}`
   *  snippet) — sensitive enough (it carries the RADIUS shared secret) to be audit-logged the
   *  same way the RADIUS password reveal is. */
  app.get(
    "/:routerId/setup-script",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { routerId } = idParamsSchema.parse(request.params);
      const { radiusHost } = setupScriptQuerySchema.parse(request.query);
      const router = await getRouterOrThrow(tenantId, routerId);
      if (!router.host) {
        throw new ConflictError(
          `"${router.name}" hasn't checked in yet — paste the provisioning script on the router first, or link it manually.`
        );
      }
      const nas = await getOrCreateNasForRouter(tenantId, { ...router, host: router.host });
      const script = buildMikrotikSetupScript({ ...router, host: router.host }, nas, radiusHost);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "router.setup_script_revealed",
        resourceType: "Router",
        resourceId: router.id,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(script, request.id));
    }
  );

  /** Reveals the RouterOS script that turns on an actual hotspot captive-portal server — see
   *  buildMikrotikHotspotScript's doc comment for why this is a separate script from the
   *  RADIUS-only one above. Audit-logged the same way. */
  app.get(
    "/:routerId/hotspot-script",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { routerId } = idParamsSchema.parse(request.params);
      const { interfaceName, addressPoolName, radiusHost } = hotspotScriptQuerySchema.parse(request.query);
      const router = await getRouterOrThrow(tenantId, routerId);
      if (!router.host) {
        throw new ConflictError(
          `"${router.name}" hasn't checked in yet — paste the provisioning script on the router first, or link it manually.`
        );
      }

      const nas = await getOrCreateNasForRouter(tenantId, { ...router, host: router.host });
      const tenantSlug = request.tenantCtx!.slug;
      const loginTemplateUrl = `${env.APP_API_PUBLIC_URL}/api/v1/hotspot/${tenantSlug}/mikrotik-login-template`;
      const platformHost = new URL(env.APP_API_PUBLIC_URL).hostname;
      const script = buildMikrotikHotspotScript(router, {
        interfaceName,
        addressPoolName,
        loginTemplateUrl,
        platformHost,
        radiusHost,
        nasSecret: nas.secret,
        portalDomains: await getTenantPortalDomains(tenantId),
      });

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "router.hotspot_script_revealed",
        resourceType: "Router",
        resourceId: router.id,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse({ script }, request.id));
    }
  );

  /** Step 1: issues a fresh registration token and hands back the paste-and-run script that
   *  makes the router generate its own keypair and call home with the public half. */
  app.post(
    "/:routerId/vpn-start",
    {
      config: { audience: "staff" },
      preHandler: [...preHandler, requirePermission("routers.manage")],
    },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { routerId } = idParamsSchema.parse(request.params);
      const { router, vpnRegisterToken } = await startVpnRegistration(tenantId, routerId);

      const callbackUrl = `${env.APP_API_PUBLIC_URL}/api/v1/routers/vpn/${vpnRegisterToken}/register-peer`;
      const script = buildMikrotikVpnStartScript(router, callbackUrl, env.WIREGUARD_LISTEN_PORT);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "router.vpn_start_script_revealed",
        resourceType: "Router",
        resourceId: router.id,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse({ script }, request.id));
    }
  );

  /** Step 2: only buildable once the router has actually called back with its public key (see
   *  the public callback below) — the assigned tunnel IP it needs doesn't exist before that. */
  app.get(
    "/:routerId/vpn-complete-script",
    {
      config: { audience: "staff" },
      preHandler: [...preHandler, requirePermission("routers.manage")],
    },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { routerId } = idParamsSchema.parse(request.params);
      const router = await getRouterOrThrow(tenantId, routerId);
      if (!router.vpnIp) {
        throw new ConflictError(
          `"${router.name}" hasn't checked back in with a WireGuard key yet — run the step-1 script first.`
        );
      }

      let serverPublicKey = env.WIREGUARD_SERVER_PUBLIC_KEY;
      if (!serverPublicKey) {
        try {
          const { execFileSync } = await import("node:child_process");
          serverPublicKey = execFileSync("wg", ["show", env.WIREGUARD_INTERFACE, "public-key"], {
            encoding: "utf-8",
          }).trim();
        } catch {
          serverPublicKey = "";
        }
      }

      const script = buildMikrotikVpnCompleteScript({
        serverPublicKey,
        serverEndpoint: env.WIREGUARD_SERVER_ENDPOINT || "68.210.187.104:51820",
        serverListenPort: env.WIREGUARD_LISTEN_PORT,
        assignedVpnIp: router.vpnIp,
      });

      reply.send(successResponse({ script }, request.id));
    }
  );

  app.get(
    "/:routerId/sessions",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.read")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { routerId } = idParamsSchema.parse(request.params);
      const sessions = await getRouterActiveSessions(tenantId, routerId);
      reply.send(successResponse(sessions, request.id));
    }
  );

  /** Bulk maintenance/incident-response action, not a routine one — requires the same
   *  `routers.manage` permission as deleting a router, not just `routers.read`. */
  app.post(
    "/:routerId/kick-all-sessions",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { routerId } = idParamsSchema.parse(request.params);
      const router = await getRouterOrThrow(tenantId, routerId);
      const removed = await disconnectAllRouterSessions(tenantId, routerId);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "router.all_sessions_kicked",
        resourceType: "Router",
        resourceId: router.id,
        after: { removed },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse({ removed }, request.id));
    }
  );

  app.post(
    "/:routerId/apply-speedtest-boost",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { routerId } = idParamsSchema.parse(request.params);
      const result = await applyRouterSpeedtestBoost(tenantId, routerId);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "router.speedtest_boost_applied",
        resourceType: "Router",
        resourceId: routerId,
        after: result,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(result, request.id));
    }
  );

  app.post(
    "/:routerId/enforce-strict-timeout",
    { config: { audience: "staff" }, preHandler: [...preHandler, requirePermission("routers.manage")] },
    async (request, reply) => {
      const tenantId = requireTenant(request.user!.tenantId);
      const { routerId } = idParamsSchema.parse(request.params);
      const result = await enforceRouterStrictTimeout(tenantId, routerId);

      await writeAuditLog({
        tenantId,
        actorUserId: request.user!.id,
        action: "router.strict_timeout_enforced",
        resourceType: "Router",
        resourceId: routerId,
        after: result,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(result, request.id));
    }
  );

function getClientIp(request: { headers: Record<string, string | string[] | undefined>; ip: string }): string {
  const cfIp = request.headers["cf-connecting-ip"];
  if (typeof cfIp === "string" && cfIp.trim().length > 0) {
    return cfIp.trim();
  }
  const xRealIp = request.headers["x-real-ip"];
  if (typeof xRealIp === "string" && xRealIp.trim().length > 0) {
    return xRealIp.trim();
  }
  const xForwardedFor = request.headers["x-forwarded-for"];
  if (typeof xForwardedFor === "string" && xForwardedFor.trim().length > 0) {
    const first = xForwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.ip;
}

  // --- Public callback (the router itself, via /tool fetch in the provisioning script) —
  // audience "system-critical" bypasses maintenance mode (a router mid-provisioning shouldn't
  // silently fail to link just because maintenance mode is on) and carries no staff auth, since
  // RouterOS cannot send our bearer tokens. The provisioning token in the URL *is* the auth: it
  // was generated per-router and is only ever known to whoever pasted the script. -------------
  /**
   * 1-Line Remote Provisioning Fetcher:
   * /tool fetch url="https://api.mashuphost.tech/api/v1/routers/provision/<token>/setup.rsc" dst-path=setup.rsc; :delay 2s; /import setup.rsc;
   * Serves the generated .rsc script dynamically to the MikroTik router.
   */
  app.get("/provision/:token/setup.rsc", { config: { audience: "system-critical" } }, async (request, reply) => {
    const { token } = provisionCallbackParamsSchema.parse(request.params);
    const router = await prisma.router.findFirst({
      where: { provisionTokenHash: hashToken(token), deletedAt: null },
      include: { tenant: true },
    });
    if (!router) {
      reply.status(404).header("Content-Type", "text/plain").send("# Error: Invalid or expired provisioning token\n");
      return;
    }

    const managementSource = env.ROUTER_MANAGEMENT_SOURCE || "68.210.187.104";
    const vpnIp = await ensureRouterVpnIp(router.id);

    let serverPublicKey = env.WIREGUARD_SERVER_PUBLIC_KEY;
    if (!serverPublicKey) {
      try {
        const { execFileSync } = await import("node:child_process");
        serverPublicKey = execFileSync("wg", ["show", env.WIREGUARD_INTERFACE, "public-key"], {
          encoding: "utf-8",
        }).trim();
      } catch {
        serverPublicKey = "";
      }
    }

    const serverHost = env.WIREGUARD_SERVER_ENDPOINT
      ? (env.WIREGUARD_SERVER_ENDPOINT.includes(":") ? env.WIREGUARD_SERVER_ENDPOINT.split(":")[0] : env.WIREGUARD_SERVER_ENDPOINT)
      : "68.210.187.104";

    const credentials = await getGeneratedCredentials(router.tenantId, router.id);
    const callbackUrl = `${env.APP_API_PUBLIC_URL}/api/v1/routers/provision/${token}/callback`;
    // Same reasoning as the provisioning-script route above — never guess the tenant.
    const tenantSlug = router.tenant?.slug;
    if (!tenantSlug) {
      reply.status(500).header("Content-Type", "text/plain").send("# Error: router is not linked to a tenant\n");
      return;
    }
    const loginTemplateUrl = `${env.APP_API_PUBLIC_URL}/api/v1/hotspot/${tenantSlug}/mikrotik-login-template`;

    const script = buildMikrotikProvisioningScript(router, credentials, callbackUrl, {
      radiusHost: process.env.RADIUS_SERVER_HOST || "68.210.187.104",
      managementSource,
      serverPublicKey,
      serverHost,
      serverPort: env.WIREGUARD_LISTEN_PORT || 51820,
      vpnIp,
      loginTemplateUrl,
      portalHost: env.APP_WEB_URL,
      portalDomains: await getTenantPortalDomains(router.tenantId),
    });

    reply.header("Content-Type", "text/plain; charset=utf-8").send(script);
  });

  app.get("/provision/:token/callback", { config: { audience: "system-critical" } }, async (request, reply) => {
    const remoteIp = getClientIp(request);
    reply.status(200).send({
      success: true,
      message: "Provisioning callback is online and active.",
      clientIp: remoteIp,
    });
  });

  app.post("/provision/:token/callback", { config: { audience: "system-critical" } }, async (request, reply) => {
    const { token } = provisionCallbackParamsSchema.parse(request.params);
    const remoteIp = getClientIp(request);
    const query = (request.query as Record<string, unknown>) || {};
    let wgpubkey = typeof request.body === "string" ? request.body : "";
    if (!wgpubkey && typeof query === "object" && "wgpubkey" in query) {
      wgpubkey = String(query.wgpubkey || "");
    }
    wgpubkey = wgpubkey.replace(/["'\r\n]/g, "").trim().replace(/ /g, "+");

    const cpuStr = String(query.cpu || "");
    const uptimeStr = String(query.uptime || "");
    const freeMemStr = String(query.freemem || "");
    const totMemStr = String(query.totmem || "");

    const metrics: {
      cpuLoadPercent?: number;
      uptimeSeconds?: number;
      memoryUsedBytes?: bigint;
      memoryTotalBytes?: bigint;
    } = {};

    if (cpuStr && !isNaN(Number(cpuStr))) {
      metrics.cpuLoadPercent = Math.min(100, Math.max(0, Number(cpuStr)));
    }
    if (uptimeStr) {
      metrics.uptimeSeconds = parseRouterUptime(uptimeStr);
    }
    if (totMemStr && !isNaN(Number(totMemStr))) {
      const tot = BigInt(totMemStr);
      metrics.memoryTotalBytes = tot;
      if (freeMemStr && !isNaN(Number(freeMemStr))) {
        const free = BigInt(freeMemStr);
        metrics.memoryUsedBytes = tot > free ? tot - free : 0n;
      }
    }

    try {
      const router = await completeRouterProvisioning(token, remoteIp, wgpubkey || undefined, metrics);
      await writeAuditLog({
        tenantId: router.tenantId,
        action: "router.provisioned_via_callback",
        resourceType: "Router",
        resourceId: router.id,
        after: { host: router.host, vpnIp: router.vpnIp },
        ipAddress: remoteIp,
        userAgent: request.headers["user-agent"] ?? null,
      });
      reply.status(200).send({ linked: true, host: router.host, vpnIp: router.vpnIp });
    } catch (err) {
      if (err instanceof NotFoundError) {
        reply.status(404).send({ linked: false, error: "Unknown or already-superseded provisioning token" });
        return;
      }
      throw err;
    }
  });

  /** Public callback for VPN step 1 — the router's own public key arrives as the raw POST body
   *  (see the content-type parser above and buildMikrotikVpnStartScript's doc comment for why),
   *  not a query parameter. A registration failure (e.g. `wg` unavailable on this deployment)
   *  surfaces as a real error in the response body rather than a silent 200, since — unlike the
   *  provisioning callback, where "money already moved" reasoning applies to M-Pesa but not
   *  here — there's no harm in the router's own log showing the fetch actually failed. */
  app.get("/vpn/:token/register-peer", { config: { audience: "system-critical" } }, async (request, reply) => {
    const { token } = provisionCallbackParamsSchema.parse(request.params);
    const pubkey = (request.query as Record<string, string | undefined>)?.pubkey || "";
    if (!pubkey) {
      reply.status(200).send({
        success: true,
        message: "VPN register-peer endpoint is online. Provide public key via POST body or ?pubkey=",
      });
      return;
    }
    const cleanKey = pubkey.replace(/["'\r\n]/g, "").trim().replace(/ /g, "+");
    try {
      const router = await completeVpnRegistration(token, cleanKey);
      reply.status(200).send({ registered: true, vpnIp: router.vpnIp });
    } catch (err) {
      if (err instanceof NotFoundError) {
        reply.status(404).send({ registered: false, error: "Unknown or already-superseded VPN registration token" });
        return;
      }
      throw err;
    }
  });

  app.post("/vpn/:token/register-peer", { config: { audience: "system-critical" } }, async (request, reply) => {
    const { token } = provisionCallbackParamsSchema.parse(request.params);
    let publicKey = typeof request.body === "string" ? request.body : "";
    if (!publicKey && typeof request.query === "object" && request.query && "pubkey" in request.query) {
      publicKey = String((request.query as Record<string, unknown>).pubkey || "");
    }
    publicKey = publicKey.replace(/["'\r\n]/g, "").trim().replace(/ /g, "+");
    if (!publicKey) {
      reply.status(400).send({ registered: false, error: "Missing WireGuard public key in request body or query" });
      return;
    }

    try {
      const router = await completeVpnRegistration(token, publicKey);
      await writeAuditLog({
        tenantId: router.tenantId,
        action: "router.vpn_peer_registered",
        resourceType: "Router",
        resourceId: router.id,
        after: { vpnIp: router.vpnIp },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });
      reply.status(200).send({ registered: true, vpnIp: router.vpnIp });
    } catch (err) {
      if (err instanceof NotFoundError) {
        reply.status(404).send({ registered: false, error: "Unknown or already-superseded VPN registration token" });
        return;
      }
      throw err;
    }
  });
}
