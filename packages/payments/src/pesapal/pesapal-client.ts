import type { PesapalCredentials } from "./config.service.js";

const SANDBOX_BASE_URL = "https://cybqa.pesapal.com/pesapalv3";
const LIVE_BASE_URL = "https://pay.pesapal.com/v3";

export class PesapalApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PesapalApiError";
  }
}

function getBaseUrl(environment: "live" | "sandbox"): string {
  return environment === "live" ? LIVE_BASE_URL : SANDBOX_BASE_URL;
}

/** Request Bearer Auth Token from Pesapal API v3 */
export async function requestPesapalAuthToken(credentials: PesapalCredentials): Promise<string> {
  const baseUrl = getBaseUrl(credentials.environment);
  const response = await fetch(`${baseUrl}/api/Auth/RequestToken`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      consumer_key: credentials.consumerKey,
      consumer_secret: credentials.consumerSecret,
    }),
  });

  const data = (await response.json()) as {
    token?: string;
    status?: string;
    message?: string;
    error?: unknown;
  };

  if (!response.ok || !data.token) {
    throw new PesapalApiError(
      `Pesapal authentication failed: ${data.message || (typeof data.error === "string" ? data.error : response.statusText)}`
    );
  }

  return data.token;
}

export interface RegisterIpnParams {
  credentials: PesapalCredentials;
  url: string;
}

export interface RegisterIpnResponse {
  ipnId: string;
  url: string;
  createdDate: string;
  status: string;
}

/** Register IPN Notification URL with Pesapal */
export async function registerPesapalIpn(params: RegisterIpnParams): Promise<RegisterIpnResponse> {
  const token = await requestPesapalAuthToken(params.credentials);
  const baseUrl = getBaseUrl(params.credentials.environment);

  const response = await fetch(`${baseUrl}/api/URLSetup/RegisterIPN`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      url: params.url,
      ipn_notification_type: "GET",
    }),
  });

  const data = (await response.json()) as {
    ipn_id?: string;
    url?: string;
    created_date?: string;
    status?: string;
    message?: string;
  };

  if (!response.ok || !data.ipn_id) {
    throw new PesapalApiError(`Pesapal IPN registration failed: ${data.message || response.statusText}`);
  }

  return {
    ipnId: data.ipn_id,
    url: data.url || params.url,
    createdDate: data.created_date || new Date().toISOString(),
    status: data.status || "200",
  };
}

export interface SubmitOrderParams {
  credentials: PesapalCredentials;
  reference: string;
  amountMinor: number;
  currency: string;
  description: string;
  callbackUrl: string;
  notificationId?: string | null;
  customer: {
    email: string;
    phone?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  };
}

export interface SubmitOrderResponse {
  orderTrackingId: string;
  merchantReference: string;
  redirectUrl: string;
  status: string;
}

/** Submit Order Request to Pesapal */
export async function submitPesapalOrder(params: SubmitOrderParams): Promise<SubmitOrderResponse> {
  const token = await requestPesapalAuthToken(params.credentials);
  const baseUrl = getBaseUrl(params.credentials.environment);

  const amountKsh = params.amountMinor / 100;
  const nameParts = (params.customer.firstName || "Customer").split(" ");

  const payload = {
    id: params.reference,
    currency: params.currency || "KES",
    amount: amountKsh,
    description: params.description,
    callback_url: params.callbackUrl,
    notification_id: params.notificationId || undefined,
    billing_address: {
      email_address: params.customer.email,
      phone_number: params.customer.phone || "",
      first_name: nameParts[0] || "Valued",
      last_name: nameParts.slice(1).join(" ") || "Customer",
      country_code: "KE",
    },
  };

  const response = await fetch(`${baseUrl}/api/Transactions/SubmitOrderRequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as {
    order_tracking_id?: string;
    merchant_reference?: string;
    redirect_url?: string;
    status?: string;
    message?: string;
    error?: unknown;
  };

  if (!response.ok || !data.order_tracking_id || !data.redirect_url) {
    throw new PesapalApiError(
      `Pesapal order submission failed: ${data.message || (typeof data.error === "string" ? data.error : response.statusText)}`
    );
  }

  return {
    orderTrackingId: data.order_tracking_id,
    merchantReference: data.merchant_reference || params.reference,
    redirectUrl: data.redirect_url,
    status: data.status || "200",
  };
}

export interface PesapalTransactionStatus {
  paymentMethod: string;
  amount: number;
  createdDate: string;
  confirmationCode: string;
  paymentStatusDescription: string;
  statusCode: number;
  merchantReference: string;
}

/** Get Pesapal Transaction Status */
export async function getPesapalTransactionStatus(
  credentials: PesapalCredentials,
  orderTrackingId: string
): Promise<PesapalTransactionStatus> {
  const token = await requestPesapalAuthToken(credentials);
  const baseUrl = getBaseUrl(credentials.environment);

  const response = await fetch(
    `${baseUrl}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }
  );

  const data = (await response.json()) as {
    payment_method?: string;
    amount?: number;
    created_date?: string;
    confirmation_code?: string;
    payment_status_description?: string;
    status_code?: number;
    merchant_reference?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new PesapalApiError(`Pesapal get transaction status failed: ${data.message || response.statusText}`);
  }

  return {
    paymentMethod: data.payment_method || "PESAPAL",
    amount: data.amount || 0,
    createdDate: data.created_date || new Date().toISOString(),
    confirmationCode: data.confirmation_code || "",
    paymentStatusDescription: data.payment_status_description || "UNKNOWN",
    statusCode: data.status_code ?? 0,
    merchantReference: data.merchant_reference || "",
  };
}
