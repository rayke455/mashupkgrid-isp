import { prisma, type MpesaStkRequest, type Prisma } from "@mashupkgrid/database";
import { creditTenantForPayment } from "../ledger.service.js";
import { NotFoundError, generateSecureToken } from "@mashupkgrid/shared";
import { recordPaymentForInvoiceWithDb, topUpWalletWithDb } from "@mashupkgrid/billing";

interface StkCallbackMetadata {
  amountMinor?: number;
  mpesaReceiptNumber?: string;
  phone?: string;
}

interface StkCallbackItem {
  Name: string;
  Value?: string | number;
}

export function parseCallbackMetadata(items?: StkCallbackItem[]): StkCallbackMetadata {
  const metadata: StkCallbackMetadata = {};
  for (const item of items ?? []) {
    if (item.Name === "Amount" && typeof item.Value === "number") {
      // Daraja reports whole shillings — convert to minor units (cents).
      metadata.amountMinor = Math.round(item.Value * 100);
    }
    if (item.Name === "MpesaReceiptNumber" && typeof item.Value === "string") {
      metadata.mpesaReceiptNumber = item.Value;
    }
    if (item.Name === "PhoneNumber") {
      metadata.phone = String(item.Value);
    }
  }
  return metadata;
}

export interface StkCallbackOutcome {
  handled: boolean;
  checkoutRequestId?: string;
}

/**
 * Entry point for Safaricom's STK callback POST. Per Daraja's documented shape:
 * `{ Body: { stkCallback: { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc,
 * CallbackMetadata?: { Item: [...] } } } }`. Always returns — the route handler acks Safaricom
 * with 200 regardless of `handled`, since Safaricom retries aggressively on non-200 and we've
 * already durably stored what we could parse.
 */
export async function handleStkCallback(rawPayload: unknown): Promise<StkCallbackOutcome> {
  const body = rawPayload as {
    Body?: {
      stkCallback?: {
        CheckoutRequestID?: string;
        ResultCode?: number;
        ResultDesc?: string;
        CallbackMetadata?: { Item?: StkCallbackItem[] };
      };
    };
  };
  const stkCallback = body.Body?.stkCallback;
  if (!stkCallback?.CheckoutRequestID || typeof stkCallback.ResultCode !== "number") {
    return { handled: false };
  }

  const checkoutRequestId = stkCallback.CheckoutRequestID;
  const existing = await prisma.mpesaStkRequest.findUnique({ where: { checkoutRequestId } });
  if (!existing) {
    // Unrecognized CheckoutRequestID — not one we initiated. Ack Safaricom but do nothing else;
    // the raw payload never even reaches storage since there's no row to attach it to.
    return { handled: false, checkoutRequestId };
  }

  const metadata = parseCallbackMetadata(stkCallback.CallbackMetadata?.Item);

  await completeStkRequest(existing.tenantId, checkoutRequestId, {
    resultCode: stkCallback.ResultCode,
    resultDesc: stkCallback.ResultDesc ?? "",
    metadata,
    raw: rawPayload,
  });

  return { handled: true, checkoutRequestId };
}

export interface StkResultInput {
  resultCode: number;
  resultDesc: string;
  metadata: StkCallbackMetadata | null;
  raw: unknown;
}

/**
 * Applies a resolved STK result (from a real callback, or a server-initiated status query) to
 * the `MpesaStkRequest` row and — on success — creates the `Payment` (against the invoice, or
 * as a wallet top-up) atomically in one transaction. Idempotent: a request no longer PENDING is
 * returned as-is rather than reprocessed, which is what makes a duplicate callback delivery
 * safe (project instruction §15).
 */
