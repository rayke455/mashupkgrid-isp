import { prisma, type PaystackTransaction } from "@mashupkgrid/database";
import { env } from "@mashupkgrid/config";
import { ConflictError, NotFoundError, ValidationError, generateSecureToken } from "@mashupkgrid/shared";
import { getPesapalCredentials } from "./config.service.js";
import { submitPesapalOrder, getPesapalTransactionStatus, PesapalApiError } from "./pesapal-client.js";
import { completePesapalTransaction } from "./webhook.service.js";

export interface InitiatePesapalTransactionInput {
  customerId: string;
  invoiceId?: string | null;
  amountMinor: number;
  currency?: string;
  initiatedByUserId: string;
}

export interface InitiatePesapalTransactionResult {
  transaction: PaystackTransaction;
  redirectUrl: string;
  orderTrackingId: string;
}

/**
 * Initializes a Pesapal payment transaction for a customer invoice or wallet top-up.
 */
export async function initiatePesapalTransactionForCustomer(
  tenantId: string,
  input: InitiatePesapalTransactionInput
): Promise<InitiatePesapalTransactionResult> {
  if (input.amountMinor <= 0) throw new ValidationError("Amount must be positive");

  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, tenantId, deletedAt: null },
  });
  if (!customer) throw new NotFoundError("Customer");
  if (!customer.email) {
    throw new ValidationError("Customer must have an email address on file to pay via Pesapal");
  }

  if (input.invoiceId) {
    const invoice = await prisma.invoice.findFirst({ where: { id: input.invoiceId, tenantId } });
    if (!invoice) throw new NotFoundError("Invoice");
    if (invoice.customerId !== customer.id) {
      throw new ConflictError("Invoice does not belong to this customer");
    }
    if (invoice.status === "PAID") throw new ConflictError("Invoice is already fully paid");
  }

  const credentials = await getPesapalCredentials(tenantId);
  const currency = input.currency ?? "KES";
  const reference = `PESA-${tenantId.slice(0, 6)}-${generateSecureToken(10).replace(/[^a-zA-Z0-9]/g, "")}`;
  const callbackUrl = `${env.APP_API_PUBLIC_URL}/api/v1/payments/pesapal/return`;

  let response;
  try {
    response = await submitPesapalOrder({
      credentials,
      reference,
      amountMinor: input.amountMinor,
      currency,
      description: input.invoiceId ? `Invoice payment #${input.invoiceId.slice(0, 8)}` : "Wallet Top-up",
      callbackUrl,
      notificationId: credentials.ipnId,
      customer: {
        email: customer.email,
        phone: customer.phone,
        firstName: "Customer",
        lastName: customer.customerNumber || "Subscriber",
      },
    });
  } catch (err) {
    if (err instanceof PesapalApiError) {
      throw new ConflictError(err.message);
    }
    throw err;
  }

  const transaction = await prisma.paystackTransaction.create({
    data: {
      tenantId,
      customerId: customer.id,
      invoiceId: input.invoiceId ?? null,
      initiatedByUserId: input.initiatedByUserId,
      reference,
      amountMinor: input.amountMinor,
      currency,
      authorizationUrl: response.redirectUrl,
      status: "PENDING",
    },
  });

  return {
    transaction,
    redirectUrl: response.redirectUrl,
    orderTrackingId: response.orderTrackingId,
  };
}

export interface InitiatePesapalHotspotPurchaseInput {
  hotspotPackageId: string;
  email: string;
  phone?: string | null;
  linkLoginOnly?: string | null;
}

export interface InitiatePesapalHotspotPurchaseResult {
  transaction: PaystackTransaction;
  redirectUrl: string;
  orderTrackingId: string;
}

/**
 * Initializes a Pesapal payment transaction on the Captive Portal for a Hotspot Package.
 */
