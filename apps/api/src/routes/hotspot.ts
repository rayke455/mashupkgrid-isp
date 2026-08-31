import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import { activateVoucher, authenticateHotspotAccount, listHotspotPackages } from "@mashupkgrid/radius";
import { createTicket } from "@mashupkgrid/support";
import {
  initiateHotspotPurchaseStkPush,
  queryAndReconcileStkRequest,
  initiatePaystackHotspotPurchase,
  verifyAndReconcilePaystackTransaction,
  initiatePesapalHotspotPurchase,
  verifyAndReconcilePesapalTransaction,
} from "@mashupkgrid/payments";
import { successResponse, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@mashupkgrid/shared";
import { env } from "@mashupkgrid/config";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { requirePermission } from "../plugins/authorize.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { hotspotLoginRateLimitConfig } from "../plugins/rate-limit.js";
import { resolveTenantBySlug } from "../services/auth.service.js";

const tenantParamsSchema = z.object({ tenantSlug: z.string().min(1) });
const loginBodySchema = z.object({ code: z.string().min(1).max(32) });
const accountLoginBodySchema = z.object({ phone: z.string().min(9), password: z.string().min(1) });
const supportTicketBodySchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().min(9).max(32).optional(),
  email: z.string().email().optional(),
  message: z.string().min(1).max(2000),
});
const purchaseBodySchema = z.object({
  hotspotPackageId: z.string().uuid(),
  phone: z.string().min(9),
  email: z.string().email().optional(),
  method: z.enum(["MPESA", "PAYSTACK", "PESAPAL"]).default("MPESA"),
  // Only meaningful for PAYSTACK/PESAPAL — its checkout is a full off-site redirect, so the router's
  // link-login-only URL (otherwise just a query param the page already has) would be lost the
  // moment the browser leaves for Paystack/Pesapal, unless it's captured here and carried through the
  // transaction row instead (see initiatePaystackHotspotPurchase / paystack.ts's /return route).
  linkLoginOnly: z.string().url().optional(),
});
const statusParamsSchema = z.object({
  tenantSlug: z.string().min(1),
  checkoutRequestId: z.string().min(1),
});
const paystackStatusParamsSchema = z.object({
  tenantSlug: z.string().min(1),
  reference: z.string().min(1),
});

/**
 * Per-tenant captive-portal branding. Backed by the `captive_portal_configs` table (one row per
 * tenant, see packages/database/prisma/schema.prisma) rather than a JSON file on disk, which is
 * what it used to be. The file store cost three separate defects: the slug went into a
 * filesystem path and needed its own traversal guard, the write endpoint was unauthenticated,
 * and the directory had no volume in production so every deploy silently restored a stale copy
 * baked into the image. A tenant-scoped row removes all three by construction.
 */
export interface CaptivePortalConfig {
  phone: string;
  supportPhone: string;
  brandName: string;
  welcomeTitle: string;
  bannerSubtitle: string;
  activeThemeId: string;
  installationFee?: string;
  fiberRates?: Array<{ speed: string; price: string; subtitle?: string }>;
}

const DEFAULT_CAPTIVE_CONFIG: CaptivePortalConfig = {
  phone: "0724 165 988",
  supportPhone: "0724 165 988",
  brandName: "SUNTECH FIBRE",
  welcomeTitle: "FAST & SECURE WI-FI",
  bannerSubtitle: "HIGH SPEED FIBER CONNECTION",
  activeThemeId: "suntech-blue",
  installationFee: "1,500/-",
  fiberRates: [
    { speed: "10MBPS", price: "1,500/-", subtitle: "Unlimited Home" },
    { speed: "15MBPS", price: "2,000/-", subtitle: "Streaming Plus" },
    { speed: "20MBPS", price: "2,500/-", subtitle: "Pro Business" },
    { speed: "30MBPS", price: "3,000/-", subtitle: "Ultra Turbo" },
  ],
};

