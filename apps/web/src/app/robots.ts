import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Crawl rules.
 *
 * The disallow list is the substantive part. Without it a crawler will happily index the login
 * screen, password-reset pages, and every tenant's captive portal — pages that are useless from
 * a search result (the portal only works for a device already connected to that ISP's Wi-Fi) and
 * that push the actual marketing pages down. Auth screens carry one-time tokens in their URLs,
 * which have no business in a search index at all.
 *
 * This is not a security boundary: robots.txt is advisory and the real protection is that those
 * routes require a session. It is about what gets ranked.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dashboard",
        "/hotspot",
        "/app",
        "/portal",
        "/login",
        "/register",
        "/forgot-password",
        "/reset-password",
        "/verify-email",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
