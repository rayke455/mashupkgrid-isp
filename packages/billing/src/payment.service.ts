import {
  prisma,
  type Payment,
  type Receipt,
  type Invoice,
  type PaymentMethod,
} from "@mashupkgrid/database";
import { ConflictError, NotFoundError, ValidationError } from "@mashupkgrid/shared";
import type { Db } from "./db.js";
import { withRetryOnNumberCollision } from "./sequence.js";
import { creditWallet, debitWallet } from "./wallet.service.js";

async function createReceipt(db: Db, tenantId: string, paymentId: string): Promise<Receipt> {
  return withRetryOnNumberCollision(
    async (attempt) => {
      const count = await db.receipt.count({ where: { tenantId } });
      return `RCT-${String(count + 1 + attempt).padStart(7, "0")}`;
    },
    (receiptNumber) => db.receipt.create({ data: { tenantId, paymentId, receiptNumber } })
  );
}

export interface RecordPaymentResult {
  payment: Payment;
  receipt: Receipt;
  invoice: Invoice | null;
  /** True if this call found an existing payment for the idempotency key instead of creating
   *  a new one — the same callback fired twice must never create two payments. */
  wasAlreadyProcessed: boolean;
}

export interface RecordPaymentForInvoiceInput {
  invoiceId: string;
  method: PaymentMethod;
  amountMinor: number;
  reference?: string | null;
  /** Staff user who recorded a manual payment. Omitted for a gateway-verified payment (Phase 3
   *  M-Pesa callback) — there is no human actor, only a verified Safaricom callback. */
  recordedByUserId?: string | null;
  idempotencyKey: string;
  /** Set by gateway-verified callers only (M-Pesa STK/C2B, Paystack) — the money is already
   *  collected by the time this runs, so an amount exceeding the invoice's remaining balance
   *  must never be rejected (that would throw inside the caller's transaction and roll back the
   *  whole callback handling, silently losing the payment record entirely — see
   *  packages/payments's callback/webhook services). Instead, the excess over what the invoice
   *  needs is credited to the customer's wallet rather than applied to this invoice. Manual
   *  staff-entered payments leave this false, so a staff typo is still rejected up front. */
  allowOverpayment?: boolean;
}

async function recordPaymentForInvoiceCore(
  db: Db,
  tenantId: string,
  input: RecordPaymentForInvoiceInput
): Promise<RecordPaymentResult> {
  if (input.amountMinor <= 0) throw new ValidationError("Payment amount must be positive");

  const existing = await db.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    const receipt = await db.receipt.findUniqueOrThrow({ where: { paymentId: existing.id } });
    const invoice = existing.invoiceId ? await db.invoice.findUnique({ where: { id: existing.invoiceId } }) : null;
    return { payment: existing, receipt, invoice, wasAlreadyProcessed: true };
  }

  const invoice = await db.invoice.findFirst({ where: { id: input.invoiceId, tenantId } });
  if (!invoice) throw new NotFoundError("Invoice");
  if (invoice.status === "VOID" || invoice.status === "CANCELLED") {
    throw new ConflictError(`Cannot record a payment against a ${invoice.status.toLowerCase()} invoice`);
  }
  if (invoice.status === "PAID") {
    throw new ConflictError("Invoice is already fully paid");
  }

  const remainingMinor = invoice.totalMinor - invoice.amountPaidMinor;
  let appliedMinor = input.amountMinor;
  let excessMinor = 0;
  if (input.amountMinor > remainingMinor) {
    if (!input.allowOverpayment) {
      throw new ValidationError("Payment exceeds the remaining invoice balance", {
        remainingMinor,
        attemptedMinor: input.amountMinor,
      });
    }
    // Gateway already collected the full amount — apply what the invoice needs and credit the
    // rest to the wallet below, rather than rejecting money that's already been received.
    appliedMinor = remainingMinor;
    excessMinor = input.amountMinor - remainingMinor;
  }

  if (input.method === "WALLET") {
    await debitWallet(db, invoice.customerId, appliedMinor, `Payment for invoice ${invoice.invoiceNumber}`, {
      referenceType: "Invoice",
      referenceId: invoice.id,
    });
  }

  const payment = await db.payment.create({
    data: {
      tenantId,
      customerId: invoice.customerId,
      invoiceId: invoice.id,
      method: input.method,
      status: "COMPLETED",
      amountMinor: appliedMinor,
      currency: invoice.currency,
      reference: input.reference ?? null,
      idempotencyKey: input.idempotencyKey,
      recordedByUserId: input.recordedByUserId ?? null,
    },
  });

  const amountPaidMinor = invoice.amountPaidMinor + appliedMinor;
  const newStatus = amountPaidMinor >= invoice.totalMinor ? "PAID" : "PARTIALLY_PAID";
  const updatedInvoice = await db.invoice.update({
    where: { id: invoice.id },
    data: {
      amountPaidMinor,
      status: newStatus,
      paidAt: newStatus === "PAID" ? new Date() : invoice.paidAt,
    },
  });

  const receipt = await createReceipt(db, tenantId, payment.id);

  if (excessMinor > 0) {
    await creditWallet(
      db,
      invoice.customerId,
      excessMinor,
      `Overpayment credit — invoice ${invoice.invoiceNumber} was already fully paid`,
      { referenceType: "Payment", referenceId: payment.id }
    );
  }

  return { payment, receipt, invoice: updatedInvoice, wasAlreadyProcessed: false };
}

