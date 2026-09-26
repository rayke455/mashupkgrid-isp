import { prisma, type AddOn, type AddOnPurchase, type Invoice } from "@mashupkgrid/database";
import { ConflictError, NotFoundError, ValidationError } from "@mashupkgrid/shared";
import { refreshSubscriberRate } from "@mashupkgrid/radius";
import { createAddOnInvoice } from "./invoice.service.js";

/**
 * Prepaid add-ons for PPPoE plans: a speed boost or extra data for some hours, bought with
 * M-Pesa. Buying makes a one-off invoice; the add-on starts the moment that invoice is paid and
 * ends by itself when its hours are up. Buying the same add-on again while it runs adds the
 * hours on. An add-on left unpaid is cancelled, with its invoice, after two hours.
 */

const HOUR = 3_600_000;
export const ABANDON_AFTER_MS = 2 * HOUR;

export interface AddOnInput {
  name: string;
  kind: "SPEED" | "DATA";
  downloadKbps?: number | null;
  uploadKbps?: number | null;
  dataMb?: number | null;
  durationHours: number;
  priceMinor: number;
  isActive?: boolean;
}

export function validateAddOn(input: AddOnInput): void {
  if (input.kind === "SPEED" && (!input.downloadKbps || !input.uploadKbps)) throw new ValidationError("A speed boost needs a download and upload speed");
  if (input.kind === "DATA" && !input.dataMb) throw new ValidationError("A data add-on needs an amount of data");
}

export async function listAddOns(tenantId: string, onlyActive = false): Promise<AddOn[]> {
  return prisma.addOn.findMany({ where: { tenantId, deletedAt: null, ...(onlyActive ? { isActive: true } : {}) }, orderBy: [{ kind: "asc" }, { priceMinor: "asc" }] });
}

export async function createAddOn(tenantId: string, input: AddOnInput): Promise<AddOn> {
  validateAddOn(input);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { currency: true } });
  return prisma.addOn.create({
    data: {
      tenantId,
      name: input.name,
      kind: input.kind,
      downloadKbps: input.kind === "SPEED" ? input.downloadKbps! : null,
      uploadKbps: input.kind === "SPEED" ? input.uploadKbps! : null,
      dataMb: input.kind === "DATA" ? input.dataMb! : null,
      durationHours: input.durationHours,
      priceMinor: input.priceMinor,
      currency: tenant.currency,
      isActive: input.isActive ?? true,
    },
  });
}

export async function updateAddOn(tenantId: string, id: string, input: Partial<AddOnInput>): Promise<AddOn> {
  const existing = await prisma.addOn.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!existing) throw new NotFoundError("Add-on");
  const merged = { ...existing, ...input } as AddOnInput;
  validateAddOn(merged);
  return prisma.addOn.update({
    where: { id },
    data: {
      name: merged.name,
      downloadKbps: merged.kind === "SPEED" ? merged.downloadKbps : null,
      uploadKbps: merged.kind === "SPEED" ? merged.uploadKbps : null,
      dataMb: merged.kind === "DATA" ? merged.dataMb : null,
      durationHours: merged.durationHours,
      priceMinor: merged.priceMinor,
      isActive: merged.isActive,
    },
  });
}

export async function deleteAddOn(tenantId: string, id: string): Promise<void> {
  const res = await prisma.addOn.updateMany({ where: { id, tenantId, deletedAt: null }, data: { deletedAt: new Date(), isActive: false } });
  if (res.count === 0) throw new NotFoundError("Add-on");
}

