import { isAppError } from "@mashupkgrid/shared";
import { getSmsCredentials } from "./config.service.js";
import { sendSms as sendViaAfricasTalking } from "./africastalking-client.js";
import { normalizeKenyanPhoneE164 } from "./phone.js";

export interface SendTenantSmsResult {
  delivered: boolean;
  reason?: string;
}

/**
 * Sends one SMS on behalf of a tenant, resolving that tenant's own encrypted Africa's Talking
 * credentials first. Mirrors apps/worker/src/lib/email.ts's `sendEmail`: when the gateway isn't
 * configured (or isn't active) yet, this does NOT throw and does NOT pretend delivery
 * happened — it returns `delivered: false` with a reason, so a caller like the dunning job can
 * log it and move on instead of crashing a whole batch over one unconfigured tenant (project
 * instruction §78 — never fake a completed integration).
 */
export async function sendTenantSms(tenantId: string, phone: string, message: string): Promise<SendTenantSmsResult> {
  let credentials;
  try {
    credentials = await getSmsCredentials(tenantId);
  } catch (err) {
    if (isAppError(err) && err.statusCode === 404) {
      return { delivered: false, reason: "SMS gateway is not configured for this tenant" };
    }
    throw err;
  }

  // Everything past this point is "the gateway is configured, but the send itself didn't work"
  // (bad phone number, invalid API key, Africa's Talking being down, a network error) — all of
  // it belongs in the same non-throwing `delivered: false` bucket the function promises, not a
  // handful of them slipping through as a raw 500 to whatever called this.
  try {
    const to = normalizeKenyanPhoneE164(phone);
    const recipients = await sendViaAfricasTalking(credentials, to, message);
    const recipient = recipients[0];

    if (!recipient || recipient.statusCode !== 101) {
      return { delivered: false, reason: recipient?.status ?? "No recipient status returned" };
    }
    return { delivered: true };
  } catch (err) {
    return { delivered: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
