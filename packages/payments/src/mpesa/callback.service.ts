import { prisma, type MpesaStkRequest, type Prisma } from "@mashupkgrid/database";
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
    if (request.status !== "PENDING") return request;

    const rawCallback = result.raw as Prisma.InputJsonValue;

    if (result.resultCode === 0) {
      const receiptNumber = result.metadata?.mpesaReceiptNumber;
      if (!receiptNumber) {
        // A "successful" callback with no receipt number is malformed — fail closed rather
        // than crediting an amount we can't attribute a Safaricom receipt to.
        return tx.mpesaStkRequest.update({
          where: { id: request.id },
          data: {
            status: "FAILED",
            resultCode: result.resultCode,
            resultDesc: "Malformed success callback: missing MpesaReceiptNumber",
            rawCallback,
          },
        });
      }

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

        return tx.mpesaStkRequest.update({
          where: { id: request.id },
          data: {
            status: "COMPLETED",
            resultCode: result.resultCode,
            resultDesc: result.resultDesc,
            mpesaReceiptNumber: receiptNumber,
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
