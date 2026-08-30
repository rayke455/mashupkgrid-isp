import { prisma, type MpesaStkRequest } from "@mashupkgrid/database";
import { ConflictError, NotFoundError, ValidationError } from "@mashupkgrid/shared";
import { getMpesaCredentials } from "./config.service.js";
import { initiateStkPush, queryStkPushStatus } from "./daraja-client.js";
import { normalizeKenyanPhone } from "./phone.js";
import { completeStkRequest } from "./callback.service.js";
import { buildMpesaCallbackUrl } from "./callback-url.js";

export interface InitiateStkPushInput {
  customerId: string;
  invoiceId?: string | null;
  phone: string;
  amountMinor: number;
  initiatedByUserId: string;
}

/**
 * Initiates an STK Push. Creates the `MpesaStkRequest` row as PENDING — it is only ever moved
 * to COMPLETED/FAILED by the verified callback or a status query, never by this function
 * returning successfully (project instruction §13: never trust the frontend/initiating request
 * to mark a payment successful).
 */
export async function initiateStkPushForCustomer(
  tenantId: string,
  input: InitiateStkPushInput
): Promise<MpesaStkRequest> {
  if (input.amountMinor <= 0) throw new ValidationError("Amount must be positive");

  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, tenantId, deletedAt: null },
  });
  if (!customer) throw new NotFoundError("Customer");

  let accountReference = customer.customerNumber;
  if (input.invoiceId) {
    const invoice = await prisma.invoice.findFirst({ where: { id: input.invoiceId, tenantId } });
    if (!invoice) throw new NotFoundError("Invoice");
    if (invoice.customerId !== customer.id) {
      throw new ConflictError("Invoice does not belong to this customer");
    }
    if (invoice.status === "PAID") throw new ConflictError("Invoice is already fully paid");
    accountReference = invoice.invoiceNumber;
  }

  const credentials = await getMpesaCredentials(tenantId);
  const phone = normalizeKenyanPhone(input.phone);
  const callbackUrl = buildMpesaCallbackUrl();

  const response = await initiateStkPush({
    credentials,
    phone,
    amountMinor: input.amountMinor,
    accountReference,
    transactionDesc: "Internet Payment",
    callbackUrl,
  });

  return prisma.mpesaStkRequest.create({
    data: {
      tenantId,
      customerId: customer.id,
      invoiceId: input.invoiceId ?? null,
      initiatedByUserId: input.initiatedByUserId,
      phone,
      amountMinor: input.amountMinor,
      merchantRequestId: response.MerchantRequestID,
      checkoutRequestId: response.CheckoutRequestID,
      status: "PENDING",
    },
  });
}

export interface InitiateHotspotStkPushInput {
  hotspotPackageId: string;
  phone: string;
}

export async function initiateHotspotPurchaseStkPush(
  tenantId: string,
  input: InitiateHotspotStkPushInput
): Promise<MpesaStkRequest> {
  const pkg = await prisma.hotspotPackage.findFirst({
    where: { id: input.hotspotPackageId, tenantId, isActive: true },
  });
  if (!pkg) throw new NotFoundError("HotspotPackage");

  const credentials = await getMpesaCredentials(tenantId);
  const phone = normalizeKenyanPhone(input.phone);
  const callbackUrl = buildMpesaCallbackUrl();

  const response = await initiateStkPush({
    credentials,
    phone,
    amountMinor: pkg.priceMinor,
    accountReference: `WiFi-${pkg.name.slice(0, 7)}`,
    transactionDesc: `WiFi ${pkg.name}`,
    callbackUrl,
  });

  return prisma.mpesaStkRequest.create({
    data: {
      tenantId,
      hotspotPackageId: pkg.id,
      phone,
      amountMinor: pkg.priceMinor,
      merchantRequestId: response.MerchantRequestID,
      checkoutRequestId: response.CheckoutRequestID,
      status: "PENDING",
    },
  });
}

export async function getStkRequestOrThrow(tenantId: string, checkoutRequestId: string): Promise<MpesaStkRequest> {
  const request = await prisma.mpesaStkRequest.findFirst({ where: { tenantId, checkoutRequestId } });
  if (!request) throw new NotFoundError("STK push request");
  return request;
}

/**
 * Server-initiated status check — the defensive fallback for a lost/delayed callback
 * (docs/architecture/10-phase3-plan.md, project instruction's "delayed callback" test case).
 *
 * Real limitation of Safaricom's STK Push Query API: unlike the callback, it never returns
 * `CallbackMetadata` (no MpesaReceiptNumber) even when `ResultCode` is 0. Without a receipt
 * number we cannot safely create an idempotent Payment record, so a query result of "success"
 * deliberately does **not** auto-complete the request here — it's left PENDING for the real
 * callback (or manual reconciliation) to finish, and the caller is expected to log this case
 * for operator visibility. A definitive failure/cancellation, by contrast, needs no receipt
 * number and is safe to apply immediately.
 */
export async function queryAndReconcileStkRequest(
  tenantId: string,
  checkoutRequestId: string
): Promise<{ request: MpesaStkRequest; unresolvedSuccess: boolean }> {
  const request = await getStkRequestOrThrow(tenantId, checkoutRequestId);
  if (request.status !== "PENDING") return { request, unresolvedSuccess: false };

  const credentials = await getMpesaCredentials(tenantId);
  const result = await queryStkPushStatus(credentials, checkoutRequestId);
  const resultCode = Number(result.ResultCode);

  if (Number.isNaN(resultCode)) return { request, unresolvedSuccess: false }; // still pending

  if (resultCode === 0) {
    return { request, unresolvedSuccess: true };
  }

  const updated = await completeStkRequest(tenantId, checkoutRequestId, {
    resultCode,
    resultDesc: result.ResultDesc,
    metadata: null,
    raw: result,
  });
  return { request: updated, unresolvedSuccess: false };
}
