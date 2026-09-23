import { prisma, type GatewayRefund, type GatewayTransaction, type Prisma } from "@mashupkgrid/database";
import { ConflictError, NotFoundError, ValidationError } from "@mashupkgrid/shared";
import { refundPaymentWithDb } from "@mashupkgrid/billing";
import { appendLedgerEntry } from "../ledger.service.js";
import { feeShareForRefund } from "./fees.js";
import { lockTenantForBalanceChange, nextRefundNumber } from "./common.js";

/**
 * Money going back to the customer after the platform collected it.
 *
 *  - REVERSAL: the whole remaining amount comes back (Safaricom reversed the transaction, or a
 *    payment is being undone). The billing Payment is reversed too, reopening the invoice.
 *  - REFUND: some or all of the amount is returned, e.g. an overpayment. The invoice is untouched.
 *
 * Either way the original transaction and its ledger rows are never edited. The tenant is debited
 * the refunded gross and credited back the matching share of the platform fee — the product
 * decision is that a refund unwinds the fee too — so the tenant's net effect is exactly their net
 * share of what was refunded. A refund can push a tenant's balance negative when the money was
 * already settled to them; they then owe it back out of future collections.
 *
 * The customer is not paid here: M-Pesa offers no API to push a refund back to a customer from a
 * paybill. A REFUND stays PENDING_CUSTOMER_PAYOUT until a super admin records how the customer was
 * paid back. A REVERSAL done by Safaricom has already returned the money, so it is COMPLETED.
 */

export interface RecordRefundInput {
  gatewayTransactionId: string;
  kind: GatewayRefund["kind"];
  /** Required for REFUND; a REVERSAL always takes the full remaining amount. */
  amountMinor?: number;
  reason: string;
  /** For a REVERSAL: whether Safaricom has already returned the money (e.g. a reversal they
   *  processed). False means someone still has to pay the customer back. */
  moneyAlreadyReturned?: boolean;
  externalReference?: string | null;
  userId: string;
  /** Scope check: when set, the transaction must belong to this tenant. */
  tenantId?: string;
}

export async function recordGatewayRefund(input: RecordRefundInput): Promise<{ refund: GatewayRefund; transaction: GatewayTransaction }> {
  return prisma.$transaction((tx) => recordGatewayRefundTx(tx, input));
}

