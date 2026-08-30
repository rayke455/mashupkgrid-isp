import { createHmac } from "node:crypto";
import { prisma } from "@mashupkgrid/database";
import { deliverWebhookEventJobSchema, decryptAtRest, assertPublicHttpUrl } from "@mashupkgrid/shared";
import { env } from "@mashupkgrid/config";

const DELIVERY_TIMEOUT_MS = 10_000;

/**
 * Delivers one platform event to one webhook endpoint: signs the JSON body with the endpoint's
 * own secret (HMAC-SHA256 over the raw bytes actually sent, same signing scheme we ask Paystack
 * webhook consumers to trust for our own inbound handler), POSTs it, and records the attempt.
 * BullMQ retries this job with backoff on a thrown error (a network failure or non-2xx status),
 * so a temporarily-down receiving endpoint recovers automatically once it comes back.
 */
export async function handleDeliverWebhook(payload: unknown): Promise<void> {
  const data = deliverWebhookEventJobSchema.parse(payload);

  const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id: data.webhookEndpointId } });
  if (!endpoint || !endpoint.isActive) {
    // The endpoint was deleted or disabled after this job was enqueued — nothing to deliver to,
    // and not a failure worth retrying.
    return;
  }

  const secret = decryptAtRest(endpoint.secretEncrypted, env.ENCRYPTION_KEY);
  const body = JSON.stringify({
    event: data.eventType,
    data: data.payload,
    deliveredAt: new Date().toISOString(),
  });
  const signature = createHmac("sha256", secret).update(body, "utf8").digest("hex");

  let statusCode: number | null = null;
  let success = false;
  let errorMessage: string | null = null;

  try {
    // Re-validated at delivery time, not just at registration — the URL's DNS could have been
    // re-pointed at a private/internal address since it was registered (SSRF via DNS rebinding).
    await assertPublicHttpUrl(endpoint.url);
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Mkg-Signature": signature,
        "X-Mkg-Event": data.eventType,
      },
      body,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    statusCode = response.status;
    success = response.ok;
    if (!success) errorMessage = `Endpoint responded ${response.status}`;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Unknown delivery error";
  }

  await prisma.$transaction([
    prisma.webhookDelivery.create({
      data: {
        webhookEndpointId: endpoint.id,
        eventType: data.eventType,
        payload: data.payload as object,
        statusCode,
        success,
        errorMessage,
      },
    }),
    prisma.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: {
        lastTriggeredAt: new Date(),
        lastStatusCode: statusCode,
        consecutiveFailures: success ? 0 : { increment: 1 },
      },
    }),
  ]);

  if (!success) {
    // Thrown after the delivery/state is durably recorded — BullMQ's attempts/backoff config
    // (apps/api/src/lib/queue.ts) handles the retry; this just signals "this attempt failed".
    throw new Error(errorMessage ?? "Webhook delivery failed");
  }
}
