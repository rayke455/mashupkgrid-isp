import { prisma, type Invoice, type CustomerService, type Package } from "@mashupkgrid/database";
import { ConflictError, NotFoundError } from "@mashupkgrid/shared";
import type { Db } from "./db.js";
import { withRetryOnNumberCollision } from "./sequence.js";
import { addDays, cycleLengthDays, proRataAmountMinor, taxAmountMinor } from "./money.js";

async function generateInvoiceNumber(db: Db, tenantId: string, attempt: number): Promise<string> {
  const count = await db.invoice.count({ where: { tenantId } });
  return `INV-${String(count + 1 + attempt).padStart(7, "0")}`;
}

interface DraftLineItem {
  description: string;
  quantity: number;
  unitPriceMinor: number;
  totalMinor: number;
}

async function createInvoice(
  db: Db,
  tenantId: string,
  customerId: string,
  customerServiceId: string | null,
  items: DraftLineItem[],
  taxPercent: number | null,
  dueDate: Date,
  currency: string
): Promise<Invoice> {
  const subtotalMinor = items.reduce((sum, item) => sum + item.totalMinor, 0);
  const taxMinor = taxAmountMinor(subtotalMinor, taxPercent);
  const totalMinor = subtotalMinor + taxMinor;

  return withRetryOnNumberCollision(
    (attempt) => generateInvoiceNumber(db, tenantId, attempt),
    (invoiceNumber) =>
      db.invoice.create({
        data: {
          tenantId,
          customerId,
          customerServiceId,
          invoiceNumber,
          status: "PENDING",
          subtotalMinor,
          taxMinor,
          totalMinor,
          currency,
          dueDate,
          items: { create: items },
        },
      })
  );
}

/**
 * First invoice for a new subscription, plus one-time installation/activation fees as separate
 * line items (never silently folded into the recurring charge — they should be visible on the
 * invoice as distinct fees).
 *
 * This always bills a full cycle, not a pro-rated one: subscription.service.ts sets
 * `nextBillingAt = startDate + cycleDays` for every new subscription (there's no calendar-anchored
 * billing date — e.g. "always the 1st of the month" — for pro-ration to shorten against), so
 * `daysRemaining` below is always exactly `cycleDays`. proRataAmountMinor is still applied (rather
 * than just using basePrice directly) so this keeps working correctly the moment a caller *does*
 * anchor nextBillingAt to a shorter first period.
 */
export async function createFirstInvoiceForSubscription(
  db: Db,
  subscription: CustomerService,
  pkg: Package
): Promise<Invoice> {
  const cycleDays = cycleLengthDays(pkg.billingCycle, pkg.durationDays);
  const daysRemaining = Math.max(
    0,
    Math.ceil((subscription.nextBillingAt.getTime() - subscription.startDate.getTime()) / (24 * 60 * 60 * 1000))
  );
  const basePrice = subscription.priceOverrideMinor ?? pkg.priceMinor;
  const proRatedMinor = proRataAmountMinor(basePrice, daysRemaining, cycleDays);

  const items: DraftLineItem[] = [
    {
      description:
        daysRemaining >= cycleDays
          ? `${pkg.name} — first billing cycle (${cycleDays} days)`
          : `${pkg.name} — pro-rated (${daysRemaining} of ${cycleDays} days)`,
      quantity: 1,
      unitPriceMinor: proRatedMinor,
      totalMinor: proRatedMinor,
    },
  ];
  if (pkg.installationFeeMinor > 0) {
    items.push({
      description: "Installation fee",
      quantity: 1,
      unitPriceMinor: pkg.installationFeeMinor,
      totalMinor: pkg.installationFeeMinor,
    });
  }
  if (pkg.activationFeeMinor > 0) {
    items.push({
      description: "Activation fee",
      quantity: 1,
      unitPriceMinor: pkg.activationFeeMinor,
      totalMinor: pkg.activationFeeMinor,
    });
  }

  return createInvoice(
    db,
    subscription.tenantId,
    subscription.customerId,
    subscription.id,
    items,
    pkg.taxPercent,
    subscription.nextBillingAt,
    pkg.currency
  );
}

/** Full-price renewal invoice at a billing cycle boundary. Used by the scheduled worker job. */
export async function createRenewalInvoice(
  db: Db,
  subscription: CustomerService,
  pkg: Package,
  dueDate: Date
): Promise<Invoice> {
  const basePrice = subscription.priceOverrideMinor ?? pkg.priceMinor;
  const items: DraftLineItem[] = [
    { description: `${pkg.name} — renewal`, quantity: 1, unitPriceMinor: basePrice, totalMinor: basePrice },
  ];
  return createInvoice(
    db,
    subscription.tenantId,
    subscription.customerId,
    subscription.id,
    items,
    pkg.taxPercent,
    dueDate,
    pkg.currency
  );
}

export async function getInvoiceOrThrow(tenantId: string, invoiceId: string): Promise<Invoice> {
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, tenantId } });
  if (!invoice) throw new NotFoundError("Invoice");
  return invoice;
}

export async function voidInvoice(tenantId: string, invoiceId: string): Promise<Invoice> {
  const invoice = await getInvoiceOrThrow(tenantId, invoiceId);
  if (invoice.status === "PAID" || invoice.status === "PARTIALLY_PAID") {
    throw new ConflictError(
      "Cannot void an invoice that has payments applied — issue a refund on the payment(s) instead"
    );
  }
  return prisma.invoice.update({ where: { id: invoiceId }, data: { status: "VOID", voidedAt: new Date() } });
}
