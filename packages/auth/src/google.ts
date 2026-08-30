import { createRemoteJWKSet, jwtVerify } from "jose";
import { ValidationError } from "@mashupkgrid/shared";

/**
 * Verifies a Google "Sign in with Google" ID token the same way `google-auth-library`'s
 * `verifyIdToken` would — checking the RS256 signature against Google's own published keys,
 * plus issuer/audience — but via `jose`, already a dependency here for this package's own access
 * tokens, so this needs no new external package. The JWKS is fetched lazily and cached/rotated
 * internally by `createRemoteJWKSet` (per its own docs), matching Google's key-rotation practice
 * of not publishing a fixed key.
 */
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export interface GoogleIdentity {
  email: string;
  emailVerified: boolean;
  name: string | null;
  googleSub: string;
}

/** Throws if the token's signature, issuer, audience, or expiry don't check out — never returns
 *  a partially-trusted result. `clientId` must be this platform's own Google OAuth Client ID
 *  (the `aud` claim), so a token minted for some unrelated Google app can never be replayed here. */
export async function verifyGoogleIdToken(idToken: string, clientId: string): Promise<GoogleIdentity> {
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: GOOGLE_ISSUERS,
    audience: clientId,
  });

  const email = typeof payload["email"] === "string" ? payload["email"] : null;
  if (!email) throw new ValidationError("This Google account has no email address to sign in with");

  return {
    email,
    emailVerified: payload["email_verified"] === true,
    name: typeof payload["name"] === "string" ? payload["name"] : null,
    googleSub: String(payload.sub),
  };
}
