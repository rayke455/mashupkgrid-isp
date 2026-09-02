import { AnalyticsEvent } from "./types";
import { getCaptivePortalPluginsState, saveCaptivePortalPluginsState } from "./plugin-registry";

function detectDevice(): "mobile" | "tablet" | "desktop" {
  if (typeof window === "undefined") return "desktop";
  const w = window.innerWidth;
  if (w < 640) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

/**
 * NOTE on what this actually is: events are written to the VISITOR's own browser storage, one
 * customer's device at a time, and nothing anywhere aggregates them back to the tenant. A staff
 * member has no page that reads any of this — it is a per-visitor local log with no reader. Left
 * as-is here rather than removed (it costs a visitor nothing and some tenant may be relying on
 * exportPluginsConfigJson to pull a sample), but it is not a working analytics feature and
 * should not be presented to a tenant as one until something server-side actually collects it.
 */
export function trackPortalEvent(
  tenantSlug: string,
  type: AnalyticsEvent["type"],
  metadata?: Record<string, unknown>
): void {
  if (typeof window === "undefined") return;
  try {
    const state = getCaptivePortalPluginsState(tenantSlug);
    if (!state.analytics.enabled) return;

    const newEvent: AnalyticsEvent = {
      id: Math.random().toString(36).substring(2, 9),
      type,
      timestamp: new Date().toISOString(),
      deviceType: detectDevice(),
      metadata,
    };

    const updatedEvents = [newEvent, ...(state.analytics.events || [])].slice(0, state.analytics.maxStoredEvents || 200);

    saveCaptivePortalPluginsState(tenantSlug, {
      ...state,
      analytics: {
        ...state.analytics,
        events: updatedEvents,
      },
    });
  } catch (err) {
    console.error("Failed to record analytics event:", err);
  }
}
