"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { apiFetch, setAccessToken, ApiRequestError } from "./api-client";

export interface CurrentUser {
  id: string;
  tenantId: string | null;
  tenantSlug: string | null;
  tenantBrandColor: string | null;
  tenantTrialEndsAt: string | null;
  sessionId: string;
  email: string | null;
  /** The user's effective permission set, sourced from the same resolution the API actually
   *  enforces (see GET /api/v1/auth/me) — the UI can use this to decide what to show without
   *  ever showing a link the API would then reject, or hiding one it would actually allow. */
  permissions: string[];
}

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  login: (params: { tenantSlug?: string; email: string; password: string }) => Promise<void>;
  loginWithGoogle: (params: { tenantSlug: string; credential: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<CurrentUser | null>;
}

const AuthContext = createContext<AuthState | null>(null);

// The refresh token itself is httpOnly (invisible to JS, by design), so there is no way to tell
// in advance whether a bootstrap refresh() call has anything to work with. Without this flag,
// every page load — including a first-time visitor landing on the public "/" page who has never
// logged in — fired a refresh() attempt that the server correctly, but noisily, rejected with a
// 422 "Missing refresh token cookie". This is a plain, non-sensitive marker (not the token
// itself) purely to skip that pointless round trip when there is no reason to believe a session
// exists; a stale "1" with an actually-expired/revoked cookie still degrades gracefully; refresh()
// just fails as it always could.
const HAD_SESSION_KEY = "mkg_had_session";

function markHadSession(): void {
  try {
    localStorage.setItem(HAD_SESSION_KEY, "1");
  } catch {
    // Storage can throw in private-browsing/locked-down contexts — never let that break auth.
  }
}

function clearHadSession(): void {
  try {
    localStorage.removeItem(HAD_SESSION_KEY);
  } catch {
    // See markHadSession.
  }
}

function hadSession(): boolean {
  try {
    return localStorage.getItem(HAD_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  // /auth/refresh rotates the refresh token on every successful call — the token that was
  // valid for call #1 is deliberately invalidated by the time call #2 would use it. Two
  // *concurrent* refresh() calls (React 18 dev-mode double-mounts an effect, or a caller
  // triggers one manually right after register/login while the mount-time bootstrap call is
  // still in flight) therefore race for real: whichever loses finds the cookie it read already
  // rotated out from under it and gets a genuine 400 from the server, not a client-side glitch.
  // Sharing one in-flight promise across all callers makes concurrent refresh() calls collapse
  // into a single network round trip instead of racing.
  const inFlightRefresh = useRef<Promise<CurrentUser | null> | null>(null);

  // Shared by every path that ends up with a fresh access token (refresh, login, register) so
  // `user` always carries the same complete shape (including `permissions`) no matter which
  // entry point produced the session — a login-only user object with fields silently missing
  // was a real, if invisible, inconsistency this replaces.
  const hydrateUser = useCallback(async (): Promise<CurrentUser> => {
    const me = await apiFetch<{
      user: Omit<CurrentUser, "tenantSlug" | "tenantBrandColor" | "tenantTrialEndsAt">;
      tenant: { slug: string; brandColor: string | null; trialEndsAt: string | null } | null;
    }>("/api/v1/auth/me");
    const fullUser: CurrentUser = {
      ...me.user,
      tenantSlug: me.tenant?.slug ?? null,
      tenantBrandColor: me.tenant?.brandColor ?? null,
      tenantTrialEndsAt: me.tenant?.trialEndsAt ?? null,
    };
    setUser(fullUser);
    return fullUser;
  }, []);

  const refresh = useCallback((): Promise<CurrentUser | null> => {
    if (inFlightRefresh.current) return inFlightRefresh.current;

    const promise = (async () => {
      try {
        const result = await apiFetch<{ accessToken: string; expiresInSeconds: number }>(
          "/api/v1/auth/refresh",
          { method: "POST", skipAuth: true }
        );
        setAccessToken(result.accessToken);
        const hydrated = await hydrateUser();
        markHadSession();
        return hydrated;
      } catch {
        setAccessToken(null);
        setUser(null);
        clearHadSession();
        return null;
      } finally {
        inFlightRefresh.current = null;
      }
    })();

    inFlightRefresh.current = promise;
    return promise;
  }, [hydrateUser]);

  useEffect(() => {
    // Skip the round trip entirely when nothing suggests a session exists (a first-time visitor
    // on the public landing page, or anyone after logout) — see HAD_SESSION_KEY above.
    if (!hadSession()) {
      setLoading(false);
      return;
    }
    refresh().finally(() => setLoading(false));
    // Bootstrap once on mount: silently trade the httpOnly refresh cookie for a fresh access
    // token so a full page reload doesn't force a re-login.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (params: { tenantSlug?: string; email: string; password: string }) => {
      const result = await apiFetch<{ accessToken: string }>("/api/v1/auth/login", {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify(params),
      });
      setAccessToken(result.accessToken);
      await hydrateUser();
      markHadSession();
    },
    [hydrateUser]
  );

  const loginWithGoogle = useCallback(
    async (params: { tenantSlug: string; credential: string }) => {
      const result = await apiFetch<{ accessToken: string }>("/api/v1/auth/google", {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify(params),
      });
      setAccessToken(result.accessToken);
      await hydrateUser();
      markHadSession();
    },
    [hydrateUser]
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch("/api/v1/auth/logout", { method: "POST" });
    } catch (err) {
      if (!(err instanceof ApiRequestError)) throw err;
    } finally {
      setAccessToken(null);
      setUser(null);
      clearHadSession();
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithGoogle, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