/** Starts a purchase: checks the plan can take it and makes the invoice to pay. */
export async function buyAddOn(
  tenantId: string,
  customerServiceId: string,
  addOnId: string,
  requestedBy: "customer" | "staff"
): Promise<{ purchase: AddOnPurchase; invoice: Invoice }> {
  const [service, addOn] = await Promise.all([
    prisma.customerService.findFirst({ where: { id: customerServiceId, tenantId }, include: { radiusUser: { select: { id: true } }, package: { select: { taxPercent: true } } } }),
    prisma.addOn.findFirst({ where: { id: addOnId, tenantId, deletedAt: null, isActive: true } }),
  ]);
  if (!service) throw new NotFoundError("Subscription");
  if (!addOn) throw new NotFoundError("Add-on");
  if (service.status !== "ACTIVE") throw new ConflictError("Add-ons can only be bought for an active plan");
  if (!service.radiusUser) throw new ConflictError("This plan has no internet login to apply an add-on to");

  // A second tap on "Buy" reuses the waiting invoice instead of making another.
  const waiting = await prisma.addOnPurchase.findFirst({
    where: { customerServiceId, addOnId, status: "AWAITING_PAYMENT", invoice: { status: "PENDING" } },
    include: { invoice: true },
  });
  if (waiting?.invoice) return { purchase: waiting, invoice: waiting.invoice };

  return prisma.$transaction(async (tx) => {
    const invoice = await createAddOnInvoice(tx, {
      tenantId,
      customerId: service.customerId,
      customerServiceId,
      description: `Add-on: ${addOn.name} (${addOn.durationHours} hours)`,
      priceMinor: addOn.priceMinor,
      currency: addOn.currency,
      taxPercent: service.package.taxPercent,
    });
    const purchase = await tx.addOnPurchase.create({
      data: {
        tenantId,
        customerId: service.customerId,
        customerServiceId,
        addOnId,
        invoiceId: invoice.id,
        name: addOn.name,
        kind: addOn.kind,
        downloadKbps: addOn.downloadKbps,
        uploadKbps: addOn.uploadKbps,
        dataMb: addOn.dataMb,
        durationHours: addOn.durationHours,
        priceMinor: addOn.priceMinor,
        currency: addOn.currency,
        requestedBy,
      },
    });
    return { purchase, invoice };
  });
}

/** When an add-on bought now should end: after its hours, or after those of the same add-on
 *  already running if there is one. */
export function addOnEndsAt(now: Date, durationHours: number, runningEndsAt: Date | null): Date {
  const from = runningEndsAt && runningEndsAt > now ? runningEndsAt : now;
  return new Date(from.getTime() + durationHours * HOUR);
}

async function activate(purchase: AddOnPurchase): Promise<AddOnPurchase | null> {
  const now = new Date();
  const running = purchase.addOnId
    ? await prisma.addOnPurchase.findFirst({
        where: { customerServiceId: purchase.customerServiceId, addOnId: purchase.addOnId, status: "ACTIVE", endsAt: { gt: now } },
        orderBy: { endsAt: "desc" },
      })
    : null;
  const endsAt = addOnEndsAt(now, purchase.durationHours, running?.endsAt ?? null);
  const claimed = await prisma.addOnPurchase.updateMany({ where: { id: purchase.id, status: "AWAITING_PAYMENT" }, data: { status: "ACTIVE", startsAt: now, endsAt } });
  if (claimed.count === 0) return null;
  // The running one now ends with this one, so the extension is visible on both.
  if (running) await prisma.addOnPurchase.update({ where: { id: running.id }, data: { endsAt } });
  if (purchase.kind === "SPEED") {
    await refreshSubscriberRate(purchase.tenantId, purchase.customerServiceId).catch((err) => console.error(`[addons] could not apply boost ${purchase.id}`, err));
  }
  return prisma.addOnPurchase.findUnique({ where: { id: purchase.id } });
}

/** Starts every add-on whose invoice has been paid. Pass a customer to check only theirs. */
export async function activatePaidAddOns(filter: { tenantId?: string; customerId?: string } = {}): Promise<AddOnPurchase[]> {
  const paid = await prisma.addOnPurchase.findMany({ where: { ...filter, status: "AWAITING_PAYMENT", invoice: { status: "PAID" } } });
  const started: AddOnPurchase[] = [];
  for (const p of paid) {
    const a = await activate(p);
    if (a) started.push(a);
  }
  return started;
}

/** Ends add-ons whose time is up and puts the plan's own speed back. */
export async function expireAddOns(now = new Date()): Promise<AddOnPurchase[]> {
  const due = await prisma.addOnPurchase.findMany({ where: { status: "ACTIVE", endsAt: { lte: now } } });
  for (const p of due) {
    await prisma.addOnPurchase.update({ where: { id: p.id }, data: { status: "EXPIRED" } });
  }
  const services = new Map(due.filter((p) => p.kind === "SPEED").map((p) => [p.customerServiceId, p.tenantId]));
  for (const [serviceId, tenantId] of services) {
    await refreshSubscriberRate(tenantId, serviceId).catch((err) => console.error(`[addons] could not restore speed for ${serviceId}`, err));
  }
  return due;
}

