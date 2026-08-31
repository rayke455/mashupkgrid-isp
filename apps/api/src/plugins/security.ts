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

  // Tenants are served on wildcard subdomains of PLATFORM_BASE_DOMAIN (acme.mashuphost.tech),
  // which a fixed allowlist can never enumerate — a tenant signing up today would be blocked by
  // CORS tomorrow. The browser then aborts the request before it is sent, and the web app sees a
  // network error rather than an API response, which the login page reports as "Invalid
  // credentials" — a genuinely misleading symptom for what is a CORS rejection.
  //
  // This stays narrower than the "*" the guard above refuses: it admits exactly one extra shape,
  // an https origin that is a single-label subdomain of our own base domain. Every subdomain
  // there resolves to this deployment (the wildcard DNS record points at this host), so those
  // origins are ours, whereas "*" would hand this API's cookies to any site on the internet.
  const baseDomain = env.PLATFORM_BASE_DOMAIN.trim().toLowerCase();

  function isOwnTenantSubdomain(origin: string): boolean {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      return false;
    }
    // Never relax this over plaintext outside dev: an http origin can be forged in transit.
    if (!isDevelopment && url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    // The leading dot is what makes this a subdomain test rather than a suffix test — without
    // it "evil-mashuphost.tech" would match, and an attacker could register exactly that.
    if (!host.endsWith(`.${baseDomain}`)) return false;
    const label = host.slice(0, -(baseDomain.length + 1));
    // One label only. "a.b.mashuphost.tech" is not a tenant host and is not covered by the
    // single-level wildcard certificate either.
    return label.length > 0 && !label.includes(".");
  }

  await app.register(cors, {
    origin(origin, cb) {
      // No Origin header at all: same-origin navigations and non-browser callers such as
      // Safaricom's M-Pesa webhooks. CORS is not what guards those.
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      if (isOwnTenantSubdomain(origin)) return cb(null, true);
      cb(null, false);
    },
    // @fastify/cors v11 changed its default `methods` to the CORS-safelisted set
    // ("GET,HEAD,POST") — every preflight for a DELETE, PATCH or PUT is answered with an
    // Access-Control-Allow-Methods that omits the method being asked about, so the browser
    // blocks the real request before it is ever sent. The API never sees it, nothing is
    // logged server-side, and the web app reports a bare network failure: "Remove router"
    // and "Edit IP" simply never worked in production while every POST-based button did.
    // This API has 30+ DELETE/PATCH/PUT routes, so list them explicitly rather than relying
    // on a default that has already changed once.
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  });
}
