import { env } from "@mashupkgrid/config";

/**
 * The single shared STK callback URL every STK push (customer payment, hotspot purchase,
 * onboarding fee, subscription renewal) hands Safaricom. Appends MPESA_CALLBACK_TOKEN as a query
 * param when configured — Daraja has no signature scheme for its webhooks, so this shared secret
 * (checked by the /callback route handler) is what lets that handler tell a genuine Safaricom
 * callback apart from anyone else who POSTs to the same public URL. See the doc comment on
 * MPESA_CALLBACK_TOKEN in packages/config for why this is optional rather than required.
 */
export function buildMpesaCallbackUrl(): string {
  const base = `${env.APP_API_PUBLIC_URL}/api/v1/payments/mpesa/callback`;
  return env.MPESA_CALLBACK_TOKEN ? `${base}?token=${encodeURIComponent(env.MPESA_CALLBACK_TOKEN)}` : base;
}
