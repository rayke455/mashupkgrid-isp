import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import { isProduction } from "@mashupkgrid/config";
import { successResponse, ValidationError } from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { requirePermission } from "../plugins/authorize.js";
import { authRateLimitConfig, otpRateLimitConfig } from "../plugins/rate-limit.js";
import { getCachedPermissions } from "../lib/permission-cache.js";
import * as authService from "../services/auth.service.js";
import { getPlatformGoogleAuthConfig, setPlatformGoogleAuthConfig } from "../services/google-auth-config.service.js";
import { writeAuditLog } from "../lib/audit.js";
import { normalizePhoneForOtp, requestWhatsappOtp, verifyWhatsappOtp, consumeWhatsappOtpTicket } from "../lib/whatsapp-otp.js";

const REFRESH_COOKIE = "refresh_token";
const REFRESH_COOKIE_PATH = "/api/v1/auth/refresh";

function setRefreshCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
    maxAge: 30 * 24 * 60 * 60,
  });
}

function clearRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
}

function deviceFromRequest(request: FastifyRequest) {
  return { ipAddress: request.ip, userAgent: request.headers["user-agent"] ?? null };
}

const registerSchema = z.object({
  tenantSlug: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(10),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  tenantSlug: z.string().min(1).nullable().optional(),
  email: z.string().email(),
  password: z.string().min(1),
});

const emailOnlySchema = z.object({ tenantSlug: z.string().min(1), email: z.string().email() });

const googleAuthSchema = z.object({ tenantSlug: z.string().optional().default(""), credential: z.string().min(1) });

const verifyEmailSchema = z.object({ token: z.string().min(1) });