export async function recordGatewayRefundTx(
  tx: Prisma.TransactionClient,
  input: RecordRefundInput
): Promise<{ refund: GatewayRefund; transaction: GatewayTransaction }> {
  if (!input.reason.trim()) throw new ValidationError("A reason is required.");

  const peek = await tx.gatewayTransaction.findUnique({
    where: { id: input.gatewayTransactionId },
    select: { tenantId: true },
  });
  if (!peek || (input.tenantId && peek.tenantId !== input.tenantId)) throw new NotFoundError("Transaction");

  await lockTenantForBalanceChange(tx, peek.tenantId);
  await tx.$queryRaw`SELECT "id" FROM "gateway_transactions" WHERE "id" = ${input.gatewayTransactionId} FOR UPDATE`;
  const txn = await tx.gatewayTransaction.findUniqueOrThrow({ where: { id: input.gatewayTransactionId } });

  if (txn.status === "REVERSED" || txn.status === "REFUNDED") {
    throw new ConflictError(`${txn.txnNumber} has already been fully ${txn.status === "REVERSED" ? "reversed" : "refunded"}.`);
  }
  const remaining = txn.grossMinor - txn.refundedMinor;
  const amountMinor = input.kind === "REVERSAL" ? remaining : input.amountMinor ?? 0;
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new ValidationError("Enter an amount to refund.");
  if (amountMinor > remaining) {
    throw new ValidationError(`Only ${remaining / 100} ${txn.currency} of ${txn.txnNumber} is left to refund.`);
  }

  const previous = await tx.gatewayRefund.aggregate({
    where: { gatewayTransactionId: txn.id },
    _sum: { feeReturnedMinor: true },
  });
  const feeReturnedMinor = feeShareForRefund({
    grossMinor: txn.grossMinor,
    feeMinor: txn.feeMinor,
    alreadyRefundedMinor: txn.refundedMinor,
    feeAlreadyReturnedMinor: previous._sum.feeReturnedMinor ?? 0,
    refundMinor: amountMinor,
  });

  const completed = input.kind === "REVERSAL" && input.moneyAlreadyReturned === true;
  const refund = await tx.gatewayRefund.create({
    data: {
      refundNumber: await nextRefundNumber(tx),
      tenantId: txn.tenantId,
      gatewayTransactionId: txn.id,
      kind: input.kind,
      amountMinor,
      feeReturnedMinor,
      reason: input.reason.trim().slice(0, 500),
      status: completed ? "COMPLETED" : "PENDING_CUSTOMER_PAYOUT",
      externalReference: input.externalReference?.trim() || null,
      createdByUserId: input.userId,
      ...(completed ? { completedAt: new Date(), completedByUserId: input.userId } : {}),
    },
  });

  await appendLedgerEntry(tx, {
    tenantId: txn.tenantId,
    direction: "DEBIT",
    entryType: input.kind === "REVERSAL" ? "PAYMENT_REVERSAL" : "REFUND",
    amountMinor,
    currency: txn.currency,
    description: `${input.kind === "REVERSAL" ? "Reversal" : "Refund"} ${refund.refundNumber} of ${txn.txnNumber}`,
    sourceType: "GatewayRefund",
    sourceId: refund.id,
    gatewayTransactionId: txn.id,
    createdByUserId: input.userId,
  });
  if (feeReturnedMinor > 0) {
    await appendLedgerEntry(tx, {
      tenantId: txn.tenantId,
      direction: "CREDIT",
      entryType: "FEE_REVERSAL",
      amountMinor: feeReturnedMinor,
      currency: txn.currency,
      description: `Platform fee returned with ${refund.refundNumber}`,
      sourceType: "GatewayRefundFee",
      sourceId: refund.id,
      gatewayTransactionId: txn.id,
      createdByUserId: input.userId,
    });
  }

  const refundedMinor = txn.refundedMinor + amountMinor;
  const transaction = await tx.gatewayTransaction.update({
    where: { id: txn.id },
    data: {
      refundedMinor,
      status: refundedMinor < txn.grossMinor ? "PARTIALLY_REFUNDED" : input.kind === "REVERSAL" ? "REVERSED" : "REFUNDED",
    },
  });

  // A full reversal also undoes the billing side: the Payment is marked reversed and the invoice
  // reopened (or the wallet top-up taken back) — unless the caller has already done that.
  if (input.kind === "REVERSAL") {
    const payment = await tx.payment.findUnique({ where: { id: txn.paymentId }, select: { status: true } });
    if (payment?.status === "COMPLETED") {
      await refundPaymentWithDb(tx, txn.tenantId, txn.paymentId, input.reason.trim());
    }
  }

  return { refund, transaction };
}

/** Records how a pending customer refund was actually paid back. */
export async function completeGatewayRefund(refundId: string, externalReference: string, userId: string): Promise<GatewayRefund> {
  if (!externalReference.trim()) throw new ValidationError("Enter the M-Pesa or bank reference of the refund to the customer.");
  const updated = await prisma.gatewayRefund.updateMany({
    where: { id: refundId, status: "PENDING_CUSTOMER_PAYOUT" },
    data: {
      status: "COMPLETED",
      externalReference: externalReference.trim().slice(0, 64),
      completedByUserId: userId,
      completedAt: new Date(),
    },
  });
  if (updated.count === 0) throw new ConflictError("This refund is not waiting for a customer payout.");
  return prisma.gatewayRefund.findUniqueOrThrow({ where: { id: refundId } });
}

/**
 * Hook for the existing tenant-side "reverse payment" flow: if the platform collected that payment,
 * the reversal must also come off the tenant's balance (previously it did not, so a tenant kept
 * money that was refunded). Runs inside the billing reversal's transaction.
 */
export async function reverseGatewayTransactionForPayment(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; paymentId: string; reason: string; userId: string }
): Promise<GatewayRefund | null> {
  const txn = await tx.gatewayTransaction.findUnique({ where: { paymentId: input.paymentId } });
  if (!txn || txn.tenantId !== input.tenantId) return null;
  if (txn.status === "REVERSED" || txn.status === "REFUNDED") return null;
  const { refund } = await recordGatewayRefundTx(tx, {
    gatewayTransactionId: txn.id,
    kind: "REVERSAL",
    reason: input.reason,
    // The platform is holding this customer's money; a super admin must still send it back.
    moneyAlreadyReturned: false,
    userId: input.userId,
    tenantId: input.tenantId,
  });
  return refund;
}
