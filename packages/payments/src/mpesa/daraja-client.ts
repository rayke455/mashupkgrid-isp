import type { MpesaCredentials } from "./config.service.js";

const BASE_URLS: Record<MpesaCredentials["environment"], string> = {
  sandbox: "https://sandbox.safaricom.co.ke",
  production: "https://api.safaricom.co.ke",
};

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/** Per-process OAuth token cache, keyed by shortcode+environment. Daraja tokens last ~1 hour;
 *  a process-local Map is a deliberate simplification over a shared Redis cache — refetching
 *  once per process restart is cheap and this package stays Redis-free by design. */
const tokenCache = new Map<string, CachedToken>();

async function getAccessToken(credentials: MpesaCredentials): Promise<string> {
  const cacheKey = `${credentials.shortcode}:${credentials.environment}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.accessToken;

  const baseUrl = BASE_URLS[credentials.environment];
  const auth = Buffer.from(`${credentials.consumerKey}:${credentials.consumerSecret}`).toString("base64");

  const response = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });

  if (!response.ok) {
    throw new Error(`M-Pesa OAuth request failed: ${response.status} ${await response.text()}`);
  }

  const body = (await response.json()) as { access_token: string; expires_in: string };
  const expiresInSeconds = Number(body.expires_in) || 3600;
  // Refresh 60s early so an in-flight request never gets a token that expires mid-call.
  const expiresAt = Date.now() + (expiresInSeconds - 60) * 1000;
  tokenCache.set(cacheKey, { accessToken: body.access_token, expiresAt });
  return body.access_token;
}

export function darajaTimestamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    date.getFullYear().toString() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

export function darajaPassword(shortcode: string, passkey: string, timestamp: string): string {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
}

export interface StkPushParams {
  credentials: MpesaCredentials;
  phone: string;
  amountMinor: number;
  accountReference: string;
  transactionDesc: string;
  callbackUrl: string;
}

export interface StkPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

/** Lipa na M-Pesa Online (STK Push) — https://developer.safaricom.co.ke/APIs/MpesaExpressSimulate */
export async function initiateStkPush(params: StkPushParams): Promise<StkPushResponse> {
  const { credentials } = params;
  const baseUrl = BASE_URLS[credentials.environment];
  const accessToken = await getAccessToken(credentials);
  const timestamp = darajaTimestamp();
  const password = darajaPassword(credentials.shortcode, credentials.passkey, timestamp);

  const response = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: credentials.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      // Daraja expects whole-shilling amounts (no minor units) — M-Pesa doesn't support cents.
      Amount: Math.round(params.amountMinor / 100),
      PartyA: params.phone,
      PartyB: credentials.shortcode,
      PhoneNumber: params.phone,
      CallBackURL: params.callbackUrl,
      AccountReference: params.accountReference.slice(0, 12),
      TransactionDesc: params.transactionDesc.slice(0, 13),
    }),
  });

  const body = (await response.json()) as StkPushResponse & { errorMessage?: string; errorCode?: string };
  if (!response.ok || body.ResponseCode !== "0") {
    throw new Error(`M-Pesa STK push failed: ${body.errorMessage ?? body.ResponseDescription ?? response.status}`);
  }
  return body;
}

export interface StkQueryResponse {
  ResponseCode: string;
  ResponseDescription: string;
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResultCode: string;
  ResultDesc: string;
}

/** STK Push Query — polls for the result of a push when the callback hasn't arrived yet. */
export async function queryStkPushStatus(
  credentials: MpesaCredentials,
  checkoutRequestId: string
): Promise<StkQueryResponse> {
  const baseUrl = BASE_URLS[credentials.environment];
  const accessToken = await getAccessToken(credentials);
  const timestamp = darajaTimestamp();
  const password = darajaPassword(credentials.shortcode, credentials.passkey, timestamp);

  const response = await fetch(`${baseUrl}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: credentials.shortcode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
  });

  const body = (await response.json()) as StkQueryResponse & { errorMessage?: string };
  if (!response.ok) {
    throw new Error(`M-Pesa STK query failed: ${body.errorMessage ?? response.status}`);
  }
  return body;
}
