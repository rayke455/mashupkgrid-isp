import { prisma, type CustomerService } from "@mashupkgrid/database";
import { ConflictError, NotFoundError, isAppError } from "@mashupkgrid/shared";
import {
  provisionRadiusUser,
  buildRadiusUsername,
  suspendRadiusUser,
  reactivateRadiusUser,
  enqueueProvisioningJob,
} from "@mashupkgrid/radius";
import { getCustomerOrThrow } from "./customer.service.js";
import { getPackageOrThrow } from "./package.service.js";
import { createFirstInvoiceForSubscription } from "./invoice.service.js";
import { addDays, cycleLengthDays } from "./money.js";

export interface SubscribeInput {
  customerId: string;
  packageId: string;
  startDate?: Date;
  priceOverrideMinor?: number | null;
  autoRenew?: boolean;
}

export interface SubscribeResult {
  subscription: CustomerService;
  invoiceId: string;
  radiusUsername: string;
  radiusPassword: string;
}

/**
 * Subscribes a customer to a package: creates the CustomerService row, its first (pro-rated)
 * invoice, and its RADIUS identity all in one transaction — a subscription should never exist
 * without the invoice that justifies its first billing period, or without the network access it
 * was sold to provide (docs/architecture/13-phase4-plan.md).
 *
 * A customer's RADIUS username is derived from their (tenant-unique) customer number, so a
 * second concurrent subscription for the same customer will fail this call with a
 * ConflictError — this codebase's current model is one active connection per customer.
 */
/**
 * Queues the network side of a subscription change (spec sections 5, 6 and 7).
 *
 * Called AFTER the billing transaction commits, never inside it: a job row referring to a
 * subscription that then rolls back would be queued work for something that does not exist.
 *
 * Failures here are logged, never thrown. The billing state change is the source of truth and
 * must not be undone because a job could not be queued — and enqueueProvisioningJob already
 * records an unprovisionable package as a FAILED job with the reason, so the operator sees it in
 * the provisioning queue rather than losing it to a swallowed exception.
 */
