import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import { prisma } from "@mashupkgrid/database";
import { encryptAtRest } from "@mashupkgrid/shared";
import { invalidatePlatformConfigCache } from "../../mpesa/platform-config.service.js";

/**
 * Real-Postgres test harness for the payment gateway. These tests exist because the guarantees
 * that matter most — a replayed callback never pays twice, two settlements never share a balance,
 * the ledger never changes — live in database constraints, row locks and triggers that an
 * in-memory mock cannot reproduce.
 *
 * Runs only when TEST_DATABASE_URL is set, and refuses any database whose name does not end in
 * "_test": resetDb() truncates every tenant.
 */

export const integrationEnabled = Boolean(process.env["TEST_DATABASE_URL"]);

export function assertTestDatabase(): void {
  const url = process.env["DATABASE_URL"] ?? "";
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!dbName.endsWith("_test")) {
    throw new Error(`Refusing to run destructive integration tests against "${dbName}" — the database name must end in _test.`);
  }
}

const KEY = process.env["ENCRYPTION_KEY"]!;
export const PLATFORM_SHORTCODE = "600000";

export async function resetDb(): Promise<void> {
  assertTestDatabase();
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "tenants", "platform_mpesa_config", "platform_settlement_settings", "payment_webhook_events", "mpesa_c2b_transactions" RESTART IDENTITY CASCADE`
  );
  for (const seq of ["gateway_txn_number_seq", "settlement_number_seq", "gateway_refund_number_seq"]) {
    await prisma.$executeRawUnsafe(`ALTER SEQUENCE "${seq}" RESTART`);
  }
  invalidatePlatformConfigCache();
  vi.unstubAllGlobals();
}

export async function seedPlatform(
  opts: {
    feePercentBps?: number;
    feeFixedMinor?: number;
    settlementMode?: "AUTOMATIC" | "MANUAL";
    settlementFrequency?: "INSTANT" | "DAILY" | "WEEKLY" | "MANUAL";
    settlementMinimumMinor?: number;
    gatewayEnabled?: boolean;
  } = {}
): Promise<void> {
  await prisma.platformMpesaConfig.create({
    data: {
      id: "platform",
      isActive: true,
      consumerKeyEncrypted: encryptAtRest("consumer-key", KEY),
      consumerSecretEncrypted: encryptAtRest("consumer-secret", KEY),
      passkeyEncrypted: encryptAtRest("passkey", KEY),
      shortcode: PLATFORM_SHORTCODE,
      environment: "sandbox",
      initiatorName: "b2b-api-user",
      initiatorCredentialEncrypted: encryptAtRest("b2b-security-credential", KEY),
      b2cShortcode: "600111",
      b2cInitiatorName: "b2c-api-user",
      b2cInitiatorCredentialEncrypted: encryptAtRest("b2c-security-credential", KEY),
    },
  });
  await prisma.platformSettlementSettings.create({
    data: {
      id: "platform",
      gatewayEnabled: opts.gatewayEnabled ?? true,
      feePercentBps: opts.feePercentBps ?? 200,
      feeFixedMinor: opts.feeFixedMinor ?? 0,
      settlementMode: opts.settlementMode ?? "AUTOMATIC",
      settlementFrequency: opts.settlementFrequency ?? "MANUAL",
      settlementMinimumMinor: opts.settlementMinimumMinor ?? 100,
    },
  });
  invalidatePlatformConfigCache();
}

export interface SeededTenant {
  tenantId: string;
  customerId: string;
  invoiceId: string;
  invoiceNumber: string;
}

let invoiceCounter = 0;

export async function seedTenant(
  slug: string,
  opts: { mode?: "OWN" | "PLATFORM"; invoiceTotalMinor?: number; destination?: "PAYBILL" | "TILL" | "MPESA_PHONE" | "BANK_ACCOUNT" | null } = {}
): Promise<SeededTenant> {
  const tenant = await prisma.tenant.create({
    data: { name: `${slug} ISP`, slug, collectionMode: opts.mode ?? "PLATFORM" },
  });
  const customer = await prisma.customer.create({
    data: {
      tenantId: tenant.id,
      customerNumber: `CUS-${slug}`,
      fullName: "John Kamau",
      phone: "254712345678",
      status: "ACTIVE",
    },
  });
  await prisma.wallet.create({ data: { customerId: customer.id } });
  const total = opts.invoiceTotalMinor ?? 100_000;
  const invoiceNumber = `INV-${slug}-${++invoiceCounter}`;
  const invoice = await prisma.invoice.create({
    data: {
      tenantId: tenant.id,
      customerId: customer.id,
      invoiceNumber,
      subtotalMinor: total,
      totalMinor: total,
      dueDate: new Date(Date.now() + 7 * 86_400_000),
    },
  });
  const destination = opts.destination === undefined ? "PAYBILL" : opts.destination;
  if (destination) {
    await prisma.settlementDestination.create({
      data: {
        tenantId: tenant.id,
        type: destination,
        accountName: `${slug} Ltd`,
        ...(destination === "PAYBILL" ? { paybillNumber: "888777", paybillAccountReference: slug } : {}),
        ...(destination === "TILL" ? { tillNumber: "123456" } : {}),
        ...(destination === "MPESA_PHONE" ? { phone: "254722000111" } : {}),
        ...(destination === "BANK_ACCOUNT"
          ? { bankName: "Equity Bank", bankAccountNumberEncrypted: encryptAtRest("0123456789", KEY), bankAccountLast4: "6789" }
          : {}),
      },
    });
  }
  return { tenantId: tenant.id, customerId: customer.id, invoiceId: invoice.id, invoiceNumber };
}

/** A PENDING STK push as initiateStkPushForCustomer would have left it. */
export async function pendingStk(
  t: SeededTenant,
  opts: { amountMinor?: number; collectedBy?: "OWN" | "PLATFORM"; invoice?: boolean } = {}
): Promise<string> {
  const checkoutRequestId = `ws_CO_${randomUUID()}`;
  await prisma.mpesaStkRequest.create({
    data: {
      tenantId: t.tenantId,
      customerId: t.customerId,
      invoiceId: opts.invoice === false ? null : t.invoiceId,
      phone: "254712345678",
      amountMinor: opts.amountMinor ?? 100_000,
      merchantRequestId: `m-${randomUUID()}`,
      checkoutRequestId,
      status: "PENDING",
      collectedBy: opts.collectedBy ?? "PLATFORM",
    },
  });
  return checkoutRequestId;
}

export function stkCallback(checkoutRequestId: string, opts: { resultCode?: number; receipt?: string; amount?: number } = {}) {
  const resultCode = opts.resultCode ?? 0;
  return {
    Body: {
      stkCallback: {
        MerchantRequestID: "m",
        CheckoutRequestID: checkoutRequestId,
        ResultCode: resultCode,
        ResultDesc: resultCode === 0 ? "The service request is processed successfully." : "Request cancelled by user",
        ...(resultCode === 0
          ? {
              CallbackMetadata: {
                Item: [
                  { Name: "Amount", Value: opts.amount ?? 1000 },
                  { Name: "MpesaReceiptNumber", Value: opts.receipt ?? `TIN${randomUUID().slice(0, 7).toUpperCase()}` },
                  { Name: "PhoneNumber", Value: 254712345678 },
                ],
              },
            }
          : {}),
      },
    },
  };
}

export function c2bPayload(opts: { transId?: string; amount: number; billRef: string; shortcode?: string }) {
  return {
    TransactionType: "Pay Bill",
    TransID: opts.transId ?? `TC2${randomUUID().slice(0, 7).toUpperCase()}`,
    TransTime: "20260923101500",
    TransAmount: String(opts.amount),
    BusinessShortCode: opts.shortcode ?? PLATFORM_SHORTCODE,
    BillRefNumber: opts.billRef,
    MSISDN: "254712345678",
  };
}

/**
 * Stands in for Safaricom. `mode` decides how the B2B/B2C money call answers: accepted, refused
 * (Safaricom responded "no" — nothing moved), or a network failure (outcome unknown).
 */
export function mockDaraja(mode: "accept" | "reject" | "network" = "accept") {
  let n = 0;
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/oauth/")) {
      return new Response(JSON.stringify({ access_token: "token", expires_in: "3599" }), { status: 200 });
    }
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ url, body });
    if (mode === "network") throw new TypeError("fetch failed: socket hang up");
    if (mode === "reject") {
      return new Response(JSON.stringify({ errorCode: "400.002.02", errorMessage: "Bad Request - Invalid Initiator" }), { status: 400 });
    }
    n += 1;
    return new Response(
      JSON.stringify({
        ConversationID: `AG_${n}`,
        OriginatorConversationID: (body["OriginatorConversationID"] as string) ?? `oc-${n}-${randomUUID()}`,
        ResponseCode: "0",
        ResponseDescription: "Accept the service request successfully.",
      }),
      { status: 200 }
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls };
}

export async function ledgerFor(tenantId: string) {
  return prisma.tenantLedgerEntry.findMany({ where: { tenantId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
}