/**
 * Records a payment (Phase 2: staff-entered cash/bank/wallet; Phase 3: a verified M-Pesa
 * callback) against an invoice. Idempotent on `idempotencyKey`: a duplicate call (double-click,
 * retried request, or a replayed gateway callback) returns the original result instead of
 * creating a second payment (project instruction §15). Opens its own transaction — use
 * `recordPaymentForInvoiceWithDb` to compose this into a larger one (e.g. alongside updating
 * an `MpesaStkRequest` row atomically).
 */
export async function recordPaymentForInvoice(
  tenantId: string,
  input: RecordPaymentForInvoiceInput
): Promise<RecordPaymentResult> {
  return prisma.$transaction((tx) => recordPaymentForInvoiceCore(tx, tenantId, input));
}

/** Same as `recordPaymentForInvoice` but runs against a caller-supplied transaction client
 *  instead of opening its own — for composing into a larger atomic operation. */
export async function recordPaymentForInvoiceWithDb(
  db: Db,
  tenantId: string,
  input: RecordPaymentForInvoiceInput
): Promise<RecordPaymentResult> {
  return recordPaymentForInvoiceCore(db, tenantId, input);
}

export interface TopUpWalletInput {
  customerId: string;
  amountMinor: number;
  method: Exclude<PaymentMethod, "WALLET">;
  currency?: string;
  reference?: string | null;
  /** Omitted for a gateway-verified top-up (Phase 3 M-Pesa C2B confirmation). */
  recordedByUserId?: string | null;
  idempotencyKey: string;
}

async function topUpWalletCore(db: Db, tenantId: string, input: TopUpWalletInput): Promise<RecordPaymentResult> {
  if (input.amountMinor <= 0) throw new ValidationError("Top-up amount must be positive");

  const existing = await db.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    const receipt = await db.receipt.findUniqueOrThrow({ where: { paymentId: existing.id } });
    return { payment: existing, receipt, invoice: null, wasAlreadyProcessed: true };
  }

  const customer = await db.customer.findFirst({
    where: { id: input.customerId, tenantId, deletedAt: null },
  });
  if (!customer) throw new NotFoundError("Customer");

  const payment = await db.payment.create({
    data: {
      tenantId,
      customerId: customer.id,
      invoiceId: null,
      method: input.method,
      status: "COMPLETED",
      amountMinor: input.amountMinor,
      currency: input.currency ?? "KES",
      reference: input.reference ?? null,
      idempotencyKey: input.idempotencyKey,
      recordedByUserId: input.recordedByUserId ?? null,
    },
  });

  await creditWallet(db, customer.id, input.amountMinor, "Wallet top-up", {
    referenceType: "Payment",
    referenceId: payment.id,
  });

  const receipt = await createReceipt(db, tenantId, payment.id);
  return { payment, receipt, invoice: null, wasAlreadyProcessed: false };
}

/** Records a wallet top-up (staff receives cash/bank payment, or a verified M-Pesa C2B
 *  confirmation, not tied to a specific invoice). Opens its own transaction — use
 *  `topUpWalletWithDb` to compose into a larger one. */
export async function topUpWallet(tenantId: string, input: TopUpWalletInput): Promise<RecordPaymentResult> {
  return prisma.$transaction((tx) => topUpWalletCore(tx, tenantId, input));
}

export async function topUpWalletWithDb(
  db: Db,
  tenantId: string,
  input: TopUpWalletInput
): Promise<RecordPaymentResult> {
  return topUpWalletCore(db, tenantId, input);
}

async function refundPaymentCore(db: Db, tenantId: string, paymentId: string, reason: string): Promise<Payment> {
  const payment = await db.payment.findFirst({ where: { id: paymentId, tenantId } });
  if (!payment) throw new NotFoundError("Payment");
  if (payment.status === "REVERSED") throw new ConflictError("Payment has already been reversed");
  if (payment.status !== "COMPLETED") throw new ConflictError("Only a completed payment can be reversed");

  // Both branches move money in a customer's wallet, so both require one. A guest hotspot
  // purchase has no customer and no wallet: reversing it is purely a status change, and the
  // refund itself happens outside this system (the operator returns the cash). Guarding here
  // rather than asserting keeps a hotspot refund from throwing on a null customer.
  if (payment.customerId && payment.method === "WALLET") {
    // This payment had debited the wallet to pay an invoice — credit it back.
    await creditWallet(db, payment.customerId, payment.amountMinor, `Reversal of payment ${payment.id}`, {
      referenceType: "Payment",
      referenceId: payment.id,
    });
  } else if (payment.customerId && !payment.invoiceId) {
    // This was a non-wallet-method top-up (no invoice attached) — debit the credit back out.
    await debitWallet(db, payment.customerId, payment.amountMinor, `Reversal of top-up ${payment.id}`, {
      referenceType: "Payment",
      referenceId: payment.id,
    });
  }

  if (payment.invoiceId) {
    const invoice = await db.invoice.findUniqueOrThrow({ where: { id: payment.invoiceId } });
    const amountPaidMinor = Math.max(0, invoice.amountPaidMinor - payment.amountMinor);
    const newStatus = amountPaidMinor <= 0 ? "PENDING" : amountPaidMinor < invoice.totalMinor ? "PARTIALLY_PAID" : "PAID";
    await db.invoice.update({
      where: { id: invoice.id },
      data: {
        amountPaidMinor,
        status: newStatus,
        paidAt: newStatus === "PAID" ? invoice.paidAt : null,
      },
    });
  }

  return db.payment.update({
    where: { id: paymentId },
    data: { status: "REVERSED", reversedAt: new Date(), reversalReason: reason },
  });
}

export async function refundPayment(tenantId: string, paymentId: string, reason: string): Promise<Payment> {
  return prisma.$transaction((tx) => refundPaymentCore(tx, tenantId, paymentId, reason));
}
