import webpush from "web-push";
import { env } from "@mashupkgrid/config";
import { prisma, type Prisma } from "@mashupkgrid/database";

/**
 * Push alerts to the phones and computers where a staff member turned them on in the dashboard.
 * Each device is one PushSubscription row. A device the push service reports as gone (the person
 * uninstalled the app, cleared site data, or turned alerts off in the browser) is deleted, so a
 * stale device never costs another request.
 */

export interface PushPayload {
  title: string;
  body: string;
  /** Dashboard path opened when the alert is tapped. */
  url?: string;
  /** Alerts with the same tag replace each other on the device instead of stacking. */
  tag?: string;
}

export type PushOutcome = "sent" | "gone" | "failed";

let configuredWith: string | null = null;

export function isPushConfigured(): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

export function vapidPublicKey(): string | null {
  return isPushConfigured() ? env.VAPID_PUBLIC_KEY : null;
}

function ensureConfigured(): boolean {
  if (!isPushConfigured()) return false;
  if (configuredWith !== env.VAPID_PUBLIC_KEY) {
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    configuredWith = env.VAPID_PUBLIC_KEY;
  }
  return true;
}

/** Sends to one device. 404 and 410 mean the device will never accept pushes again. */
export async function sendToDevice(
  device: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload
): Promise<PushOutcome> {
  if (!ensureConfigured()) return "failed";
  try {
    await webpush.sendNotification(
      { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
      JSON.stringify(payload),
      // An alert about a router that went down an hour ago is noise; drop it if undelivered by then.
      { TTL: 3600, urgency: "high" }
    );
    return "sent";
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    console.error(`[push] delivery to ${new URL(device.endpoint).host} failed (${status ?? "no status"})`);
    return "failed";
  }
}

/** Sends to every device matching `where`. Returns how many devices accepted the alert. */
export async function pushToDevices(where: Prisma.PushSubscriptionWhereInput, payload: PushPayload): Promise<number> {
  if (!isPushConfigured()) return 0;
  const devices = await prisma.pushSubscription.findMany({ where, select: { id: true, endpoint: true, p256dh: true, auth: true } });
  let sent = 0;
  const gone: string[] = [];
  const delivered: string[] = [];
  for (const device of devices) {
    const outcome = await sendToDevice(device, payload);
    if (outcome === "sent") {
      sent += 1;
      delivered.push(device.id);
    } else if (outcome === "gone") {
      gone.push(device.id);
    }
  }
  if (gone.length) await prisma.pushSubscription.deleteMany({ where: { id: { in: gone } } });
  if (delivered.length) await prisma.pushSubscription.updateMany({ where: { id: { in: delivered } }, data: { lastSuccessAt: new Date() } });
  return sent;
}

export function pushToUser(userId: string, payload: PushPayload): Promise<number> {
  return pushToDevices({ userId }, payload);
}

/**
 * Sends to the devices of this ISP's active staff who hold `permissionKey`, so a router alert
 * reaches the people who can fix routers and a payment alert the people who see payments.
 */
export function pushToTenantStaff(tenantId: string, permissionKey: string, payload: PushPayload): Promise<number> {
  return pushToDevices(
    {
      user: {
        tenantId,
        status: "ACTIVE",
        deletedAt: null,
        userRoles: { some: { role: { rolePermissions: { some: { permission: { key: permissionKey } } } } } },
      },
    },
    payload
  );
}
