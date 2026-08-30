import { prisma, type Prisma } from "@mashupkgrid/database";
import { NotFoundError, generateSecureToken } from "@mashupkgrid/shared";
import { recordPaymentForInvoiceWithDb, topUpWalletWithDb } from "@mashupkgrid/billing";
import { getPesapalCredentials } from "./config.service.js";
import { getPesapalTransactionStatus } from "./pesapal-client.js";

export interface PesapalIpnParams {
  orderTrackingId: string;
  orderMerchantReference: string;
  orderNotificationType?: string;
}

export interface PesapalResultInput {
  status: "COMPLETED" | "FAILED" | "PENDING";
  amountMinor: number;
  confirmationCode: string;
  gatewayResponse: string;
  raw: unknown;
}

/**
 * Handles Pesapal IPN Notification Callback.
 * Verifies with Pesapal server to ensure payload authenticity before applying.
 */
export async function handlePesapalIpn(
  tenantId: string,
  params: PesapalIpnParams
): Promise<{ handled: boolean; reference: string; status: string }> {
  const reference = params.orderMerchantReference;
  const credentials = await getPesapalCredentials(tenantId);

  // Fetch true verified status from Pesapal API
  const statusRes = await getPesapalTransactionStatus(credentials, params.orderTrackingId);

  const isCompleted =
    statusRes.paymentStatusDescription.toUpperCase() === "COMPLETED" || statusRes.statusCode === 1;
  const isFailed =
    statusRes.paymentStatusDescription.toUpperCase() === "FAILED" ||
    statusRes.paymentStatusDescription.toUpperCase() === "INVALID" ||
    statusRes.statusCode === 2;

  const resolvedStatus: "COMPLETED" | "FAILED" | "PENDING" = isCompleted
    ? "COMPLETED"
    : isFailed
    ? "FAILED"
    : "PENDING";

  await completePesapalTransaction(tenantId, reference, {
    status: resolvedStatus,
    amountMinor: Math.round(statusRes.amount * 100),
    confirmationCode: statusRes.confirmationCode,
    gatewayResponse: `${statusRes.paymentMethod} - ${statusRes.paymentStatusDescription}`,
    raw: statusRes,
  });

  return { handled: true, reference, status: resolvedStatus };
}

/**
 * Atomically completes a Pesapal transaction and provisions Hotspot Vouchers (RADIUS) or Invoice Payments.
 */
export async function completePesapalTransaction(
  tenantId: string,
  reference: string,
  result: PesapalResultInput
) {
  return prisma.$transaction(async (tx) => {
    // Check if matching transaction row exists in paystackTransaction or custom table
    const transaction = await tx.paystackTransaction.findUnique({ where: { reference } });
    if (!transaction || transaction.tenantId !== tenantId) {
      // If no matching pending transaction, return safely
      return null;
    }
    if (transaction.status !== "PENDING") return transaction;

    const rawWebhook = result.raw as Prisma.InputJsonValue;

    if (result.status === "COMPLETED") {
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
      } else if (transaction.customerId) {
        // 2. Subscriber Invoice Payment or Wallet Top-Up
        const paymentResult = transaction.invoiceId
          ? await recordPaymentForInvoiceWithDb(tx, tenantId, {
              invoiceId: transaction.invoiceId,
              method: "PAYSTACK" as any,
              amountMinor: transaction.amountMinor,
              reference: result.confirmationCode || reference,
              idempotencyKey: reference,
              allowOverpayment: true,
            })
          : await topUpWalletWithDb(tx, tenantId, {
              customerId: transaction.customerId,
              method: "PAYSTACK" as any,
              amountMinor: transaction.amountMinor,
              reference: result.confirmationCode || reference,
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

    if (result.status === "FAILED") {
      return tx.paystackTransaction.update({
        where: { id: transaction.id },
        data: {
          status: "FAILED",
          gatewayResponse: result.gatewayResponse,
          rawWebhook,
        },
      });
    }

    return transaction;
  });
}
