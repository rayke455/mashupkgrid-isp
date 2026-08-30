import type { AfricasTalkingCredentials } from "./config.service.js";

const BASE_URLS: Record<AfricasTalkingCredentials["environment"], string> = {
  sandbox: "https://api.sandbox.africastalking.com",
  production: "https://api.africastalking.com",
};

export interface AfricasTalkingRecipient {
  number: string;
  status: string;
  statusCode: number;
  cost: string;
  messageId: string;
}

export class AfricasTalkingApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AfricasTalkingApiError";
  }
}

/** A real Africa's Talking Bulk SMS API call (docs.africastalking.com/sms/sending) — the
 *  standard SMS gateway for Kenya/East Africa, same tier of "genuine third-party integration,
 *  not a mock" as the Daraja M-Pesa client. `to` accepts one or several E.164 numbers
 *  (already-normalized — see phone.ts) in a single request, matching AT's own comma-joined
 *  `to` field. */
export async function sendSms(
  credentials: AfricasTalkingCredentials,
  to: string | string[],
  message: string
): Promise<AfricasTalkingRecipient[]> {
  const baseUrl = BASE_URLS[credentials.environment];
  const recipients = Array.isArray(to) ? to.join(",") : to;

  const body = new URLSearchParams({ username: credentials.username, to: recipients, message });
  if (credentials.senderId) body.set("from", credentials.senderId);

  const response = await fetch(`${baseUrl}/version1/messaging`, {
    method: "POST",
    headers: {
      apiKey: credentials.apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!response.ok) {
    throw new AfricasTalkingApiError(`Africa's Talking SMS request failed: ${response.status} ${await response.text()}`);
  }

  const parsed = (await response.json()) as {
    SMSMessageData?: { Recipients?: AfricasTalkingRecipient[] };
  };
  return parsed.SMSMessageData?.Recipients ?? [];
}
