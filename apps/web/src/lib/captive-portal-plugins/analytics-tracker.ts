import { AnalyticsEvent } from "./types";
import { getCaptivePortalPluginsState, saveCaptivePortalPluginsState } from "./plugin-registry";

function detectDevice(): "mobile" | "tablet" | "desktop" {
  if (typeof window === "undefined") return "desktop";
  const w = window.innerWidth;
  if (w < 640) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

export function trackPortalEvent(type: AnalyticsEvent["type"], metadata?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    const state = getCaptivePortalPluginsState();
    if (!state.analytics.enabled) return;

    const newEvent: AnalyticsEvent = {
      id: Math.random().toString(36).substring(2, 9),
      type,
      timestamp: new Date().toISOString(),
      deviceType: detectDevice(),
      metadata,
    };

    const updatedEvents = [newEvent, ...(state.analytics.events || [])].slice(0, state.analytics.maxStoredEvents || 200);

    saveCaptivePortalPluginsState({
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
