import type { PaystackCredentials } from "./config.service.js";

const BASE_URL = "https://api.paystack.co";

export class PaystackApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaystackApiError";
  }
}

export interface InitializeTransactionParams {
  credentials: PaystackCredentials;
  email: string;
  amountMinor: number;
  currency: string;
  reference: string;
  callbackUrl: string;
}

export interface InitializeTransactionResponse {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

/** Initialize Transaction — https://paystack.com/docs/api/transaction/#initialize. Paystack's
 *  `amount` is already in the currency's smallest unit (kobo/cents), the same minor-unit
 *  convention this app uses everywhere internally, so `amountMinor` passes straight through
 *  with no scaling (unlike Daraja, which wants whole shillings). */
export async function initializeTransaction(
  params: InitializeTransactionParams
): Promise<InitializeTransactionResponse> {
  const response = await fetch(`${BASE_URL}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.credentials.secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: params.email,
      amount: params.amountMinor,
      currency: params.currency,
      reference: params.reference,
      callback_url: params.callbackUrl,
    }),
  });

  const body = (await response.json()) as {
    status: boolean;
    message: string;
    data?: { authorization_url: string; access_code: string; reference: string };
  };

  if (!response.ok || !body.status || !body.data) {
    throw new PaystackApiError(`Paystack initialize transaction failed: ${body.message ?? response.status}`);
  }

  return {
    authorizationUrl: body.data.authorization_url,
    accessCode: body.data.access_code,
    reference: body.data.reference,
  };
}

export interface VerifyTransactionResponse {
  status: "success" | "failed" | "abandoned" | string;
  reference: string;
  amountMinor: number;
  currency: string;
  gatewayResponse: string;
}

/** Verify Transaction — https://paystack.com/docs/api/transaction/#verify. The defensive
 *  fallback for a lost/delayed webhook, same role queryStkPushStatus plays for M-Pesa. */
export async function verifyTransaction(
  credentials: PaystackCredentials,
  reference: string
): Promise<VerifyTransactionResponse> {
  const response = await fetch(`${BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${credentials.secretKey}` },
  });

  const body = (await response.json()) as {
    status: boolean;
    message: string;
    data?: { status: string; reference: string; amount: number; currency: string; gateway_response: string };
  };

  if (!response.ok || !body.status || !body.data) {
    throw new PaystackApiError(`Paystack verify transaction failed: ${body.message ?? response.status}`);
  }

  return {
    status: body.data.status,
    reference: body.data.reference,
    amountMinor: body.data.amount,
    currency: body.data.currency,
    gatewayResponse: body.data.gateway_response,
  };
}