export async function completeStkRequest(
  tenantId: string,
  checkoutRequestId: string,
  result: StkResultInput
): Promise<MpesaStkRequest> {
  return prisma.$transaction(async (tx) => {
    const request = await tx.mpesaStkRequest.findUnique({ where: { checkoutRequestId } });
    if (!request || request.tenantId !== tenantId) throw new NotFoundError("STK push request");
    // Idempotent: if already completed, check if this is the real Safaricom callback arriving
    // with the official MpesaReceiptNumber to upgrade a provisional receipt (PRV-...) issued
    // during STK query reconciliation.
    if (request.status !== "PENDING") {
      if (
        request.status === "COMPLETED" &&
        result.resultCode === 0 &&
        result.metadata?.mpesaReceiptNumber &&
        request.mpesaReceiptNumber?.startsWith("PRV-")
      ) {
        const realReceipt = result.metadata.mpesaReceiptNumber;
        const updated = await tx.mpesaStkRequest.update({
          where: { id: request.id },
          data: {
            mpesaReceiptNumber: realReceipt,
            rawCallback: result.raw as Prisma.InputJsonValue,
          },
        });
        if (request.paymentId) {
          await tx.payment.update({
            where: { id: request.paymentId },
            data: { reference: realReceipt },
          });
        }
        return updated;
      }
      return request;
    }

    const rawCallback = result.raw as Prisma.InputJsonValue;

    if (result.resultCode === 0) {
      // Use official Safaricom receipt if provided; fallback to deterministic provisional receipt
      // when completed via verified STK push status query (Daraja STK Query API doesn't return CallbackMetadata).
      const receiptNumber =
        result.metadata?.mpesaReceiptNumber ||
        `PRV-${checkoutRequestId.replace(/[^A-Za-z0-9]/g, "").slice(-12).toUpperCase()}`;

      if (request.hotspotPackageId) {
        const pkg = await tx.hotspotPackage.findUniqueOrThrow({
          where: { id: request.hotspotPackageId },
        });

        const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        const rawToken = generateSecureToken(8);
        let code = "";
        for (let i = 0; i < 8; i++) {
          code += CODE_ALPHABET[rawToken.charCodeAt(i % rawToken.length) % CODE_ALPHABET.length];
        }

        const simUse = Math.max(1, pkg.simultaneousUse || 1);
        await tx.hotspotVoucher.create({
          data: {
            tenantId,
            code,
            hotspotPackageId: pkg.id,
            durationMinutes: pkg.durationMinutes,
            dataCapMb: pkg.dataCapMb,
            downloadKbps: pkg.downloadKbps,
            uploadKbps: pkg.uploadKbps,
            simultaneousUse: simUse,
            appPolicy: pkg.appPolicy || "ALL",
            status: "UNUSED",
          },
        });

        await tx.radCheck.create({
          data: { username: code, attribute: "Cleartext-Password", op: ":=", value: code },
        });
        await tx.radCheck.create({
          data: { username: code, attribute: "Simultaneous-Use", op: ":=", value: String(simUse) },
        });
        await tx.radReply.create({
          data: { username: code, attribute: "Port-Limit", op: "=", value: String(simUse) },
        });

        if (pkg.blockTethering) {
          await tx.radReply.create({
            data: { username: code, attribute: "Mikrotik-Address-List", op: "=", value: "mashup-anti-tether" },
          });
        }

        if (pkg.appPolicy && pkg.appPolicy !== "ALL") {
          const norm = pkg.appPolicy.toUpperCase().trim();
          let list = `mashup-client-${norm.toLowerCase().replace(/_only$/, "")}`;
          if (norm === "SOCIAL_BUNDLE") list = "mashup-client-social";
          await tx.radReply.create({
            data: { username: code, attribute: "Mikrotik-Address-List", op: "=", value: list },
          });
        }
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

        // A hotspot sale is revenue and has to be recorded as a payment like any other. This
        // branch used to return without creating one, because payments.customerId was NOT NULL
        // and a guest voucher buyer never becomes a Customer — so every hotspot shilling was
        // invisible to getRevenueByDay, the dashboard total and the revenue chart. On a
        // hotspot-first ISP that was most of the income.
        //
        // Keyed on the M-Pesa receipt, which is unique per payment, so a replayed callback
        // updates nothing rather than double-counting the sale.
        const hotspotPayment = await tx.payment.create({
          data: {
            tenantId,
            customerId: null,
            invoiceId: null,
            method: "MPESA",
            status: "COMPLETED",
            amountMinor: request.amountMinor,
            currency: "KES",
            reference: receiptNumber,
            idempotencyKey: receiptNumber,
          },
        });

        // Only credits tenants on PLATFORM collection — for everyone else this money went
        // straight to their own paybill and there is nothing to owe them.
        await creditTenantForPayment(tx, {
          tenantId,
          paymentId: hotspotPayment.id,
          amountMinor: hotspotPayment.amountMinor,
          currency: hotspotPayment.currency,
          description: "Hotspot voucher sale",
        });

        return tx.mpesaStkRequest.update({
          where: { id: request.id },
          data: {
            status: "COMPLETED",
            resultCode: result.resultCode,
            resultDesc: result.resultDesc,
            mpesaReceiptNumber: receiptNumber,
            paymentId: hotspotPayment.id,
            hotspotVoucherCode: code,
            rawCallback,
          },
        });
      }

      // Always the amount WE requested when the STK push was initiated — never the callback's
      // own claimed CallbackMetadata.Amount. That field is attacker-controlled on a forged
      // callback (there is no signature on this webhook to trust it in the first place; see
      // MPESA_CALLBACK_TOKEN), and even on a genuine one it should exactly match what we asked
      // for — trusting it as an override would let a forged "success" callback credit an
      // arbitrary amount instead of only ever completing the payment that was actually pending.
      const amountMinor = request.amountMinor;
      const paymentResult = request.invoiceId
        ? await recordPaymentForInvoiceWithDb(tx, tenantId, {
            invoiceId: request.invoiceId,
            method: "MPESA",
            amountMinor,
            reference: receiptNumber,
            idempotencyKey: receiptNumber,
            // Safaricom already took this money by the time the callback lands — an amount that
            // no longer fits the invoice's remaining balance (e.g. it was partly paid through
            // another channel in the meantime) must never make this throw and roll back the
            // whole callback, which would silently lose the payment. See allowOverpayment's doc.
            allowOverpayment: true,
          })
        : await topUpWalletWithDb(tx, tenantId, {
            customerId: request.customerId!,
            method: "MPESA",
            amountMinor,
            reference: receiptNumber,
            idempotencyKey: receiptNumber,
          });

      await creditTenantForPayment(tx, {
        tenantId,
        paymentId: paymentResult.payment.id,
        amountMinor: paymentResult.payment.amountMinor,
        currency: paymentResult.payment.currency,
        description: request.invoiceId ? "Invoice payment" : "Wallet top-up",
      });

      return tx.mpesaStkRequest.update({
        where: { id: request.id },
        data: {
          status: "COMPLETED",
          resultCode: result.resultCode,
          resultDesc: result.resultDesc,
          mpesaReceiptNumber: receiptNumber,
          paymentId: paymentResult.payment.id,
          rawCallback,
        },
      });
    }

    // ResultCode 1032 = user cancelled the STK prompt; anything else is a generic failure.
    const status = result.resultCode === 1032 ? "CANCELLED" : "FAILED";
    return tx.mpesaStkRequest.update({
      where: { id: request.id },
      data: { status, resultCode: result.resultCode, resultDesc: result.resultDesc, rawCallback },
    });
  });
}

