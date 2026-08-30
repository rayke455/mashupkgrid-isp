"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

let gsiScriptPromise: Promise<void> | null = null;

/** Loads Google's Identity Services script once — cached across every mount of this component
 *  (login page, register page, or both re-rendering) rather than re-injecting the tag. */
function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gsiScriptPromise) return gsiScriptPromise;

  gsiScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Sign-In"));
    document.head.appendChild(script);
  });
  return gsiScriptPromise;
}

/**
 * Renders nothing at all when Google sign-in isn't configured platform-wide (see
 * GET /api/v1/auth/google/config) — the caller doesn't need to know or check that itself. On a
 * real credential, hands the raw ID token up to the caller, which POSTs it to
 * /api/v1/auth/google — verifying it server-side is the only place trust is actually established;
 * this component just relays what Google's own button produced.
 */
export function GoogleSignInButton({ onCredential }: { onCredential: (credential: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [clientId, setClientId] = useState<string | null>(null);

  // The Google button is only ever initialized once (see the effect below, keyed on clientId
  // alone) — reading the latest callback through a ref means a caller passing a fresh function
  // identity every render (e.g. a closure over other form fields, as the login page does) can't
  // force Google's own button to be torn down and re-rendered on every keystroke.
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ enabled: boolean; clientId: string | null }>("/api/v1/auth/google/config", { skipAuth: true })
      .then((res) => {
        if (!cancelled && res.enabled && res.clientId) setClientId(res.clientId);
      })
      .catch(() => {
        // Sign-in with Google is an enhancement, not a requirement — a failed config check just
        // means the button never appears, same as it being unconfigured.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!clientId || !containerRef.current) return;
    let cancelled = false;

    loadGoogleScript()
      .then(() => {
        if (cancelled || !window.google || !containerRef.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => onCredentialRef.current(response.credential),
        });
        window.google.accounts.id.renderButton(containerRef.current, {
          theme: "outline",
          size: "large",
          width: 360,
          text: "continue_with",
        });
      })
      .catch(() => {
        // No button rendered — the rest of the login/register form still works normally.
      });

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (!clientId) return null;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex w-full items-center gap-3">
        <div className="h-px flex-1 bg-slate-200 dark:bg-obsidian-800" />
        <span className="text-xs font-medium text-slate-400">or</span>
        <div className="h-px flex-1 bg-slate-200 dark:bg-obsidian-800" />
      </div>
      <div ref={containerRef} />
    </div>
  );
}
