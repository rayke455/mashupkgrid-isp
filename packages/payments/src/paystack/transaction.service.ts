import { prisma, type PaystackTransaction } from "@mashupkgrid/database";
import { env } from "@mashupkgrid/config";
import { ConflictError, NotFoundError, ValidationError, generateSecureToken } from "@mashupkgrid/shared";
import { getPaystackCredentials } from "./config.service.js";
import { initializeTransaction, verifyTransaction, PaystackApiError } from "./paystack-client.js";
import { completePaystackTransaction } from "./webhook.service.js";

export interface InitiatePaystackTransactionInput {
  customerId: string;
  invoiceId?: string | null;
  amountMinor: number;
  currency?: string;
  initiatedByUserId: string;
}

export interface InitiatePaystackTransactionResult {
  transaction: PaystackTransaction;
  authorizationUrl: string;
}

/**
 * Initializes a Paystack transaction and creates the `PaystackTransaction` row as PENDING —
 * mirrors initiateStkPushForCustomer's contract exactly: this function returning successfully
 * means "the customer has somewhere to go pay," never "the payment succeeded." Only a verified
 * webhook (or an explicit verify call) can move the row to COMPLETED.
 */
export async function initiatePaystackTransactionForCustomer(
  tenantId: string,
  input: InitiatePaystackTransactionInput
): Promise<InitiatePaystackTransactionResult> {
  if (input.amountMinor <= 0) throw new ValidationError("Amount must be positive");

  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, tenantId, deletedAt: null },
  });
  if (!customer) throw new NotFoundError("Customer");
  if (!customer.email) {
    throw new ValidationError("This customer has no email on file — Paystack requires one to initialize a transaction");
  }

  if (input.invoiceId) {
    const invoice = await prisma.invoice.findFirst({ where: { id: input.invoiceId, tenantId } });
    if (!invoice) throw new NotFoundError("Invoice");
    if (invoice.customerId !== customer.id) {
      throw new ConflictError("Invoice does not belong to this customer");
    }
    if (invoice.status === "PAID") throw new ConflictError("Invoice is already fully paid");
  }

  const credentials = await getPaystackCredentials(tenantId);
  const currency = input.currency ?? "KES";
  // Paystack references must be unique per integration (effectively globally, since one secret
  // key can back multiple tenants' worth of traffic in principle) — prefixing with the tenant id
  // keeps two tenants' references from ever colliding even if both happen to generate the same
  // random suffix.
  const reference = `${tenantId.slice(0, 8)}-${generateSecureToken(12).replace(/[^a-zA-Z0-9]/g, "")}`;
  const callbackUrl = `${env.APP_API_PUBLIC_URL}/api/v1/payments/paystack/return`;

  // Any real failure here (bad credentials, Paystack rejecting the params, the API being down)
  // is a genuine, expected-to-happen-sometimes external-service error, not a bug in this app —
  // it must reach the caller as a clear message, not fall through to a generic 500 the way an
  // unwrapped PaystackApiError would (it isn't part of this app's own AppError hierarchy, which
  // is the only thing the global error handler recognizes as a client-facing error).
  let response;
  try {
    response = await initializeTransaction({
      credentials,
      email: customer.email,
      amountMinor: input.amountMinor,
      currency,
      reference,
      callbackUrl,
    });
  } catch (err) {
    if (err instanceof PaystackApiError) {
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
      reference: response.reference,
      amountMinor: input.amountMinor,
      currency,
      authorizationUrl: response.authorizationUrl,
      status: "PENDING",
    },
  });

  return { transaction, authorizationUrl: response.authorizationUrl };
}

export interface InitiatePaystackHotspotPurchaseInput {
  hotspotPackageId: string;
  email: string;
  phone?: string;
  linkLoginOnly?: string;
}

export async function initiatePaystackHotspotPurchase(
  tenantId: string,
  input: InitiatePaystackHotspotPurchaseInput
): Promise<InitiatePaystackTransactionResult> {
  const pkg = await prisma.hotspotPackage.findFirst({
    where: { id: input.hotspotPackageId, tenantId, isActive: true },
  });
  if (!pkg) throw new NotFoundError("HotspotPackage");

  const credentials = await getPaystackCredentials(tenantId);
  const currency = pkg.currency || "KES";
  const reference = `HS-${tenantId.slice(0, 6)}-${generateSecureToken(10).replace(/[^a-zA-Z0-9]/g, "")}`;
  const callbackUrl = `${env.APP_API_PUBLIC_URL}/api/v1/payments/paystack/return`;

  let response;
  try {
    response = await initializeTransaction({
      credentials,
      email: input.email.trim(),
      amountMinor: pkg.priceMinor,
      currency,
      reference,
      callbackUrl,
    });
  } catch (err) {
    if (err instanceof PaystackApiError) {
      throw new ConflictError(err.message);
    }
    throw err;
  }

  const transaction = await prisma.paystackTransaction.create({
    data: {
      tenantId,
      hotspotPackageId: pkg.id,
      hotspotLinkLoginOnly: input.linkLoginOnly ?? null,
      hotspotEmail: input.email.trim(),
      hotspotPhone: input.phone?.trim() ?? null,
      reference: response.reference,
      amountMinor: pkg.priceMinor,
      currency,
      authorizationUrl: response.authorizationUrl,
      status: "PENDING",
    },
  });

  return { transaction, authorizationUrl: response.authorizationUrl };
}

export async function getPaystackTransactionOrThrow(tenantId: string, reference: string): Promise<PaystackTransaction> {
  const transaction = await prisma.paystackTransaction.findFirst({ where: { tenantId, reference } });
  if (!transaction) throw new NotFoundError("Paystack transaction");
  return transaction;
}

/**
 * Server-initiated verification — the defensive fallback for a lost/delayed webhook, and what
 * actually resolves the transaction when a customer lands back on `callback_url` (Paystack's
 * redirect carries no signature, so it's a UX hint to check, never a payment confirmation on its
 * own). Safe to call repeatedly: completePaystackTransaction is idempotent on a non-PENDING row.
 *
 * Called from both a staff-facing status check *and* the public return-URL redirect a customer's
 * browser hits right after paying — a transient Paystack failure (verify API down, momentary
 * network blip) must not throw a raw error into that redirect. It's genuinely still "pending, we
 * just couldn't confirm it this instant," not a failed transaction, so this returns the
 * unchanged PENDING row rather than surfacing the failure — the same repeatable job / next
 * webhook delivery gets another chance at it.
 */
export async function verifyAndReconcilePaystackTransaction(
  tenantId: string,
  reference: string
): Promise<PaystackTransaction> {
  const transaction = await getPaystackTransactionOrThrow(tenantId, reference);
  if (transaction.status !== "PENDING") return transaction;

  const credentials = await getPaystackCredentials(tenantId);

  let result;
  try {
    result = await verifyTransaction(credentials, reference);
  } catch (err) {
    if (err instanceof PaystackApiError) return transaction;
    throw err;
  }

  return completePaystackTransaction(tenantId, reference, {
    status: result.status,
    amountMinor: result.amountMinor,
    gatewayResponse: result.gatewayResponse,
    raw: result,
  });
}
