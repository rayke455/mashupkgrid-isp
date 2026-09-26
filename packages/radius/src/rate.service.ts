import { prisma } from "@mashupkgrid/database";
import { queueSyncTask } from "./sync.service.js";

/**
 * A subscriber's speed is their plan's, unless they bought a speed boost that is running now:
 * then the fastest running boost applies. A boost never makes anyone slower than their plan.
 */

export interface Rate {
  downloadKbps: number;
  uploadKbps: number;
}

export function pickEffectiveRate(plan: Rate, boosts: { downloadKbps: number | null; uploadKbps: number | null }[]): Rate {
  let best = plan;
  for (const b of boosts) {
    const candidate = { downloadKbps: Math.max(plan.downloadKbps, b.downloadKbps ?? 0), uploadKbps: Math.max(plan.uploadKbps, b.uploadKbps ?? 0) };
    if (candidate.downloadKbps > best.downloadKbps || (candidate.downloadKbps === best.downloadKbps && candidate.uploadKbps > best.uploadKbps)) best = candidate;
  }
  return best;
}

export const rateLimitValue = (r: Rate) => `${r.uploadKbps}k/${r.downloadKbps}k`;

export async function effectiveRateFor(customerServiceId: string, plan: Rate, now = new Date()): Promise<Rate> {
  const boosts = await prisma.addOnPurchase.findMany({
    where: { customerServiceId, kind: "SPEED", status: "ACTIVE", startsAt: { lte: now }, endsAt: { gt: now } },
    select: { downloadKbps: true, uploadKbps: true },
  });
  return pickEffectiveRate(plan, boosts);
}

/**
 * Writes the subscriber's current speed to RADIUS and, if they are online, drops the session so
 * the router picks the new speed up on the automatic reconnect a few seconds later.
 */
export async function refreshSubscriberRate(tenantId: string, customerServiceId: string): Promise<Rate | null> {
  const service = await prisma.customerService.findFirst({
    where: { id: customerServiceId, tenantId },
    include: { package: { select: { downloadKbps: true, uploadKbps: true } }, radiusUser: true },
  });
  if (!service?.radiusUser) return null;
  const rate = await effectiveRateFor(service.id, service.package);
  const username = service.radiusUser.username;
  await prisma.$transaction([
    prisma.radReply.deleteMany({ where: { username, attribute: "Mikrotik-Rate-Limit" } }),
    prisma.radReply.create({ data: { username, attribute: "Mikrotik-Rate-Limit", op: "=", value: rateLimitValue(rate) } }),
    prisma.radiusUser.update({ where: { id: service.radiusUser.id }, data: { downloadKbps: rate.downloadKbps, uploadKbps: rate.uploadKbps } }),
  ]);
  if (service.radiusUser.status === "ACTIVE") await queueSyncTask(tenantId, service.radiusUser.id, "DISCONNECT_USER");
  return rate;
}
