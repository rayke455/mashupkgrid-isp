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

/** The number Daraja calls `BusinessShortCode` — which is NOT always the number a customer pays.
 *
 *  For a Paybill the two are the same. For a Buy Goods Till they are not: the customer pays the
 *  till (`PartyB`), while `BusinessShortCode` must be the head-office/store number, because that
 *  is the number Safaricom issued the passkey against and therefore the one the STK password is
 *  derived from. Getting this wrong does not fail loudly — Daraja accepts the request and the
 *  payer's handset simply never completes it. Falls back to the shortcode when a Till has no
 *  store number recorded, which at least matches the single-number setups Safaricom issues. */
export function darajaBusinessShortCode(credentials: MpesaCredentials): string {
  return credentials.shortcodeType === "TILL"
    ? credentials.storeNumber || credentials.shortcode
    : credentials.shortcode;
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
  const businessShortCode = darajaBusinessShortCode(credentials);
  const password = darajaPassword(businessShortCode, credentials.passkey, timestamp);

  const response = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: businessShortCode,
      Password: password,
      Timestamp: timestamp,
      // A Till must be pushed as CustomerBuyGoodsOnline; sending a Till as CustomerPayBillOnline
      // produces a request the payer's handset never completes, with no error to explain it.
      TransactionType:
        credentials.shortcodeType === "TILL" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline",
      // Daraja expects whole-shilling amounts (no minor units) — M-Pesa doesn't support cents.
      Amount: Math.round(params.amountMinor / 100),
      PartyA: params.phone,
      // Always the number the money goes to: the till for Buy Goods, the paybill otherwise.
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
  // Must match the push exactly — a query signed with a different shortcode cannot find it.
  const queryShortCode = darajaBusinessShortCode(credentials);
  const password = darajaPassword(queryShortCode, credentials.passkey, timestamp);

  const response = await fetch(`${baseUrl}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: queryShortCode,
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

export interface B2BPaymentParams {
  credentials: MpesaCredentials;
  /** The Daraja API user authorised to move money, and their password encrypted against
   *  Safaricom's public certificate. Separate approval from STK Push. */
  initiatorName: string;
  securityCredential: string;
  /** Where the money goes. */
  destinationShortcode: string;
  destinationType: "PAYBILL" | "TILL";
  amountMinor: number;
  /** Shown on the receiving statement. */
  accountReference: string;
  remarks: string;
  resultUrl: string;
  queueTimeoutUrl: string;
}

export interface B2BPaymentResponse {
  ConversationID: string;
  OriginatorConversationID: string;
  ResponseCode: string;
  ResponseDescription: string;
}

/**
 * Business-to-business payment — how this platform remits a tenant their balance.
 *
 * `BusinessPayBill` and `BusinessBuyGoods` are different command IDs for genuinely different
 * destinations: a paybill expects an account number alongside the shortcode, a till does not.
 * Sending the wrong one does not simply fail — it can land the money in the wrong place — which
 * is why the destination type is stored per tenant rather than assumed.
 *
 * Unlike STK Push this call is asynchronous in both directions: a 0 response means Safaricom
 * ACCEPTED the instruction, not that the money moved. Only the result callback says that, so a
 * payout stays PROCESSING until it arrives.
 */
export async function initiateB2BPayment(params: B2BPaymentParams): Promise<B2BPaymentResponse> {
  const { credentials } = params;
  const baseUrl = BASE_URLS[credentials.environment];
  const accessToken = await getAccessToken(credentials);

  const response = await fetch(`${baseUrl}/mpesa/b2b/v1/paymentrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      Initiator: params.initiatorName,
      SecurityCredential: params.securityCredential,
      CommandID: params.destinationType === "TILL" ? "BusinessBuyGoods" : "BusinessPayBill",
      SenderIdentifierType: "4",
      RecieverIdentifierType: "4",
      // Whole shillings — M-Pesa has no cents.
      Amount: Math.round(params.amountMinor / 100),
      PartyA: credentials.shortcode,
      PartyB: params.destinationShortcode,
      AccountReference: params.accountReference.slice(0, 20),
      Remarks: params.remarks.slice(0, 100),
      QueueTimeOutURL: params.queueTimeoutUrl,
      ResultURL: params.resultUrl,
    }),
  });

  const body = (await response.json()) as B2BPaymentResponse & {
    errorMessage?: string;
    errorCode?: string;
  };
  if (!response.ok || body.ResponseCode !== "0") {
    throw new Error(
      `M-Pesa B2B payment failed: ${body.errorMessage ?? body.ResponseDescription ?? response.status}`
    );
  }
  return body;
}
