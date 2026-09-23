import { randomInt } from "node:crypto";
import { prisma, type PaymentReference } from "@mashupkgrid/database";
import { NotFoundError } from "@mashupkgrid/shared";
import { isUniqueViolation } from "./common.js";

/**
 * Payment references — what a customer types as the "account number" when paying the platform
 * paybill, and what an STK push carries as its AccountReference. The reference alone identifies
 * tenant, customer and (for an invoice reference) the invoice, so a payment never has to be
 * attributed by guessing from a phone number.
 *
 * Format: "MH" + 8 characters from an alphabet without look-alikes (no 0/O, 1/I/L), e.g.
 * MH7K2Q9XPD. Ten characters fits M-Pesa's 12-character STK AccountReference and is short enough to
 * read over the phone. 31^8 ≈ 850 billion combinations; uniqueness is enforced by the database, and
 * a collision (vanishingly rare) simply draws again.
 */

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const PREFIX = "MH";

export function generateReference(): string {
  let out = PREFIX;
  for (let i = 0; i < 8; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export function looksLikeReference(input: string): boolean {
  return new RegExp(`^${PREFIX}[${ALPHABET}]{8}$`).test(input.toUpperCase().replace(/[\s-]/g, ""));
}

async function createWithRetry(data: Omit<PaymentReference, "id" | "reference" | "createdAt">): Promise<PaymentReference> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.paymentReference.create({ data: { ...data, reference: generateReference() } });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Either the random reference collided (draw again), or another request just created this
      // customer's/invoice's reference (return that one).
      const existing = data.invoiceId
        ? await prisma.paymentReference.findUnique({ where: { invoiceId: data.invoiceId } })
        : await prisma.paymentReference.findFirst({ where: { customerId: data.customerId, purpose: data.purpose } });
      if (existing) return existing;
    }
  }
  throw new Error("Could not allocate a unique payment reference");
}

/** The customer's standing account number for the platform paybill — the same every month. */
export async function getOrCreateCustomerReference(tenantId: string, customerId: string): Promise<PaymentReference> {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId }, select: { id: true } });
  if (!customer) throw new NotFoundError("Customer");
  const existing = await prisma.paymentReference.findFirst({ where: { customerId, purpose: "CUSTOMER_ACCOUNT" } });
  if (existing) return existing;
  return createWithRetry({ tenantId, customerId, invoiceId: null, purpose: "CUSTOMER_ACCOUNT" });
}

/** A reference for one invoice — used for payment links and invoice-specific STK pushes. */
export async function getOrCreateInvoiceReference(tenantId: string, invoiceId: string): Promise<PaymentReference> {
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, tenantId }, select: { id: true, customerId: true } });
  if (!invoice) throw new NotFoundError("Invoice");
  const existing = await prisma.paymentReference.findUnique({ where: { invoiceId } });
  if (existing) return existing;
  return createWithRetry({ tenantId, customerId: invoice.customerId, invoiceId, purpose: "INVOICE" });
}

export async function resolveReference(input: string) {
  const reference = input.toUpperCase().replace(/[\s-]/g, "");
  if (!looksLikeReference(reference)) return null;
  return prisma.paymentReference.findUnique({
    where: { reference },
    include: {
      tenant: { select: { id: true, name: true, slug: true, collectionMode: true, deletedAt: true, status: true } },
      customer: { select: { id: true, fullName: true, customerNumber: true, deletedAt: true } },
      invoice: true,
    },
  });
}