export async function initiatePesapalHotspotPurchase(
  tenantId: string,
  input: InitiatePesapalHotspotPurchaseInput
): Promise<InitiatePesapalHotspotPurchaseResult> {
  const pkg = await prisma.hotspotPackage.findFirst({
    where: { id: input.hotspotPackageId, tenantId, isActive: true },
  });
  if (!pkg) throw new NotFoundError("Hotspot package");

  const credentials = await getPesapalCredentials(tenantId);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const reference = `PESA-HP-${tenantId.slice(0, 6)}-${generateSecureToken(10).replace(/[^a-zA-Z0-9]/g, "")}`;

  const search = new URLSearchParams({
    pesapal: reference,
    pkg: pkg.id,
  });
  if (input.linkLoginOnly) search.set("link-login-only", input.linkLoginOnly);
  const callbackUrl = `${env.APP_API_PUBLIC_URL}/hotspot/${tenant.slug}?${search.toString()}`;

  let response;
  try {
    response = await submitPesapalOrder({
      credentials,
      reference,
      amountMinor: pkg.priceMinor,
      currency: "KES",
      description: `Wi-Fi Package: ${pkg.name}`,
      callbackUrl,
      notificationId: credentials.ipnId,
      customer: {
        email: input.email.trim(),
        phone: input.phone,
        firstName: "Hotspot",
        lastName: "Guest",
      },
    });
  } catch (err) {
    if (err instanceof PesapalApiError) {
      throw new ConflictError(err.message);
    }
    throw err;
  }

  const transaction = await prisma.paystackTransaction.create({
    data: {
      tenantId,
      hotspotPackageId: pkg.id,
      reference,
      amountMinor: pkg.priceMinor,
      currency: "KES",
      authorizationUrl: response.redirectUrl,
      status: "PENDING",
    },
  });

  return {
    transaction,
    redirectUrl: response.redirectUrl,
    orderTrackingId: response.orderTrackingId,
  };
}

/**
 * Explicitly verifies a Pesapal transaction and reconciles payment.
 */
export async function verifyAndReconcilePesapalTransaction(
  tenantId: string,
  reference: string,
  orderTrackingId?: string
) {
  const transaction = await prisma.paystackTransaction.findUnique({
    where: { reference },
  });
  if (!transaction || transaction.tenantId !== tenantId) {
    throw new NotFoundError("Pesapal transaction");
  }
  if (transaction.status !== "PENDING") {
    return transaction;
  }

  const credentials = await getPesapalCredentials(tenantId);
  // If orderTrackingId is not passed, use reference to query or check
  const trackingId = orderTrackingId || reference;

  let statusRes;
  try {
    statusRes = await getPesapalTransactionStatus(credentials, trackingId);
  } catch {
    return transaction;
  }

  const isCompleted =
    statusRes.paymentStatusDescription.toUpperCase() === "COMPLETED" || statusRes.statusCode === 1;
  const isFailed =
    statusRes.paymentStatusDescription.toUpperCase() === "FAILED" ||
    statusRes.paymentStatusDescription.toUpperCase() === "INVALID" ||
    statusRes.statusCode === 2;

  if (isCompleted) {
    await completePesapalTransaction(tenantId, reference, {
      status: "COMPLETED",
      amountMinor: Math.round(statusRes.amount * 100) || transaction.amountMinor,
      confirmationCode: statusRes.confirmationCode,
      gatewayResponse: `${statusRes.paymentMethod} - ${statusRes.paymentStatusDescription}`,
      raw: statusRes,
    });
  } else if (isFailed) {
    await completePesapalTransaction(tenantId, reference, {
      status: "FAILED",
      amountMinor: transaction.amountMinor,
      confirmationCode: statusRes.confirmationCode,
      gatewayResponse: `${statusRes.paymentMethod} - ${statusRes.paymentStatusDescription}`,
      raw: statusRes,
    });
  }

  return (await prisma.paystackTransaction.findUnique({ where: { reference } })) ?? transaction;
}
