import type { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { env, isDevelopment } from "@mashupkgrid/config";

export async function registerSecurity(app: FastifyInstance): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    // HSTS tells the browser "always use HTTPS for this host from now on" — genuinely useful in
    // production (this API is only ever served over TLS there), but actively harmful in dev: the
    // API here is plain HTTP (including when reached over the LAN for real-device testing, e.g.
    // a phone connected to a hotspot), and a browser that caches this header from one response
    // will silently upgrade every later request to HTTPS, which nothing here answers — every
    // subsequent request just fails outright, indistinguishable from the server being down. Real
    // hardware testing surfaced exactly this: a voucher POST failing right after a plain-HTTP
    // /health request had already primed the browser's HSTS cache.
    hsts: isDevelopment ? false : { maxAge: 63072000, includeSubDomains: true, preload: true },
  });

  const allowedOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim());
  // @fastify/cors normalizes an origin array containing "*" into the literal wildcard string —
  // combined with credentials: true below, that would tell CORS-respecting clients it's fine to
  // send this API's cookies from any origin. Refuse to start with that combination rather than
  // silently serving it; CORS_ORIGIN should always be an explicit allowlist.
  if (allowedOrigins.includes("*")) {
    throw new Error(
      'CORS_ORIGIN must not include "*" — this API is served with credentials: true, so a wildcard origin would allow any site to make authenticated requests using a visitor\'s cookies. List the real allowed origins explicitly.'
    );
  }

  await app.register(cors, {
    origin: allowedOrigins,
    credentials: true,
  });
}
