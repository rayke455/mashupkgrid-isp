import { prisma } from "@mashupkgrid/database";
import { suspendRadiusUser, reactivateRadiusUser } from "@mashupkgrid/radius";
import { isAppError } from "@mashupkgrid/shared";
import { createRenewalInvoice } from "./invoice.service.js";
import { addDays, cycleLengthDays } from "./money.js";

/** Cutting network access is best-effort from billing's perspective: a subscription predating
 *  RADIUS provisioning, or one for a service type with no RADIUS user at all, has nothing to
 *  suspend — the billing status change is still the source of truth and must not be rolled back
 *  just because there was no router-side session to touch. Anything else (a real DB error) is
 *  logged, not swallowed, since it means enforcement silently failed. */
async function bestEffortRadiusSync(tenantId: string, customerServiceId: string, action: "suspend" | "reactivate") {
  try {
    if (action === "suspend") await suspendRadiusUser(tenantId, customerServiceId);
    else await reactivateRadiusUser(tenantId, customerServiceId);
  } catch (err) {
    if (isAppError(err) && err.statusCode === 404) return;
    // eslint-disable-next-line no-console
    console.error(`[billing] failed to ${action} RADIUS access for subscription ${customerServiceId}`, err);
  }
}

export interface JobResult {
  processed: number;
  affected: number;
  errors: number;
}

/**
 * Generates a renewal invoice for every ACTIVE, auto-renewing subscription whose
 * `nextBillingAt` has passed, and advances `nextBillingAt` in the same transaction as the
 * invoice it justifies — so a retried/duplicate job run can never double-bill a customer
 * (docs/architecture/04-billing-and-payments.md, "Automated billing/suspension jobs").
 *
 * Assumes a single worker instance runs this repeatable job (concurrency 1, matching
 * apply-scheduled-maintenance) — a fresh re-read of each subscription inside its own
 * transaction is the guard against a stale in-memory list, not a row lock, so this is not
 * safe to run with multiple concurrent workers processing the same tenant without adding
 * `SELECT ... FOR UPDATE` first.
 */
export async function generateDueRenewalInvoices(): Promise<JobResult> {
  const due = await prisma.customerService.findMany({
    where: { status: "ACTIVE", autoRenew: true, nextBillingAt: { lte: new Date() } },
  });

  let affected = 0;
  let errors = 0;

  for (const candidate of due) {
    try {
      await prisma.$transaction(async (tx) => {
        const fresh = await tx.customerService.findUnique({ where: { id: candidate.id } });
        if (!fresh || fresh.status !== "ACTIVE" || !fresh.autoRenew || fresh.nextBillingAt > new Date()) {
          return; // already processed by an earlier run, or changed since the list was read
        }
        const pkg = await tx.package.findUniqueOrThrow({ where: { id: fresh.packageId } });
        const cycleDays = cycleLengthDays(pkg.billingCycle, pkg.durationDays);

        await createRenewalInvoice(tx, fresh, pkg, fresh.nextBillingAt);
        await tx.customerService.update({
          where: { id: fresh.id },
          data: { nextBillingAt: addDays(fresh.nextBillingAt, cycleDays) },
        });
      });
      affected += 1;
    } catch (err) {
      errors += 1;
      // eslint-disable-next-line no-console
      console.error(`[billing] failed to generate renewal invoice for subscription ${candidate.id}`, err);
    }
  }

  return { processed: due.length, affected, errors };
}

/** Flips PENDING/PARTIALLY_PAID invoices past their due date to OVERDUE. */
export async function markOverdueInvoices(): Promise<JobResult> {
  const result = await prisma.invoice.updateMany({
    where: { status: { in: ["PENDING", "PARTIALLY_PAID"] }, dueDate: { lt: new Date() } },
    data: { status: "OVERDUE" },
  });
  return { processed: result.count, affected: result.count, errors: 0 };
}

/**
 * Suspends ACTIVE subscriptions whose customer has an OVERDUE invoice that's been overdue for
 * longer than the grace period, and best-effort cuts the customer's RADIUS/router access in the
 * same pass (see bestEffortRadiusSync above) — the billing status flip is the source of truth
 * and always happens; the network-side sync is a courtesy that must never block it.
 */
export async function suspendOverdueSubscriptions(gracePeriodDays = 3): Promise<JobResult> {
  const cutoff = new Date(Date.now() - gracePeriodDays * 24 * 60 * 60 * 1000);

  const overdueSubscriptionIds = await prisma.invoice.findMany({
    where: { status: "OVERDUE", dueDate: { lt: cutoff }, customerServiceId: { not: null } },
    select: { customerServiceId: true },
    distinct: ["customerServiceId"],
  });

  let affected = 0;
  for (const { customerServiceId } of overdueSubscriptionIds) {
    if (!customerServiceId) continue;
    const subscription = await prisma.customerService.findUnique({ where: { id: customerServiceId } });
    if (!subscription || subscription.status !== "ACTIVE") continue;

    const result = await prisma.customerService.updateMany({
      where: { id: customerServiceId, status: "ACTIVE" },
      data: { status: "SUSPENDED" },
    });
    if (result.count > 0) {
      await bestEffortRadiusSync(subscription.tenantId, customerServiceId, "suspend");
      affected += result.count;
    }
  }

  return { processed: overdueSubscriptionIds.length, affected, errors: 0 };
}

/** Reactivates SUSPENDED subscriptions once their customer has no remaining unpaid invoices. */
export async function reactivateClearedSubscriptions(): Promise<JobResult> {
  const suspended = await prisma.customerService.findMany({ where: { status: "SUSPENDED" } });

  let affected = 0;
  for (const subscription of suspended) {
    const unpaidCount = await prisma.invoice.count({
      where: {
        customerId: subscription.customerId,
        status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
      },
    });
    if (unpaidCount === 0) {
      await prisma.customerService.update({ where: { id: subscription.id }, data: { status: "ACTIVE" } });
      await bestEffortRadiusSync(subscription.tenantId, subscription.id, "reactivate");
      affected += 1;
    }
  }

  return { processed: suspended.length, affected, errors: 0 };
}