/** Every column is nullable, so an unset field falls back to the shared default rather than
 *  rendering an empty portal. A tenant with no row at all gets the defaults with its own name
 *  as the brand, which is what a freshly-created tenant should show before anyone customizes. */
function toCaptiveConfig(
  row: {
    phone: string | null;
    supportPhone: string | null;
    brandName: string | null;
    welcomeTitle: string | null;
    bannerSubtitle: string | null;
    activeThemeId: string | null;
    installationFee: string | null;
    fiberRates: unknown;
  } | null,
  tenantName?: string
): CaptivePortalConfig {
  if (!row) {
    return { ...DEFAULT_CAPTIVE_CONFIG, brandName: tenantName || DEFAULT_CAPTIVE_CONFIG.brandName };
  }
  return {
    phone: row.phone ?? DEFAULT_CAPTIVE_CONFIG.phone,
    supportPhone: row.supportPhone ?? DEFAULT_CAPTIVE_CONFIG.supportPhone,
    brandName: row.brandName ?? tenantName ?? DEFAULT_CAPTIVE_CONFIG.brandName,
    welcomeTitle: row.welcomeTitle ?? DEFAULT_CAPTIVE_CONFIG.welcomeTitle,
    bannerSubtitle: row.bannerSubtitle ?? DEFAULT_CAPTIVE_CONFIG.bannerSubtitle,
    activeThemeId: row.activeThemeId ?? DEFAULT_CAPTIVE_CONFIG.activeThemeId,
    installationFee: row.installationFee ?? DEFAULT_CAPTIVE_CONFIG.installationFee,
    fiberRates: (row.fiberRates as CaptivePortalConfig["fiberRates"]) ?? DEFAULT_CAPTIVE_CONFIG.fiberRates,
  };
}

async function loadTenantCaptiveConfig(tenantId: string, tenantName?: string): Promise<CaptivePortalConfig> {
  const row = await prisma.captivePortalConfig.findUnique({ where: { tenantId } });
  return toCaptiveConfig(row, tenantName);
}

async function saveTenantCaptiveConfig(
  tenantId: string,
  tenantName: string,
  patch: Partial<CaptivePortalConfig>
): Promise<CaptivePortalConfig> {
  // Upsert with only the supplied keys: a caller editing one field must not blank out the rest,
  // which is the same partial-merge behaviour the file store had.
  const data = {
    ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
    ...(patch.supportPhone !== undefined ? { supportPhone: patch.supportPhone } : {}),
    ...(patch.brandName !== undefined ? { brandName: patch.brandName } : {}),
    ...(patch.welcomeTitle !== undefined ? { welcomeTitle: patch.welcomeTitle } : {}),
    ...(patch.bannerSubtitle !== undefined ? { bannerSubtitle: patch.bannerSubtitle } : {}),
    ...(patch.activeThemeId !== undefined ? { activeThemeId: patch.activeThemeId } : {}),
    ...(patch.installationFee !== undefined ? { installationFee: patch.installationFee } : {}),
    ...(patch.fiberRates !== undefined ? { fiberRates: patch.fiberRates } : {}),
  };
  const row = await prisma.captivePortalConfig.upsert({
    where: { tenantId },
    create: { tenantId, ...data },
    update: data,
  });
  return toCaptiveConfig(row, tenantName);
}

// Every field is length-bounded: this config is written verbatim to a JSON file on disk and
// rendered straight onto the public captive portal, so an unbounded string here is both an
// unbounded disk write and an unbounded payload served to every visitor of that portal.
const updateConfigSchema = z.object({
  phone: z.string().max(40).optional(),
  supportPhone: z.string().max(40).optional(),
  brandName: z.string().max(80).optional(),
  welcomeTitle: z.string().max(120).optional(),
  bannerSubtitle: z.string().max(200).optional(),
  activeThemeId: z.string().max(64).optional(),
  installationFee: z.string().max(40).optional(),
  fiberRates: z
    .array(
      z.object({
        speed: z.string().max(40),
        price: z.string().max(40),
        subtitle: z.string().max(80).optional(),
      })
    )
    .max(24)
    .optional(),
});

