import { prisma, type CustomerService } from "@mashupkgrid/database";
import { ConflictError, NotFoundError, isAppError } from "@mashupkgrid/shared";
import {
  provisionRadiusUser,
  buildRadiusUsername,
  suspendRadiusUser,
  reactivateRadiusUser,
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

  return prisma.$transaction(async (tx) => {
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
  return prisma.customerService.update({
    where: { id: subscriptionId },
    data: { status: "CANCELLED", autoRenew: false, cancelledAt: new Date() },
  });
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
  return updated;
}
