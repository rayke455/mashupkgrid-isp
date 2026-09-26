import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "@mashupkgrid/database";
import { successResponse } from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { authRateLimitConfig } from "../plugins/rate-limit.js";
import { writeAuditLog } from "../lib/audit.js";
import {
  confirmSetupForUser,
  confirmSetupFromChallenge,
  disableForUser,
  isMfaRequiredFor,
  phoneHint,
  regenerateRecoveryCodes,
  resendChallengeSms,
  startSetupForUser,
  startSetupFromChallenge,
  verifyChallenge,
} from "../services/mfa.service.js";
import { setRefreshCookie } from "./auth.js";

/**
 * Two-step login routes. The first group finishes a sign-in that the password step paused (a
 * code, or setting it up when the ISP requires it); the second is a signed-in user's own
 * two-step settings.
 */

const tokenSchema = z.string().regex(/^[A-Za-z0-9]{40}$/);
const codeSchema = z.string().trim().min(6).max(20);
const methodSchema = z.enum(["TOTP", "SMS"]);

export async function mfaRoutes(app: FastifyInstance): Promise<void> {
  const signIn = { config: { audience: "public" as const, maintenanceCategory: "login" as const, rateLimit: authRateLimitConfig }, preHandler: [checkMaintenance] };
  const audit = (request: FastifyRequest, userId: string, tenantId: string | null, action: string, after?: object) =>
    writeAuditLog({ tenantId, actorUserId: userId, action, resourceType: "User", resourceId: userId, after, ipAddress: request.ip, userAgent: request.headers["user-agent"] ?? null });

  // ---------------------------------------------------------------- Finishing a sign-in
  app.post("/verify", signIn, async (request, reply) => {
    const body = z.object({ challengeToken: tokenSchema, code: codeSchema }).parse(request.body);
    const { user, tokens, usedRecoveryCode, recoveryCodesLeft } = await verifyChallenge(body.challengeToken, body.code);
    setRefreshCookie(reply, tokens.refreshToken);
    if (usedRecoveryCode) await audit(request, user.id, user.tenantId, "user.mfa_recovery_code_used", { recoveryCodesLeft });
    reply.send(
      successResponse(
        { accessToken: tokens.accessToken, expiresInSeconds: tokens.expiresInSeconds, user: { id: user.id, email: user.email, tenantId: user.tenantId }, usedRecoveryCode, recoveryCodesLeft },
        request.id
      )
    );
  });

  app.post("/resend", signIn, async (request, reply) => {
    const body = z.object({ challengeToken: tokenSchema }).parse(request.body);
    await resendChallengeSms(body.challengeToken);
    reply.send(successResponse({ sent: true }, request.id));
  });

  app.post("/setup/start", signIn, async (request, reply) => {
    const body = z.object({ setupToken: tokenSchema, method: methodSchema }).parse(request.body);
    reply.send(successResponse(await startSetupFromChallenge(body.setupToken, body.method), request.id));
  });

  app.post("/setup/confirm", signIn, async (request, reply) => {
    const body = z.object({ setupToken: tokenSchema, code: codeSchema }).parse(request.body);
    const { user, tokens, recoveryCodes } = await confirmSetupFromChallenge(body.setupToken, body.code);
    setRefreshCookie(reply, tokens.refreshToken);
    await audit(request, user.id, user.tenantId, "user.mfa_enabled", { method: user.mfaMethod, atSignIn: true });
    reply.send(successResponse({ accessToken: tokens.accessToken, expiresInSeconds: tokens.expiresInSeconds, user: { id: user.id, email: user.email, tenantId: user.tenantId }, recoveryCodes }, request.id));
  });

  // ---------------------------------------------------------------- A user's own settings
  const own = { config: { audience: "customer" as const }, preHandler: [authenticate, checkMaintenance] };

  app.get("/", own, async (request, reply) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.user!.id } });
    reply.send(
      successResponse(
        {
          method: user.mfaMethod,
          enabledAt: user.totpEnabledAt,
          recoveryCodesLeft: user.mfaMethod ? user.mfaRecoveryCodes.length : 0,
          required: await isMfaRequiredFor(user),
          smsAvailable: Boolean(user.phone && user.tenantId),
          phoneHint: phoneHint(user.phone),
        },
        request.id
      )
    );
  });

  app.post("/start", own, async (request, reply) => {
    const { method } = z.object({ method: methodSchema }).parse(request.body);
    reply.send(successResponse(await startSetupForUser(request.user!.id, method), request.id));
  });

  app.post("/enable", own, async (request, reply) => {
    const { code } = z.object({ code: codeSchema }).parse(request.body);
    const recoveryCodes = await confirmSetupForUser(request.user!.id, code);
    await audit(request, request.user!.id, request.user!.tenantId, "user.mfa_enabled");
    reply.send(successResponse({ recoveryCodes }, request.id));
  });

  app.post("/disable", own, async (request, reply) => {
    const { password } = z.object({ password: z.string().min(1) }).parse(request.body);
    await disableForUser(request.user!.id, password);
    await audit(request, request.user!.id, request.user!.tenantId, "user.mfa_disabled");
    reply.send(successResponse({ disabled: true }, request.id));
  });

  app.post("/recovery-codes", own, async (request, reply) => {
    const { password } = z.object({ password: z.string().min(1) }).parse(request.body);
    const recoveryCodes = await regenerateRecoveryCodes(request.user!.id, password);
    await audit(request, request.user!.id, request.user!.tenantId, "user.mfa_recovery_codes_regenerated");
    reply.send(successResponse({ recoveryCodes }, request.id));
  });
}