const resetPasswordSchema = z.object({ token: z.string().min(1), password: z.string().min(10) });

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/register",
    { config: { audience: "public" }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      const body = registerSchema.parse(request.body);
      const { user, session } = await authService.registerCustomer(body, deviceFromRequest(request));

      // Auto-verified accounts (no SMTP configured — see packages/auth/src/registration.ts)
      // get a session immediately, exactly like /login, so the client can go straight to the
      // dashboard instead of making a separate request against the tightly rate-limited
      // /auth/login endpoint right after registering.
      if (session) {
        setRefreshCookie(reply, session.refreshToken);
      }

      reply.status(201).send(
        successResponse(
          {
            id: user.id,
            email: user.email,
            status: user.status,
            accessToken: session?.accessToken ?? null,
            expiresInSeconds: session?.expiresInSeconds ?? null,
          },
          request.id
        )
      );
    }
  );

  app.post(
    "/login",
    {
      config: { audience: "public", maintenanceCategory: "login", rateLimit: authRateLimitConfig },
      preHandler: [checkMaintenance],
    },
    async (request, reply) => {
      const body = loginSchema.parse(request.body);
      const device = deviceFromRequest(request);
      const result = await authService.login(
        { tenantSlug: body.tenantSlug ?? null, email: body.email, password: body.password },
        device
      );
      setRefreshCookie(reply, result.refreshToken);
      reply.send(
        successResponse(
          {
            accessToken: result.accessToken,
            expiresInSeconds: result.expiresInSeconds,
            user: { id: result.user.id, email: result.user.email, tenantId: result.user.tenantId },
            suspiciousLogin: result.suspicious,
          },
          request.id
        )
      );
    }
  );

  /** Public discovery endpoint the login/register page checks before rendering a "Sign in with
   *  Google" button at all — never guess at whether it's configured client-side, and never leak
   *  anything beyond the (non-secret) Client ID itself. */
  app.get(
    "/google/config",
    { config: { audience: "public" }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      reply.send(successResponse(await getPlatformGoogleAuthConfig(), request.id));
    }
  );

  /** Super-admin-only write side of the same config — lets it be toggled/edited from the
   *  dashboard instead of editing .env and restarting the API. */
  app.put(
    "/google/config",
    { config: { audience: "platform" }, preHandler: [authenticate, resolveTenant, checkMaintenance, requirePermission("tenants.create")] },
    async (request, reply) => {
      const body = z.object({ clientId: z.string().min(1), isActive: z.boolean() }).parse(request.body);
      await setPlatformGoogleAuthConfig(body);

      await writeAuditLog({
        tenantId: null,
        actorUserId: request.user!.id,
        action: "platform_google_auth_config.updated",
        resourceType: "PlatformGoogleAuthConfig",
        after: { isActive: body.isActive },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      reply.send(successResponse(await getPlatformGoogleAuthConfig(), request.id));
    }
  );

  app.post(
    "/google",
    {
      config: { audience: "public", maintenanceCategory: "login", rateLimit: authRateLimitConfig },
      preHandler: [checkMaintenance],
    },
    async (request, reply) => {
      const body = googleAuthSchema.parse(request.body);
      const device = deviceFromRequest(request);
      const { user, tokens } = await authService.loginOrRegisterWithGoogle(body, device);
      setRefreshCookie(reply, tokens.refreshToken);
      reply.send(
        successResponse(
          {
            accessToken: tokens.accessToken,
            expiresInSeconds: tokens.expiresInSeconds,
            user: { id: user.id, email: user.email, tenantId: user.tenantId },
          },
          request.id
        )
      );
    }
  );

  app.post(
    "/refresh",
    { config: { audience: "public" }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      const token = request.cookies[REFRESH_COOKIE];
      if (!token) throw new ValidationError("Missing refresh token cookie");
      const result = await authService.refresh(token, deviceFromRequest(request));
      setRefreshCookie(reply, result.refreshToken);
      reply.send(
        successResponse({ accessToken: result.accessToken, expiresInSeconds: result.expiresInSeconds }, request.id)
      );
    }
  );

  app.post(
    "/logout",
    { config: { audience: "customer" }, preHandler: [authenticate, resolveTenant, checkMaintenance] },
    async (request, reply) => {
      const user = request.user!;
      await authService.logout(user.sessionId, {
        userId: user.id,
        tenantId: user.tenantId,
        ...deviceFromRequest(request),
      });
      clearRefreshCookie(reply);
      reply.send(successResponse({ loggedOut: true }, request.id));
    }
  );

  app.get(
    "/me",
    { config: { audience: "customer" }, preHandler: [authenticate, resolveTenant, checkMaintenance] },
    async (request, reply) => {
      // The frontend uses this to decide what UI to show (e.g. staff nav vs. customer-only
      // nav) — sourcing it from the same permission resolution the backend actually enforces
      // means the UI can never show a link the API would then 403 on, or hide one it would
      // actually allow.
      const [permissions, dbUser] = await Promise.all([
        getCachedPermissions(request.user!.id, request.user!.tenantId),
        prisma.user.findUnique({ where: { id: request.user!.id }, select: { email: true } }),
      ]);
      reply.send(
        successResponse(
          {
            user: { ...request.user, email: dbUser?.email ?? null, permissions: [...permissions] },
            tenant: request.tenantCtx,
          },
          request.id
        )
      );
    }
  );

  app.get(
    "/verify-email",
    { config: { audience: "public" }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      const query = verifyEmailSchema.parse(request.query);
      const user = await authService.verifyEmail(query.token, deviceFromRequest(request));
      reply.send(successResponse({ id: user.id, email: user.email, status: user.status }, request.id));
    }
  );

  app.post(
    "/resend-verification",
    {
      config: { audience: "public", rateLimit: otpRateLimitConfig },
      preHandler: [checkMaintenance],
    },
    async (request, reply) => {
      const body = emailOnlySchema.parse(request.body);
      await authService.resendVerification(body.tenantSlug, body.email);
      reply.send(successResponse({ sent: true }, request.id));
    }
  );

  app.post(
    "/forgot-password",
    {
      config: { audience: "public", rateLimit: otpRateLimitConfig },
      preHandler: [checkMaintenance],
    },
    async (request, reply) => {
      const body = emailOnlySchema.parse(request.body);
      await authService.forgotPassword(body.tenantSlug, body.email);
      reply.send(successResponse({ sent: true }, request.id));
    }
  );

  app.post(
    "/reset-password",
    { config: { audience: "public" }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      const body = resetPasswordSchema.parse(request.body);
      const user = await authService.completePasswordReset(
        body.token,
        body.password,
        deviceFromRequest(request)
      );
      reply.send(successResponse({ id: user.id, email: user.email }, request.id));
    }
  );

  const RESERVED_SLUGS = new Set([
    "api", "admin", "app", "auth", "superadmin", "demo", "test", "billing",
    "dashboard", "help", "status", "portal", "radius", "isp", "hotspot", "vouchers", "system", "support"
  ]);

  app.get(
    "/isp-registration/check-slug",
    { config: { audience: "public" }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      const query = z.object({ slug: z.string().min(1) }).parse(request.query);
      const cleanSlug = query.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");

      if (cleanSlug.length < 3) {
        return reply.send(successResponse({
          available: false,
          slug: cleanSlug,
          reason: "Must be at least 3 characters long.",
          suggestions: []
        }, request.id));
      }

      if (RESERVED_SLUGS.has(cleanSlug)) {
        return reply.send(successResponse({
          available: false,
          slug: cleanSlug,
          reason: "This address name is reserved.",
          suggestions: [`${cleanSlug}-isp`, `${cleanSlug}-telecom`, `${cleanSlug}-net`]
        }, request.id));
      }

      const existing = await prisma.tenant.findUnique({ where: { slug: cleanSlug } });
      if (existing) {
        return reply.send(successResponse({
          available: false,
          slug: cleanSlug,
          reason: "This name is already registered by another ISP.",
          suggestions: [`${cleanSlug}-isp`, `${cleanSlug}-telecom`, `${cleanSlug}-net`]
        }, request.id));
      }

      reply.send(successResponse({
        available: true,
        slug: cleanSlug,
        message: "Available — this will be your account address."
      }, request.id));
    }
  );

  // Scopes the OTP/ticket store (apps/api/src/lib/whatsapp-otp.ts) to this specific flow — a
  // code or ticket issued for ISP registration can't be replayed against some future unrelated
  // phone-verification use of the same helper.
  const WHATSAPP_OTP_PURPOSE = "isp_registration";

  const whatsappOtpPhoneSchema = z.object({ phone: z.string().min(8, "Enter a valid WhatsApp phone number") });

  app.post(
    "/isp-registration/whatsapp-otp/send",
    { config: { audience: "public", rateLimit: otpRateLimitConfig }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      const body = whatsappOtpPhoneSchema.parse(request.body);
      const phone = normalizePhoneForOtp(body.phone);
      await requestWhatsappOtp(phone, WHATSAPP_OTP_PURPOSE);
      reply.send(successResponse({ sent: true }, request.id));
    }
  );

  const whatsappOtpVerifySchema = z.object({
    phone: z.string().min(8),
    code: z.string().length(6, "Enter the 6-digit code"),
  });

  app.post(
    "/isp-registration/whatsapp-otp/verify",
    { config: { audience: "public", rateLimit: otpRateLimitConfig }, preHandler: [checkMaintenance] },
    async (request, reply) => {
      const body = whatsappOtpVerifySchema.parse(request.body);
      const phone = normalizePhoneForOtp(body.phone);
      const ticket = await verifyWhatsappOtp(phone, WHATSAPP_OTP_PURPOSE, body.code);
      reply.send(successResponse({ verified: true, ticket }, request.id));
    }
  );

  const ispRegistrationSchema = z.object({
    name: z.string().min(2, "Enter your full name"),
    company: z.string().min(2, "Enter your ISP / company name"),
    slug: z.string().min(3).max(30).regex(/^[a-z0-9-]+$/, "Slug must only contain lowercase letters, numbers, and dashes"),
    email: z.string().email("Enter a valid email address"),
    phone: z.string().min(8, "Enter a valid WhatsApp phone number"),
    phoneVerificationTicket: z.string().min(1, "Verify your WhatsApp code before continuing"),
    country: z.string().optional().default("KE"),
    timezone: z.string().optional().default("Africa/Nairobi"),
    currency: z.string().optional().default("KES"),
    password: z.string().min(10, "Password must be at least 10 characters"),
    heardAboutUs: z.string().optional(),
  });

  app.post(
    "/isp-registration",
    {
      config: { audience: "public" },
      preHandler: [checkMaintenance],
    },
    async (request, reply) => {
      const body = ispRegistrationSchema.parse(request.body);
      await consumeWhatsappOtpTicket(
        normalizePhoneForOtp(body.phone),
        WHATSAPP_OTP_PURPOSE,
        body.phoneVerificationTicket
      );
      const device = deviceFromRequest(request);
      const { tenant, user, session } = await authService.registerIspTenant(body, device);

      setRefreshCookie(reply, session.refreshToken);

      reply.status(201).send(
        successResponse(
          {
            user: { id: user.id, email: user.email, tenantId: user.tenantId },
            tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
            accessToken: session.accessToken,
            expiresInSeconds: session.expiresInSeconds,
          },
          request.id
        )
      );
    }
  );
}
