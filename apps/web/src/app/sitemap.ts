import type { MetadataRoute } from "next";
import { PUBLIC_ROUTES, SITE_URL } from "@/lib/site";

/**
 * Lists only the pages worth ranking. A sitemap is a set of suggestions, not an access control
 * list, so padding it with the dashboard or captive-portal routes would not hide anything — it
 * would just spend the crawl budget on pages that render nothing useful to a visitor arriving
 * from search, and dilute the pages that do.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PUBLIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