// ---------------------------------------------------------------------------
// Donation callback handler
// ---------------------------------------------------------------------------

/**
 * Attempts to find and complete a Donation row for an STK callback. Returns true if a matching
 * donation was found (regardless of whether it was updated), false if the CheckoutRequestID does
 * not belong to a donation — so callers can fall through to other tables.
 */
export async function tryCompleteDonationCallback(rawPayload: unknown): Promise<boolean> {
  const body = rawPayload as {
    Body?: {
      stkCallback?: {
        CheckoutRequestID?: string;
        ResultCode?: number;
        ResultDesc?: string;
        CallbackMetadata?: { Item?: StkCallbackItem[] };
      };
    };
  };
  const cb = body.Body?.stkCallback;
  if (!cb?.CheckoutRequestID || typeof cb.ResultCode !== "number") return false;

  const donation = await prisma.donation.findUnique({
    where: { checkoutRequestId: cb.CheckoutRequestID },
  });
  if (!donation) return false;
  // If already completed with a real Safaricom receipt (not provisional DON-...), idempotent return
  if (donation.status === "COMPLETED" && !donation.mpesaReceiptNumber?.startsWith("DON-")) {
    return true;
  }

  const metadata = parseCallbackMetadata(cb.CallbackMetadata?.Item);

  if (cb.ResultCode === 0) {
    const receiptNumber =
      metadata.mpesaReceiptNumber ||
      donation.mpesaReceiptNumber ||
      `DON-${cb.CheckoutRequestID.replace(/[^A-Za-z0-9]/g, "").slice(-12).toUpperCase()}`;

    await prisma.donation.update({
      where: { id: donation.id },
      data: {
        status: "COMPLETED",
        resultCode: cb.ResultCode,
        resultDesc: cb.ResultDesc ?? "The service request is processed successfully.",
        mpesaReceiptNumber: receiptNumber,
        rawCallback: rawPayload as Prisma.InputJsonValue,
      },
    });
  } else {
    // Only update failure if not already completed
    if (donation.status !== "COMPLETED") {
      const status = cb.ResultCode === 1032 ? "CANCELLED" : "FAILED";
      await prisma.donation.update({
        where: { id: donation.id },
        data: {
          status,
          resultCode: cb.ResultCode,
          resultDesc: cb.ResultDesc ?? "",
          rawCallback: rawPayload as Prisma.InputJsonValue,
        },
      });
    }
  }

  return true;
}
