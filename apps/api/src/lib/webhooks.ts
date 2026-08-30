import { prisma } from "@mashupkgrid/database";
import type { WebhookEventType } from "@mashupkgrid/shared";
import { enqueueDeliverWebhookEvent } from "./queue.js";

/**
 * Fires a platform event to every active webhook endpoint the tenant has subscribed to it.
 * Enqueues one delivery job per endpoint (apps/worker/src/jobs/deliver-webhook.ts does the
 * actual signed HTTP POST) rather than sending inline — a slow or unreachable third-party
 * endpoint must never add latency to the request that triggered the event, and BullMQ's
 * retry/backoff handles transient failures without the caller knowing or caring.
 *
 * Best-effort: a lookup or enqueue failure here is logged, never thrown — a broken webhook
 * subscription must not break the underlying action (creating a customer, generating an
 * invoice) that happens to also be a webhook trigger.
 */
export async function emitWebhookEvent(
  tenantId: string,
  eventType: WebhookEventType,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { tenantId, isActive: true, events: { has: eventType } },
      select: { id: true },
    });
    await Promise.all(
      endpoints.map((endpoint) =>
        enqueueDeliverWebhookEvent({ webhookEndpointId: endpoint.id, eventType, payload })
      )
    );
  } catch (err) {
    console.error(`[webhooks] failed to enqueue "${eventType}" for tenant ${tenantId}:`, err);
  }
}
