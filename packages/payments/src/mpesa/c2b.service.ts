import { prisma, type MpesaC2BTransaction, type Prisma } from "@mashupkgrid/database";
import { topUpWalletWithDb, recordPaymentForInvoiceWithDb } from "@mashupkgrid/billing";
import { ValidationError } from "@mashupkgrid/shared";
import { getMpesaCredentials } from "./config.service.js";

export interface C2BPayload {
  TransID?: string;
  TransTime?: string;
  TransAmount?: string | number;
  BusinessShortCode?: string;
  BillRefNumber?: string;
  MSISDN?: string;
}

export interface C2BResult {
  ResultCode: string;
  ResultDesc: string;
}

/**
 * C2B Validation webhook — Safaricom asks "should I let this payment through?" before crediting
 * the paybill. Phase 3 accepts every validation request (no per-account gatekeeping) — a real
 * limitation kept deliberately simple; rejecting here would need account-number rules a tenant
 * hasn't configured yet. Confirmation (below) is where reconciliation actually happens.
 */
export function handleC2BValidation(_tenantId: string, _rawPayload: unknown): C2BResult {
  return { ResultCode: "0", ResultDesc: "Accepted" };
}

function parseTransTime(transTime: string | undefined): Date {
  // Safaricom sends "YYYYMMDDHHmmss" with no separators, in Africa/Nairobi local time (EAT,
  // UTC+3, no DST) — the explicit +03:00 offset below is required so this parses correctly
  // regardless of the server's own timezone (a UTC-hosted server would otherwise read Safaricom's
  // 14:00 EAT as 14:00 UTC, silently shifting every recorded transactionTime by 3 hours).
  if (!transTime || !/^\d{14}$/.test(transTime)) return new Date();
  const y = transTime.slice(0, 4);
  const mo = transTime.slice(4, 6);
  const d = transTime.slice(6, 8);
  const h = transTime.slice(8, 10);
  const mi = transTime.slice(10, 12);
  const s = transTime.slice(12, 14);
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}+03:00`);
}

/**
 * C2B Confirmation webhook — the payment has already happened on Safaricom's side; we cannot
 * reject it, only record and attempt reconciliation. Attempts an automatic match by
 * `BillRefNumber` against a customer number or invoice number for this tenant; on no match the
 * transaction is stored `reconciled: false` for manual matching in the admin UI
 * (docs/architecture/04-billing-and-payments.md § Reconciliation).
 */
export async function handleC2BConfirmation(tenantId: string, rawPayload: unknown): Promise<MpesaC2BTransaction> {
  const payload = rawPayload as C2BPayload;
  if (!payload.TransID || !payload.BusinessShortCode || payload.TransAmount === undefined) {
    throw new ValidationError("Malformed C2B confirmation payload");
  }

  const transId = payload.TransID;
  const businessShortCode = payload.BusinessShortCode;

  const existing = await prisma.mpesaC2BTransaction.findUnique({ where: { transactionId: transId } });
  if (existing) return existing; // idempotent replay

  // Defense in depth against forged confirmations: Daraja's C2B webhook has no signature to
  // verify (see MPESA_CALLBACK_TOKEN and the route-level check for the primary defense), so a
  // caller who knows a tenant's public paybill/till number and slug could otherwise POST a
  // fabricated confirmation for any BillRefNumber they can guess. A tenant's real paybill number
  // is meant to be public (it's what their own customers are told to pay to), but requiring it to
  // actually match still forces an attacker to know one more real, non-obvious piece of
  // information — a genuine Safaricom confirmation for this tenant would always match, so this
  // never rejects a real payment.
  const credentials = await getMpesaCredentials(tenantId);
  if (businessShortCode !== credentials.shortcode) {
    throw new ValidationError("BusinessShortCode does not match this tenant's configured paybill");
  }

  const amountMinor = Math.round(Number(payload.TransAmount) * 100);
  const billRef = payload.BillRefNumber?.trim();

  return prisma.$transaction(async (tx) => {
    let matchedCustomerId: string | null = null;
    let paymentId: string | null = null;

    if (billRef) {
      const invoice = await tx.invoice.findFirst({
        where: { tenantId, invoiceNumber: billRef, status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] } },
      });
      if (invoice) {
        const result = await recordPaymentForInvoiceWithDb(tx, tenantId, {
          invoiceId: invoice.id,
          method: "MPESA",
          amountMinor,
          reference: transId,
          idempotencyKey: transId,
          // Safaricom already credited the paybill — rejecting for exceeding the invoice's
          // remaining balance would throw here and roll back the whole transaction, losing even
          // the mpesaC2BTransaction audit row below. See allowOverpayment's doc.
          allowOverpayment: true,
        });
        matchedCustomerId = invoice.customerId;
        paymentId = result.payment.id;
      } else {
        const customer = await tx.customer.findFirst({
          where: { tenantId, customerNumber: billRef, deletedAt: null },
        });
        if (customer) {
          const result = await topUpWalletWithDb(tx, tenantId, {
            customerId: customer.id,
            method: "MPESA",
            amountMinor,
            reference: transId,
            idempotencyKey: transId,
          });
          matchedCustomerId = customer.id;
          paymentId = result.payment.id;
        }
      }
    }

    return tx.mpesaC2BTransaction.create({
      data: {
        tenantId,
        transactionId: transId,
        shortcode: businessShortCode ?? "",
        amountMinor,
        msisdn: payload.MSISDN ?? "",
        billRefNumber: billRef ?? null,
        transactionTime: parseTransTime(payload.TransTime),
        matchedCustomerId,
        paymentId,
        rawPayload: rawPayload as Prisma.InputJsonValue,
        reconciled: Boolean(paymentId),
      },
    });
  });
}

/** Manual reconciliation: staff matches an unreconciled C2B transaction to a customer/invoice. */
export async function manuallyReconcileC2BTransaction(
  tenantId: string,
  transactionId: string,
  target: { invoiceId?: string; customerId?: string }
): Promise<MpesaC2BTransaction> {
  return prisma.$transaction(async (tx) => {
    const transaction = await tx.mpesaC2BTransaction.findFirst({ where: { tenantId, transactionId } });
    if (!transaction) throw new ValidationError("Unknown C2B transaction");
    if (transaction.reconciled) throw new ValidationError("Transaction is already reconciled");

    const result = target.invoiceId
      ? await recordPaymentForInvoiceWithDb(tx, tenantId, {
          invoiceId: target.invoiceId,
          method: "MPESA",
          amountMinor: transaction.amountMinor,
          reference: transaction.transactionId,
          idempotencyKey: transaction.transactionId,
        })
      : target.customerId
        ? await topUpWalletWithDb(tx, tenantId, {
            customerId: target.customerId,
            method: "MPESA",
            amountMinor: transaction.amountMinor,
            reference: transaction.transactionId,
            idempotencyKey: transaction.transactionId,
          })
        : null;

    if (!result) throw new ValidationError("Provide either invoiceId or customerId to reconcile against");

    return tx.mpesaC2BTransaction.update({
      where: { id: transaction.id },
      data: {
        matchedCustomerId: target.customerId ?? result.invoice?.customerId ?? null,
        paymentId: result.payment.id,
        reconciled: true,
      },
    });
  });
}