async function queueNetworkChange(
  tenantId: string,
  customerServiceId: string,
  operation: "PROVISION" | "SUSPEND" | "RESTORE" | "DEPROVISION"
): Promise<void> {
  try {
    await enqueueProvisioningJob(tenantId, { customerServiceId, operation });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[billing] could not queue ${operation} for subscription ${customerServiceId}`,
      err
    );
  }
}

export async function subscribeCustomerToPackage(
  tenantId: string,
  input: SubscribeInput
): Promise<SubscribeResult> {
  const [customer, pkg, tenant] = await Promise.all([
    getCustomerOrThrow(tenantId, input.customerId),
    getPackageOrThrow(tenantId, input.packageId),
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
  ]);
  if (!pkg.isActive) throw new ConflictError("Cannot subscribe a customer to an inactive package");

  const startDate = input.startDate ?? new Date();
  const cycleDays = cycleLengthDays(pkg.billingCycle, pkg.durationDays);
  const nextBillingAt = addDays(startDate, cycleDays);

  const created = await prisma.$transaction(async (tx) => {
    const subscription = await tx.customerService.create({
      data: {
        tenantId,
        customerId: customer.id,
        packageId: pkg.id,
        status: "ACTIVE",
        priceOverrideMinor: input.priceOverrideMinor ?? null,
        startDate,
        nextBillingAt,
        autoRenew: input.autoRenew ?? true,
      },
    });

    const invoice = await createFirstInvoiceForSubscription(tx, subscription, pkg);

    const { plaintextPassword } = await provisionRadiusUser(tx, {
      tenantId,
      tenantSlug: tenant.slug,
      customerId: customer.id,
      customerServiceId: subscription.id,
      customerNumber: customer.customerNumber,
      downloadKbps: pkg.downloadKbps,
      uploadKbps: pkg.uploadKbps,
    });

    return {
      subscription,
      invoiceId: invoice.id,
      radiusUsername: buildRadiusUsername(tenant.slug, customer.customerNumber),
      radiusPassword: plaintextPassword,
    };
  });

  await queueNetworkChange(tenantId, created.subscription.id, "PROVISION");
  return created;
}

/**
 * Moves a subscription onto a different package (spec section 7). The new package brings its own
 * VLAN, speed and profile, so a single PROVISION job re-applies the whole configuration rather
 * than trying to patch individual fields — that is what stops a customer being left half on the
 * old plan and half on the new one, which section 7 explicitly forbids.
 *
 * Billing is deliberately untouched here beyond the package pointer: pro-rating, credit and the
 * invoice for a mid-cycle change are billing decisions this function does not presume to make.
 */
export async function changeSubscriptionPackage(
  tenantId: string,
  subscriptionId: string,
  newPackageId: string
): Promise<CustomerService> {
  const subscription = await getSubscriptionOrThrow(tenantId, subscriptionId);
  if (subscription.status === "CANCELLED") {
    throw new ConflictError("A cancelled subscription cannot change package");
  }
  if (subscription.packageId === newPackageId) {
    throw new ConflictError("This subscription is already on that package");
  }
  const pkg = await getPackageOrThrow(tenantId, newPackageId);
  if (!pkg.isActive) throw new ConflictError("Cannot move a subscription onto an inactive package");

  const updated = await prisma.customerService.update({
    where: { id: subscriptionId },
    data: { packageId: newPackageId },
  });

  // The subscription's network state is now stale by definition — it reflects the OLD package
  // until a device confirms otherwise, so it goes back to PENDING rather than continuing to
  // claim ACTIVE for a configuration that is no longer what the customer pays for.
  await prisma.customerService.update({
    where: { id: subscriptionId },
    data: { provisioningStatus: "PENDING" },
  });

  await queueNetworkChange(tenantId, subscriptionId, "PROVISION");
  return updated;
}

export async function getSubscriptionOrThrow(tenantId: string, subscriptionId: string): Promise<CustomerService> {
  const subscription = await prisma.customerService.findFirst({
    where: { id: subscriptionId, tenantId },
  });
  if (!subscription) throw new NotFoundError("Subscription");
  return subscription;
}

export async function cancelSubscription(tenantId: string, subscriptionId: string): Promise<CustomerService> {
  const subscription = await getSubscriptionOrThrow(tenantId, subscriptionId);
  if (subscription.status === "CANCELLED") {
    throw new ConflictError("Subscription is already cancelled");
  }
  const cancelled = await prisma.customerService.update({
    where: { id: subscriptionId },
    data: { status: "CANCELLED", autoRenew: false, cancelledAt: new Date() },
  });
  // Deprovision removes device configuration. It does NOT delete the customer or the
  // subscription record (spec section 6).
  await queueNetworkChange(tenantId, subscriptionId, "DEPROVISION");
  return cancelled;
}

/** A manual, staff-initiated suspend — unlike the overnight billing-cycle job's version, RADIUS
 *  sync failure here is surfaced (thrown), not swallowed, since staff are waiting on the result
 *  and should know immediately if network access wasn't actually cut. */
export async function suspendSubscription(tenantId: string, subscriptionId: string): Promise<CustomerService> {
  const subscription = await getSubscriptionOrThrow(tenantId, subscriptionId);
  if (subscription.status !== "ACTIVE") {
    throw new ConflictError("Only an ACTIVE subscription can be suspended");
  }
  const updated = await prisma.customerService.update({
    where: { id: subscriptionId },
    data: { status: "SUSPENDED" },
  });
  await suspendRadiusUser(tenantId, subscriptionId).catch((err) => {
    if (!isAppError(err) || err.statusCode !== 404) throw err;
  });
  await queueNetworkChange(tenantId, subscriptionId, "SUSPEND");
  return updated;
}

export async function reactivateSubscription(tenantId: string, subscriptionId: string): Promise<CustomerService> {
  const subscription = await getSubscriptionOrThrow(tenantId, subscriptionId);
  if (subscription.status !== "SUSPENDED") {
    throw new ConflictError("Only a SUSPENDED subscription can be reactivated");
  }
  const updated = await prisma.customerService.update({
    where: { id: subscriptionId },
    data: { status: "ACTIVE" },
  });
  await reactivateRadiusUser(tenantId, subscriptionId).catch((err) => {
    if (!isAppError(err) || err.statusCode !== 404) throw err;
  });
  await queueNetworkChange(tenantId, subscriptionId, "RESTORE");
  return updated;
}
