import type { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { redis } from "../lib/redis.js";
import { RateLimitedError } from "@mashupkgrid/shared";
import { isDevelopment } from "@mashupkgrid/config";

/**
 * Global default rate limit, Redis-backed so it's correct across multiple API instances
 * (project instruction §37). Per-route-family limits (login, OTP, registration, password
 * reset) are applied with tighter `config.rateLimit` overrides on those specific routes.
 */
export async function registerRateLimit(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
    redis,
    keyGenerator: (request) => request.ip,
    // @fastify/rate-limit does `throw params.errorResponseBuilder(req, ctx)` internally (it is
    // NOT sent as a response body directly) — returning our own AppError subclass here, rather
    // than a plain object, lets the global error handler's `isAppError` branch serialize it
    // correctly (429 + the standard envelope) instead of falling through to a generic 500.
    errorResponseBuilder: (_request, context) => new RateLimitedError(Math.ceil(context.ttl / 1000)),
  });
}

// These stay tight in production (brute-force/OTP-guessing protection) but that same tightness
// is exactly what makes iterative local testing painful — 5 login attempts per 15 minutes is
// gone after one debugging session. Development gets a much looser bound instead of no bound at
// all, so a genuine runaway retry loop still gets caught during dev, just not a normal workflow.
export const authRateLimitConfig = isDevelopment
  ? { max: 100, timeWindow: "1 minute" }
  : { max: 5, timeWindow: "15 minutes" };
export const otpRateLimitConfig = isDevelopment
  ? { max: 100, timeWindow: "1 minute" }
  : { max: 5, timeWindow: "1 hour" };
export const publicApiRateLimitConfig = { max: 100, timeWindow: "1 minute" };
// Looser than login/OTP: a captive portal's IP is frequently shared by every device on that
// hotspot (NAT), so a tight per-IP limit would lock out legitimate customers behind the same
// unlucky one mistyping a code — still meaningfully bounds brute-forcing an 8-char voucher code.
export const hotspotLoginRateLimitConfig = isDevelopment
  ? { max: 100, timeWindow: "1 minute" }
  : { max: 20, timeWindow: "15 minutes" };