/** Cancels purchases nobody paid for, with their invoices, so they never fall overdue. */
export async function cancelAbandonedAddOns(now = new Date()): Promise<number> {
  const stale = await prisma.addOnPurchase.findMany({
    where: { status: "AWAITING_PAYMENT", createdAt: { lt: new Date(now.getTime() - ABANDON_AFTER_MS) } },
    include: { invoice: { select: { id: true, status: true, amountPaidMinor: true } } },
  });
  let cancelled = 0;
  for (const p of stale) {
    // Anything paid, even in part, waits for staff rather than being thrown away.
    if (p.invoice && (p.invoice.amountPaidMinor > 0 || !["PENDING", "OVERDUE"].includes(p.invoice.status))) continue;
    await prisma.$transaction([
      prisma.addOnPurchase.update({ where: { id: p.id }, data: { status: "CANCELLED" } }),
      ...(p.invoice ? [prisma.invoice.update({ where: { id: p.invoice.id }, data: { status: "CANCELLED" } })] : []),
    ]);
    cancelled += 1;
  }
  return cancelled;
}

export async function sweepAddOns(): Promise<{ activated: number; expired: number; cancelled: number }> {
  const activated = (await activatePaidAddOns()).length;
  const expired = (await expireAddOns()).length;
  const cancelled = await cancelAbandonedAddOns();
  return { activated, expired, cancelled };
}

/** Extra MB from data add-ons running now, per plan. */
export async function activeDataBonusMb(customerServiceIds: string[], now = new Date()): Promise<Map<string, number>> {
  if (!customerServiceIds.length) return new Map();
  const rows = await prisma.addOnPurchase.groupBy({
    by: ["customerServiceId"],
    where: { customerServiceId: { in: customerServiceIds }, kind: "DATA", status: "ACTIVE", startsAt: { lte: now }, endsAt: { gt: now } },
    _sum: { dataMb: true },
  });
  return new Map(rows.map((r) => [r.customerServiceId, r._sum.dataMb ?? 0]));
}

export async function listPurchasesForCustomer(customerId: string, take = 20) {
  return prisma.addOnPurchase.findMany({ where: { customerId, status: { not: "CANCELLED" } }, orderBy: { createdAt: "desc" }, take });
}

/** Staff give an add-on for free (a goodwill gesture, or after an outage). Starts at once. */
export async function grantAddOn(tenantId: string, customerServiceId: string, addOnId: string): Promise<AddOnPurchase> {
  const [service, addOn] = await Promise.all([
    prisma.customerService.findFirst({ where: { id: customerServiceId, tenantId }, include: { radiusUser: { select: { id: true } } } }),
    prisma.addOn.findFirst({ where: { id: addOnId, tenantId, deletedAt: null } }),
  ]);
  if (!service) throw new NotFoundError("Subscription");
  if (!addOn) throw new NotFoundError("Add-on");
  if (service.status !== "ACTIVE") throw new ConflictError("Add-ons can only be given to an active plan");
  if (!service.radiusUser) throw new ConflictError("This plan has no internet login to apply an add-on to");
  const purchase = await prisma.addOnPurchase.create({
    data: {
      tenantId,
      customerId: service.customerId,
      customerServiceId,
      addOnId,
      name: addOn.name,
      kind: addOn.kind,
      downloadKbps: addOn.downloadKbps,
      uploadKbps: addOn.uploadKbps,
      dataMb: addOn.dataMb,
      durationHours: addOn.durationHours,
      priceMinor: 0,
      currency: addOn.currency,
      requestedBy: "staff",
    },
  });
  return (await activate(purchase)) ?? purchase;
}

export async function listRecentPurchases(tenantId: string, take = 100) {
  return prisma.addOnPurchase.findMany({
    where: { tenantId, status: { not: "CANCELLED" } },
    include: { customer: { select: { id: true, fullName: true, customerNumber: true } } },
    orderBy: { createdAt: "desc" },
    take,
  });
}

/** Cancels a purchase whose payment could not even be started, so its invoice doesn't linger. */
export async function cancelUnstartedPurchase(purchaseId: string): Promise<void> {
  const p = await prisma.addOnPurchase.findUnique({ where: { id: purchaseId }, include: { invoice: { select: { id: true, amountPaidMinor: true, status: true } } } });
  if (!p || p.status !== "AWAITING_PAYMENT" || (p.invoice && (p.invoice.amountPaidMinor > 0 || p.invoice.status !== "PENDING"))) return;
  await prisma.$transaction([
    prisma.addOnPurchase.update({ where: { id: p.id }, data: { status: "CANCELLED" } }),
    ...(p.invoice ? [prisma.invoice.update({ where: { id: p.invoice.id }, data: { status: "CANCELLED" } })] : []),
  ]);
}
