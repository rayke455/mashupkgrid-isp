import { createHmac } from "node:crypto";
import { prisma, type Prisma } from "@mashupkgrid/database";
import { NotFoundError, timingSafeStringEqual, generateSecureToken } from "@mashupkgrid/shared";
import { recordPaymentForInvoiceWithDb, topUpWalletWithDb } from "@mashupkgrid/billing";

/** Paystack signs every webhook with HMAC-SHA512 of the *raw* request body, keyed by the
 *  tenant's own secret key (docs.paystack.com/docs/webhooks — "Validating webhooks"). This is
 *  the whole reason the webhook route must read the body as a raw string/buffer before any JSON
 *  parsing touches it — re-serializing a parsed object rarely byte-matches what Paystack signed.
 */
export function isValidPaystackSignature(rawBody: string, signatureHeader: string | undefined, secretKey: string): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody).digest("hex");
  return timingSafeStringEqual(expected, signatureHeader);
}

interface PaystackWebhookEvent {
  event: string;
  data: {
    reference: string;
    status: string;
    amount: number;
    gateway_response: string;
  };
}

export interface PaystackWebhookOutcome {
  handled: boolean;
  reference?: string;
}

/** Entry point for a verified Paystack webhook POST. The route handler is responsible for
 *  signature verification *before* calling this — this function assumes the payload is
 *  already trusted, the same division of responsibility as handleStkCallback vs. Safaricom's
 *  IP-allowlist-only "verification". */
export async function handlePaystackWebhook(tenantId: string, payload: PaystackWebhookEvent): Promise<PaystackWebhookOutcome> {
  if (payload.event !== "charge.success" && !payload.event.startsWith("charge.")) {
    return { handled: false };
  }

  const reference = payload.data.reference;
  const existing = await prisma.paystackTransaction.findUnique({ where: { reference } });
  if (!existing || existing.tenantId !== tenantId) {
    return { handled: false, reference };
  }

  await completePaystackTransaction(tenantId, reference, {
    status: payload.data.status,
    amountMinor: payload.data.amount,
    gatewayResponse: payload.data.gateway_response,
    raw: payload,
  });

  return { handled: true, reference };
}

export interface PaystackResultInput {
  status: string;
  amountMinor: number;
  gatewayResponse: string;
  raw: unknown;
}

/**
 * Applies a resolved Paystack result (from a verified webhook, or an explicit verify call) to
 * the `PaystackTransaction` row and — on success — creates the `Payment` or Hotspot Voucher atomically.
 * Idempotent: a transaction no longer PENDING is returned as-is.
 */
export async function completePaystackTransaction(
  tenantId: string,
  reference: string,
  result: PaystackResultInput
) {
  return prisma.$transaction(async (tx) => {
    const transaction = await tx.paystackTransaction.findUnique({ where: { reference } });
    if (!transaction || transaction.tenantId !== tenantId) throw new NotFoundError("Paystack transaction");
    if (transaction.status !== "PENDING") return transaction;

    const rawWebhook = result.raw as Prisma.InputJsonValue;

    if (result.status === "success") {
      let paymentId: string | null = null;
      let voucherCode: string | null = null;

      // 1. Hotspot Guest Package Purchase
      if (transaction.hotspotPackageId) {
        const pkg = await tx.hotspotPackage.findUniqueOrThrow({
          where: { id: transaction.hotspotPackageId },
        });

        const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        const rawToken = generateSecureToken(8);
        let code = "";
        for (let i = 0; i < 8; i++) {
          code += CODE_ALPHABET[rawToken.charCodeAt(i % rawToken.length) % CODE_ALPHABET.length];
        }
        voucherCode = code;

        await tx.hotspotVoucher.create({
          data: {
            tenantId,
            code,
            hotspotPackageId: pkg.id,
            durationMinutes: pkg.durationMinutes,
            dataCapMb: pkg.dataCapMb,
            downloadKbps: pkg.downloadKbps,
            uploadKbps: pkg.uploadKbps,
            status: "UNUSED",
          },
        });

        await tx.radCheck.create({
          data: { username: code, attribute: "Cleartext-Password", op: ":=", value: code },
        });
        if (pkg.durationMinutes) {
          await tx.radReply.create({
            data: {
              username: code,
              attribute: "Session-Timeout",
              op: "=",
              value: String(pkg.durationMinutes * 60),
            },
          });
        }
        if (pkg.dataCapMb) {
          await tx.radReply.create({
            data: {
              username: code,
              attribute: "Mikrotik-Total-Limit",
              op: "=",
              value: String(pkg.dataCapMb * 1024 * 1024),
            },
          });
        }
        if (pkg.downloadKbps && pkg.uploadKbps) {
          await tx.radReply.create({
            data: {
              username: code,
              attribute: "Mikrotik-Rate-Limit",
              op: "=",
              value: `${pkg.uploadKbps}k/${pkg.downloadKbps}k`,
            },
          });
        }
        // Same reasoning as the M-Pesa hotspot branch: a guest voucher sale is revenue and must
        // exist as a payment, or it never reaches any revenue report. Keyed on the gateway
        // reference, which is unique, so a replayed webhook cannot double-count it.
        const hotspotPayment = await tx.payment.create({
          data: {
            tenantId,
            customerId: null,
            invoiceId: null,
            method: "PAYSTACK",
            status: "COMPLETED",
            amountMinor: transaction.amountMinor,
            currency: transaction.currency,
            reference,
            idempotencyKey: reference,
          },
        });
        paymentId = hotspotPayment.id;
      } else if (transaction.customerId) {
        // 2. Subscriber Invoice Payment or Wallet Top-Up
        // Always the amount WE requested when the transaction was initialized, never the
        // webhook's own reported `data.amount` — same reasoning as the M-Pesa STK path
        // (mpesa/callback.service.ts): trusting a callback's self-reported amount as an override
        // would let a mismatched or forged "success" event credit an arbitrary amount instead of
        // only ever completing the transaction that was actually pending.
        const paymentResult = transaction.invoiceId
          ? await recordPaymentForInvoiceWithDb(tx, tenantId, {
              invoiceId: transaction.invoiceId,
              method: "PAYSTACK",
              amountMinor: transaction.amountMinor,
              reference,
              idempotencyKey: reference,
              // Paystack already collected the funds by the time the webhook lands — see
              // allowOverpayment's doc on why this must never throw/roll back here.
              allowOverpayment: true,
            })
          : await topUpWalletWithDb(tx, tenantId, {
              customerId: transaction.customerId,
              method: "PAYSTACK",
              amountMinor: transaction.amountMinor,
              reference,
              idempotencyKey: reference,
            });
        paymentId = paymentResult.payment.id;
      }

      return tx.paystackTransaction.update({
        where: { id: transaction.id },
        data: {
          status: "COMPLETED",
          gatewayResponse: result.gatewayResponse,
          paymentId,
          hotspotVoucherCode: voucherCode,
          rawWebhook,
        },
      });
    }

    const status = result.status === "abandoned" ? "ABANDONED" : "FAILED";
    return tx.paystackTransaction.update({
      where: { id: transaction.id },
      data: { status, gatewayResponse: result.gatewayResponse, rawWebhook },
    });
  });
}
