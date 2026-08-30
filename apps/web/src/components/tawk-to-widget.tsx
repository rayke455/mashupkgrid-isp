"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    Tawk_API?: Record<string, unknown>;
    Tawk_LoadStart?: Date;
  }
}

/** Injects Tawk.to's own loader script once — the chat bubble itself is entirely Tawk.to's own
 *  fixed-position iframe from then on; this component only owns getting that one script tag onto
 *  the page. Guarded by the script's own id so remounts (route changes within the dashboard SPA,
 *  React strict-mode double-invoke in dev) never inject it twice. Toggling the setting off after
 *  the widget has already loaded on a given page load won't retract the bubble immediately —
 *  Tawk.to's own hide/show API would be needed for that, which isn't wired up here; a refresh is
 *  enough for a settings change to take effect, same as most embedded-widget integrations. */
export function TawkToWidget({ widgetId }: { widgetId: string | null | undefined }) {
  useEffect(() => {
    if (!widgetId) return;
    if (document.getElementById("tawk-to-script")) return;

    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = new Date();

    const script = document.createElement("script");
    script.id = "tawk-to-script";
    script.async = true;
    script.src = `https://embed.tawk.to/${widgetId}`;
    script.charset = "UTF-8";
    script.setAttribute("crossorigin", "*");
    document.body.appendChild(script);
  }, [widgetId]);

  return null;
}