/**
 * The public captive-portal surface — a WiFi customer's device is redirected here by the
 * router's hotspot walled garden, before any login exists. No `authenticate` preHandler
 * anywhere in this file is deliberate, not an oversight: this is the one part of the platform
 * genuinely meant to be used by someone with no account.
 */
export async function hotspotRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/:tenantSlug/info",
    { config: { audience: "customer" }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      const { tenantSlug } = tenantParamsSchema.parse(request.params);
      const tenant = await resolveTenantBySlug(tenantSlug);
      const config = await loadTenantCaptiveConfig(tenant.id, tenant.name);

      reply.send(
        successResponse(
          {
            name: config.brandName || tenant.name,
            brandName: config.brandName || tenant.name,
            phone: config.phone,
            supportPhone: config.supportPhone,
            welcomeTitle: config.welcomeTitle,
            bannerSubtitle: config.bannerSubtitle,
            activeThemeId: config.activeThemeId,
            installationFee: config.installationFee,
            fiberRates: config.fiberRates,
          },
          request.id
        )
      );
    }
  );

  app.get(
    "/:tenantSlug/config",
    { config: { audience: "customer" }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      const { tenantSlug } = tenantParamsSchema.parse(request.params);
      const tenant = await resolveTenantBySlug(tenantSlug);
      const config = await loadTenantCaptiveConfig(tenant.id, tenant.name);
      reply.send(successResponse(config, request.id));
    }
  );

  /**
   * The one WRITE on this otherwise-public router, and the only route in this file that is not
   * meant for an anonymous visitor. It previously carried `audience: "public"` and no preHandler
   * at all, which made every tenant's captive-portal branding world-writable: anyone on the
   * internet could PUT a new support phone number, brand name, and price list onto any ISP's
   * portal — a ready-made phishing page served from the ISP's own address, plus an unbounded
   * write of a `<slug>.json` file for tenant slugs that don't even exist. Staff auth, tenant
   * ownership, and `settings.manage` are all required now; the slug in the path must be the
   * caller's own tenant, so a signed-in staff member of tenant A still can't rewrite tenant B.
   */
  app.put(
    "/:tenantSlug/config",
    {
      config: { audience: "staff" },
      preHandler: [authenticate, resolveTenant, checkMaintenance, requirePermission("settings.manage")],
    },
    async (request, reply) => {
      const { tenantSlug } = tenantParamsSchema.parse(request.params);
      const body = updateConfigSchema.parse(request.body);

      const caller = request.tenantCtx;
      if (!caller) {
        throw new ConflictError("Platform administration has no captive portal of its own");
      }
      if (caller.slug.toLowerCase() !== tenantSlug.toLowerCase()) {
        throw new ForbiddenError("You can only edit your own tenant's captive portal");
      }

      // Keyed by the caller's own tenant id from the verified session, never by the slug in the
      // path — the ownership check above rejects a mismatch, and the id is what the row is
      // actually keyed on, so there is no way for the two to drift apart.
      const updated = await saveTenantCaptiveConfig(caller.id, caller.name, body);
      reply.send(successResponse(updated, request.id));
    }
  );

  /**
   * Public discovery endpoint reporting which payment methods are enabled for this tenant.
   */
  app.get(
    "/:tenantSlug/payment-methods",
    { config: { audience: "customer" }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      const { tenantSlug } = tenantParamsSchema.parse(request.params);
      const tenant = await resolveTenantBySlug(tenantSlug);

      const configs = await prisma.paymentProviderConfig.findMany({
        where: { tenantId: tenant.id, isActive: true },
      });

      const mpesa = configs.some((c) => c.provider === "MPESA");
      const paystackConfig = configs.find((c) => c.provider === "PAYSTACK");
      const pesapalConfig = configs.find((c) => (c.provider as string) === "PESAPAL");

      reply.send(
        successResponse(
          {
            mpesa,
            paystack: !!paystackConfig,
            paystackPublicKey: paystackConfig?.publicKey ?? null,
            pesapal: !!pesapalConfig,
            pesapalConsumerKey: pesapalConfig?.publicKey ?? null,
          },
          request.id
        )
      );
    }
  );

  /**
   * Public discovery endpoint for the Tawk.to widget — only ever reveals the widgetId when the
   * tenant has both switched it on AND opted it into this specific surface, never the raw config
   * row (an anonymous captive-portal visitor has no business seeing showOnDashboard etc).
   */
  app.get(
    "/:tenantSlug/live-chat",
    { config: { audience: "customer" }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      const { tenantSlug } = tenantParamsSchema.parse(request.params);
      const tenant = await resolveTenantBySlug(tenantSlug);
      const config = await prisma.liveChatConfig.findUnique({ where: { tenantId: tenant.id } });

      const featureDisabled = tenant.disabledFeatures.includes("LIVE_CHAT");
      const show = !!(config?.isActive && config.showOnHotspotPortal && config.widgetId && !featureDisabled);
      reply.send(successResponse({ show, widgetId: show ? config!.widgetId : null }, request.id));
    }
  );

  /**
   * A walk-in hotspot customer reporting an issue has no account at all — this is the "no
   * account, no login" counterpart to the staff-created and /me/tickets flows, identified only by
   * whatever contact details they choose to give. Rate-limited the same as login, for the same
   * reason: it's a public, unauthenticated write.
   */
  app.post(
    "/:tenantSlug/support-ticket",
    {
      config: { audience: "customer", rateLimit: hotspotLoginRateLimitConfig },
      preHandler: [checkMaintenance],
    },
    async (request, reply) => {
      const { tenantSlug } = tenantParamsSchema.parse(request.params);
      const body = supportTicketBodySchema.parse(request.body);
      const tenant = await resolveTenantBySlug(tenantSlug);

      const ticket = await createTicket(tenant.id, {
        contactName: body.name,
        contactPhone: body.phone,
        contactEmail: body.email,
        subject: `Hotspot support request from ${body.name}`,
        body: body.message,
        source: "HOTSPOT_PORTAL",
      });

      reply.status(201).send(successResponse({ id: ticket.id, status: ticket.status }, request.id));
    }
  );

  /**
   * Public endpoint listing available packages for online purchase on the captive portal.
   */
  app.get(
    "/:tenantSlug/packages",
    { config: { audience: "customer" }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      const { tenantSlug } = tenantParamsSchema.parse(request.params);
      const tenant = await resolveTenantBySlug(tenantSlug);
      const packages = await listHotspotPackages(tenant.id, true);
      reply.send(successResponse(packages, request.id));
    }
  );

  /**
   * Initiates an online purchase for a hotspot package (via M-Pesa STK or Paystack).
   */
  app.post(
    "/:tenantSlug/purchase",
    {
      config: { audience: "customer", rateLimit: hotspotLoginRateLimitConfig },
      preHandler: [checkMaintenance],
    },
    async (request, reply) => {
      const { tenantSlug } = tenantParamsSchema.parse(request.params);
      const body = purchaseBodySchema.parse(request.body);
      const tenant = await resolveTenantBySlug(tenantSlug);

      if (body.method === "PAYSTACK") {
        const email = body.email?.trim();
        if (!email) {
          throw new ValidationError("An email address is required to pay by card/bank — please enter one");
        }

        const result = await initiatePaystackHotspotPurchase(tenant.id, {
          hotspotPackageId: body.hotspotPackageId,
          email,
          phone: body.phone,
          linkLoginOnly: body.linkLoginOnly,
        });

        reply.status(201).send(
          successResponse(
            {
              method: "PAYSTACK",
              reference: result.transaction.reference,
              authorizationUrl: result.authorizationUrl,
              status: result.transaction.status,
              amountMinor: result.transaction.amountMinor,
            },
            request.id
          )
        );
        return;
      }

      if (body.method === "PESAPAL") {
        const email = body.email?.trim() || `guest-${body.phone}@hotspot.local`;
        const result = await initiatePesapalHotspotPurchase(tenant.id, {
          hotspotPackageId: body.hotspotPackageId,
          email,
          phone: body.phone,
          linkLoginOnly: body.linkLoginOnly,
        });

        reply.status(201).send(
          successResponse(
            {
              method: "PESAPAL",
              reference: result.transaction.reference,
              authorizationUrl: result.redirectUrl,
              status: result.transaction.status,
              amountMinor: result.transaction.amountMinor,
            },
            request.id
          )
        );
        return;
      }

      // Default: M-Pesa STK Push
      const stkRequest = await initiateHotspotPurchaseStkPush(tenant.id, {
        hotspotPackageId: body.hotspotPackageId,
        phone: body.phone,
      });

      reply.status(201).send(
        successResponse(
          {
            method: "MPESA",
            checkoutRequestId: stkRequest.checkoutRequestId,
            status: stkRequest.status,
            amountMinor: stkRequest.amountMinor,
            phone: stkRequest.phone,
          },
          request.id
        )
      );
    }
  );

  /**
   * Polling endpoint for M-Pesa STK push.
   */
  app.get(
    "/:tenantSlug/purchase/:checkoutRequestId/status",
    { config: { audience: "customer" }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      const { tenantSlug, checkoutRequestId } = statusParamsSchema.parse(request.params);
      const tenant = await resolveTenantBySlug(tenantSlug);

      let req = await prisma.mpesaStkRequest.findFirst({
        where: { tenantId: tenant.id, checkoutRequestId },
      });
      if (!req) throw new NotFoundError("Payment request");

      if (req.status === "PENDING") {
        try {
          const res = await queryAndReconcileStkRequest(tenant.id, checkoutRequestId);
          req = res.request;
        } catch {
          // ignore query errors during polling
        }
      }

      reply.send(
        successResponse(
          {
            status: req.status,
            mpesaReceiptNumber: req.mpesaReceiptNumber,
            voucherCode: req.hotspotVoucherCode,
            resultDesc: req.resultDesc,
          },
          request.id
        )
      );
    }
  );

  /**
   * Polling endpoint for Paystack transaction on the captive portal.
   */
  app.get(
    "/:tenantSlug/purchase/paystack/:reference/status",
    { config: { audience: "customer" }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      const { tenantSlug, reference } = paystackStatusParamsSchema.parse(request.params);
      const tenant = await resolveTenantBySlug(tenantSlug);

      let req = await prisma.paystackTransaction.findFirst({
        where: { tenantId: tenant.id, reference },
      });
      if (!req) throw new NotFoundError("Payment request");

      if (req.status === "PENDING") {
        try {
          req = await verifyAndReconcilePaystackTransaction(tenant.id, reference);
        } catch {
          // ignore verify network blips during polling
        }
      }

      reply.send(
        successResponse(
          {
            status: req.status,
            voucherCode: req.hotspotVoucherCode,
            gatewayResponse: req.gatewayResponse,
            amountMinor: req.amountMinor,
          },
          request.id
        )
      );
    }
  );

  /**
   * Polling endpoint for Pesapal transaction on the captive portal.
   */
  app.get(
    "/:tenantSlug/purchase/pesapal/:reference/status",
    { config: { audience: "customer" }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      const { tenantSlug, reference } = paystackStatusParamsSchema.parse(request.params);
      const tenant = await resolveTenantBySlug(tenantSlug);

      let req = await prisma.paystackTransaction.findFirst({
        where: { tenantId: tenant.id, reference },
      });
      if (!req) throw new NotFoundError("Payment request");

      if (req.status === "PENDING") {
        try {
          req = await verifyAndReconcilePesapalTransaction(tenant.id, reference);
        } catch {
          // ignore verify network blips during polling
        }
      }

      reply.send(
        successResponse(
          {
            status: req.status,
            voucherCode: req.hotspotVoucherCode,
            gatewayResponse: req.gatewayResponse,
            amountMinor: req.amountMinor,
          },
          request.id
        )
      );
    }
  );

  /**
   * Served to a router, not a browser — this is what gets written onto the router's own flash
   * as hotspot/login.html (see buildMikrotikHotspotScript in @mashupkgrid/radius). RouterOS
   * substitutes its `$(...)` template variables when it serves this exact file to a connecting
   * client, so the literal tokens below must survive untouched — no client itself ever calls
   * this route directly, only the router's own hotspot HTTP server does, once, at write time
   * (`/tool fetch`), before ever handing it to a user.
   */
  app.get(
    "/:tenantSlug/mikrotik-login-template",
    { config: { audience: "customer" }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      const { tenantSlug } = tenantParamsSchema.parse(request.params);
      await resolveTenantBySlug(tenantSlug); // 404s early for an unknown tenant, same as /info

      const target =
        `${env.APP_WEB_URL}/hotspot/${tenantSlug}` +
        `?mac=$(mac)&ip=$(ip)&link-login-only=$(link-login-only-esc)&link-orig=$(link-orig-esc)&error=$(error-esc)`;

      reply
        .header("Content-Type", "text/html; charset=utf-8")
        .send(
          `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${target}"></head>` +
            `<body>Redirecting to your ISP's login page…</body></html>`
        );
    }
  );

  app.post(
    "/:tenantSlug/login",
    {
      config: { audience: "customer", rateLimit: hotspotLoginRateLimitConfig },
      preHandler: [checkMaintenance],
    },
    async (request, reply) => {
      const { tenantSlug } = tenantParamsSchema.parse(request.params);
      const { code } = loginBodySchema.parse(request.body);
      const tenant = await resolveTenantBySlug(tenantSlug);

      const voucher = await activateVoucher(tenant.id, code.trim().toUpperCase());

      if (voucher.status === "EXPIRED") {
        throw new ConflictError("This voucher has expired — please buy a new one");
      }
      if (voucher.status === "USED") {
        throw new ConflictError("This voucher has already been used up");
      }
      // ACTIVE covers both "just activated by this call" and "already active from an earlier
      // connect on the same code" — both are a legitimate "you're online" outcome for the user.

      reply.send(
        successResponse(
          {
            status: voucher.status,
            expiresAt: voucher.expiresAt,
            durationMinutes: voucher.durationMinutes,
            dataCapMb: voucher.dataCapMb,
          },
          request.id
        )
      );
    }
  );

  /** An existing subscriber logging into the hotspot with their normal PPPoE/RADIUS account —
   *  no voucher purchase needed. Their credentials already work for RADIUS auth at the router's
   *  own hotspot login form (same radcheck row PPPoE uses); this endpoint only confirms them
   *  and gives the captive-portal page something to show, mirroring the voucher flow above. */
  app.post(
    "/:tenantSlug/account-login",
    {
      config: { audience: "customer", rateLimit: hotspotLoginRateLimitConfig },
      preHandler: [checkMaintenance],
    },
    async (request, reply) => {
      const { tenantSlug } = tenantParamsSchema.parse(request.params);
      const { phone, password } = accountLoginBodySchema.parse(request.body);
      const tenant = await resolveTenantBySlug(tenantSlug);

      const radiusUser = await authenticateHotspotAccount(tenant.id, phone, password);

      reply.send(successResponse({ username: radiusUser.username }, request.id));
    }
  );
}
