import { prisma, type PaymentWebhookEvent, type Prisma } from "@mashupkgrid/database";

/**
 * The inbound-callback journal: every provider callback is written here before it is processed,
 * then marked with what happened to it. Duplicates, rejections (bad token, wrong shortcode) and
 * failures are kept too — they are exactly what an operator needs when reconciling.
 *
 * Logging must never be the reason a payment is lost, so a failure to write the log is reported
 * and swallowed; the callback is still processed.
 */

export type WebhookEventType =
  | "STK_CALLBACK"
  | "C2B_VALIDATION"
  | "C2B_CONFIRMATION"
  | "PLATFORM_C2B_VALIDATION"
  | "PLATFORM_C2B_CONFIRMATION"
  | "SETTLEMENT_RESULT"
  | "SETTLEMENT_TIMEOUT";

export async function logWebhookReceived(input: {
  provider: string;
  eventType: WebhookEventType;
  externalId?: string | null;
  tenantId?: string | null;
  payload: unknown;
  sourceIp?: string | null;
}): Promise<string | null> {
  try {
    const event = await prisma.paymentWebhookEvent.create({
      data: {
        provider: input.provider,
        eventType: input.eventType,
        externalId: input.externalId ?? null,
        tenantId: input.tenantId ?? null,
        payload: (input.payload ?? {}) as Prisma.InputJsonValue,
        sourceIp: input.sourceIp ?? null,
      },
    });
    return event.id;
  } catch (err) {
    console.error("[webhooks] failed to log inbound callback", err);
    return null;
  }
}

export async function finishWebhookEvent(
  id: string | null,
  result: {
    status: PaymentWebhookEvent["status"];
    tenantId?: string | null;
    transactionReference?: string | null;
    response?: unknown;
    errorMessage?: string | null;
  }
): Promise<void> {
  if (!id) return;
  try {
    await prisma.paymentWebhookEvent.update({
      where: { id },
      data: {
        status: result.status,
        processedAt: new Date(),
        ...(result.tenantId !== undefined ? { tenantId: result.tenantId } : {}),
        ...(result.transactionReference !== undefined ? { transactionReference: result.transactionReference } : {}),
        ...(result.response !== undefined ? { response: result.response as Prisma.InputJsonValue } : {}),
        // Stored for operators only and never echoed to the caller.
        ...(result.errorMessage ? { errorMessage: result.errorMessage.slice(0, 1000) } : {}),
      },
    });
  } catch (err) {
    console.error("[webhooks] failed to update callback log", err);
  }
}

/** Daraja's documented callback shapes, pulled apart just enough to index the event. */
export function extractStkCheckoutId(payload: unknown): string | null {
  const id = (payload as { Body?: { stkCallback?: { CheckoutRequestID?: unknown } } })?.Body?.stkCallback?.CheckoutRequestID;
  return typeof id === "string" ? id : null;
}

export function extractC2BTransId(payload: unknown): string | null {
  const id = (payload as { TransID?: unknown })?.TransID;
  return typeof id === "string" ? id : null;
}

export function extractResultConversationId(payload: unknown): string | null {
  const id = (payload as { Result?: { OriginatorConversationID?: unknown } })?.Result?.OriginatorConversationID;
  return typeof id === "string" ? id : null;
}
