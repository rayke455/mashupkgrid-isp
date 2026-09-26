import { prisma, type CustomerService } from "@mashupkgrid/database";
import { ConflictError, NotFoundError, ValidationError, resolveTenantPreferences } from "@mashupkgrid/shared";
import { reactivateSubscription, suspendSubscription } from "./subscription.service.js";

/**
 * Pausing a plan: the connection is switched off, and the next bill moves out by the paused
 * days so the customer is not charged for them. A customer may pause up to the ISP's yearly
 * allowance, only while nothing is overdue. Resuming early turns the connection back on and
 * gives the unused days back.
 */

const DAY = 86_400_000;

export interface PauseAllowance {
  enabled: boolean;
  minDays: number;
  maxDaysPerYear: number;
  usedDays: number;
  remainingDays: number;
}

/** Days to give back when a pause ends early. Only whole days already spent paused count, so a
 *  pause ended within its first day uses none. */
export function unusedPauseDays(plannedDays: number, startsAt: Date, now: Date): number {
  const spent = Math.max(0, Math.floor((now.getTime() - startsAt.getTime()) / DAY));
  return Math.max(0, plannedDays - spent);
}

export async function getPauseAllowance(tenantId: string, customerServiceId: string): Promise<PauseAllowance> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { preferences: true } });
  const prefs = resolveTenantPreferences(tenant?.preferences).pauses;
  const pauses = await prisma.servicePause.findMany({ where: { customerServiceId, startsAt: { gte: new Date(Date.now() - 365 * DAY) } }, select: { days: true } });
  const usedDays = pauses.reduce((s, p) => s + p.days, 0);
  return { enabled: prefs.enabled, minDays: prefs.minDays, maxDaysPerYear: prefs.maxDaysPerYear, usedDays, remainingDays: Math.max(0, prefs.maxDaysPerYear - usedDays) };
}

export async function pauseSubscription(tenantId: string, customerServiceId: string, days: number, requestedBy: "customer" | "staff"): Promise<CustomerService> {
  const service = await prisma.customerService.findFirst({ where: { id: customerServiceId, tenantId } });
  if (!service) throw new NotFoundError("Subscription");
  if (service.status !== "ACTIVE") throw new ConflictError("Only an active plan can be paused");
  const allowance = await getPauseAllowance(tenantId, customerServiceId);
  if (!allowance.enabled && requestedBy === "customer") throw new ConflictError("Your provider does not offer pausing");
  if (!Number.isInteger(days) || days < allowance.minDays) throw new ValidationError(`A pause is at least ${allowance.minDays} days`);
  if (requestedBy === "customer" && days > allowance.remainingDays) throw new ValidationError(`You can pause for up to ${allowance.remainingDays} more days this year`);
  const overdue = await prisma.invoice.count({ where: { tenantId, customerId: service.customerId, status: "OVERDUE" } });
  if (overdue > 0) throw new ConflictError("Pay the overdue bill before pausing");

  try {
    await suspendSubscription(tenantId, customerServiceId);
  } catch (err) {
    // Don't leave the plan switched off without a pause to end it.
    await prisma.customerService.updateMany({ where: { id: customerServiceId, status: "SUSPENDED", pausedUntil: null }, data: { status: "ACTIVE" } });
    throw err;
  }
  const endsAt = new Date(Date.now() + days * DAY);
  const [updated] = await prisma.$transaction([
    prisma.customerService.update({
      where: { id: customerServiceId },
      data: { pausedUntil: endsAt, nextBillingAt: new Date(service.nextBillingAt.getTime() + days * DAY) },
    }),
    prisma.servicePause.create({ data: { tenantId, customerServiceId, endsAt, days, requestedBy } }),
  ]);
  return updated;
}

/** Ends a pause: now (early, giving unused days back) or because its time is up. */
export async function resumeSubscription(tenantId: string, customerServiceId: string): Promise<CustomerService> {
  const service = await prisma.customerService.findFirst({ where: { id: customerServiceId, tenantId } });
  if (!service) throw new NotFoundError("Subscription");
  if (!service.pausedUntil) throw new ConflictError("This plan is not paused");
  const pause = await prisma.servicePause.findFirst({ where: { customerServiceId, resumedAt: null }, orderBy: { startsAt: "desc" } });
  const now = Date.now();
  const unusedDays = pause
    ? unusedPauseDays(pause.days, pause.startsAt, new Date(now))
    : Math.max(0, Math.floor((service.pausedUntil.getTime() - now) / DAY));

  await prisma.$transaction([
    prisma.customerService.update({
      where: { id: customerServiceId },
      data: { pausedUntil: null, nextBillingAt: new Date(service.nextBillingAt.getTime() - unusedDays * DAY) },
    }),
    ...(pause ? [prisma.servicePause.update({ where: { id: pause.id }, data: { resumedAt: new Date(now), days: Math.max(0, pause.days - unusedDays) } })] : []),
  ]);
  if (service.status === "SUSPENDED") {
    // Anything that fell overdue meanwhile keeps it off; the normal "pay to reconnect" applies.
    const overdue = await prisma.invoice.count({ where: { tenantId, customerId: service.customerId, status: "OVERDUE" } });
    if (overdue === 0) return reactivateSubscription(tenantId, customerServiceId);
  }
  return prisma.customerService.findUniqueOrThrow({ where: { id: customerServiceId } });
}

/** For the worker: every pause whose time is up. */
export async function resumeDuePauses(): Promise<{ resumed: number; failed: number }> {
  const due = await prisma.customerService.findMany({ where: { pausedUntil: { lte: new Date() } }, select: { id: true, tenantId: true } });
  let resumed = 0;
  let failed = 0;
  for (const s of due) {
    try {
      await resumeSubscription(s.tenantId, s.id);
      resumed += 1;
    } catch (err) {
      failed += 1;
      console.error(`[pauses] could not resume ${s.id}`, err);
    }
  }
  return { resumed, failed };
}
