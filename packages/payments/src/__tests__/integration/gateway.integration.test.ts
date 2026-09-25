import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@mashupkgrid/database";
import { ConflictError, NotFoundError, ValidationError } from "@mashupkgrid/shared";
import { recordPaymentForInvoiceWithDb, refundPaymentWithDb } from "@mashupkgrid/billing";
import { handleStkCallback, completeStkRequest } from "../../mpesa/callback.service.js";
import { handlePlatformC2BConfirmation } from "../../mpesa/c2b.service.js";
import { getTenantBalance } from "../../ledger.service.js";
import {
  requestSettlement,
  applySettlementResult,
  retrySettlement,
  approveSettlement,
  resolveSettlement,
  cancelSettlement,
  markSettlementTimedOut,
  runScheduledSettlements,
} from "../../gateway/settlement.service.js";
import { recordGatewayRefund, completeGatewayRefund, reverseGatewayTransactionForPayment } from "../../gateway/refund.service.js";
import { setActiveDestination } from "../../gateway/destination.service.js";
import { getOrCreateCustomerReference, getOrCreateInvoiceReference } from "../../gateway/payment-reference.service.js";
import { getGatewayTransactionDetail, getSettlementDetail, listGatewayTransactions, listSettlements } from "../../gateway/queries.service.js";
import { runReconciliation } from "../../gateway/reconciliation.service.js";
import {
  integrationEnabled,
  resetDb,
  seedPlatform,
  seedTenant,
  pendingStk,
  stkCallback,
  c2bPayload,
  mockDaraja,
  ledgerFor,
  PLATFORM_SHORTCODE,
} from "./harness.js";

const suite = integrationEnabled ? describe : describe.skip;

async function payInvoice(t: Awaited<ReturnType<typeof seedTenant>>, amountMinor = 100_000, receipt?: string) {
  const checkout = await pendingStk(t, { amountMinor });
  await handleStkCallback(stkCallback(checkout, { receipt, amount: amountMinor / 100 }));
  return prisma.gatewayTransaction.findFirstOrThrow({ where: { providerRequestId: checkout } });
}

suite("payment gateway (real Postgres)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedPlatform();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // 1 · 8 · 7 ------------------------------------------------------------------------------
  it("1. records a successful platform payment: invoice paid, fee deducted, tenant credited the net", async () => {
    const t = await seedTenant("kilele");
    const txn = await payInvoice(t, 100_000, "TIN0000001");

    expect(txn).toMatchObject({ grossMinor: 100_000, feeMinor: 2_000, netMinor: 98_000, status: "COMPLETED", providerReference: "TIN0000001" });
    expect(txn.txnNumber).toMatch(/^TXN-\d{8}-000001$/);

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: t.invoiceId } });
    expect(invoice).toMatchObject({ status: "PAID", amountPaidMinor: 100_000 });

    const ledger = await ledgerFor(t.tenantId);
    expect(ledger.map((e) => [e.entryType, e.direction, e.amountMinor])).toEqual([
      ["CUSTOMER_PAYMENT", "CREDIT", 100_000],
      ["PLATFORM_FEE", "DEBIT", 2_000],
    ]);
    const balance = await getTenantBalance(t.tenantId);
    expect(balance).toMatchObject({ collectedMinor: 100_000, feesMinor: 2_000, availableMinor: 98_000 });
  });

  it("8. never credits the ledger for a push the tenant collected on its OWN paybill", async () => {
    const t = await seedTenant("owncollect", { mode: "OWN" });
    const checkout = await pendingStk(t, { collectedBy: "OWN" });
    await handleStkCallback(stkCallback(checkout));
    expect(await prisma.payment.count({ where: { tenantId: t.tenantId } })).toBe(1);
    expect(await prisma.gatewayTransaction.count()).toBe(0);
    expect(await ledgerFor(t.tenantId)).toHaveLength(0);
  });

  it("8b. credits by who collected at initiation, not the tenant's mode when the callback lands", async () => {
    const t = await seedTenant("switcher");
    const checkout = await pendingStk(t, { collectedBy: "PLATFORM" });
    await prisma.tenant.update({ where: { id: t.tenantId }, data: { collectionMode: "OWN" } });
    await handleStkCallback(stkCallback(checkout));
    expect((await getTenantBalance(t.tenantId)).availableMinor).toBe(98_000);
  });

  it("7. applies a per-tenant fee override and snapshots the rule on the transaction", async () => {
    const t = await seedTenant("override");
    await prisma.tenant.update({ where: { id: t.tenantId }, data: { feePercentBpsOverride: 100, feeFixedMinorOverride: 500 } });
    const txn = await payInvoice(t, 100_000);
    expect(txn).toMatchObject({ feeMinor: 1_500, netMinor: 98_500, feePercentBps: 100, feeFixedMinor: 500 });
    // Changing the platform fee later never rewrites an existing transaction.
    await prisma.platformSettlementSettings.update({ where: { id: "platform" }, data: { feePercentBps: 900 } });
    expect((await prisma.gatewayTransaction.findUniqueOrThrow({ where: { id: txn.id } })).feeMinor).toBe(1_500);
  });

  // 2 · 18 -------------------------------------------------------------------------------------
  it("2. ignores a duplicate callback: second delivery changes no money", async () => {
    const t = await seedTenant("dup");
    const checkout = await pendingStk(t);
    const payload = stkCallback(checkout, { receipt: "TINDUP0001" });
    const first = await handleStkCallback(payload);
    const second = await handleStkCallback(payload);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(await prisma.payment.count({ where: { tenantId: t.tenantId } })).toBe(1);
    expect(await prisma.gatewayTransaction.count()).toBe(1);
    expect(await ledgerFor(t.tenantId)).toHaveLength(2);
    expect((await getTenantBalance(t.tenantId)).availableMinor).toBe(98_000);
  });

  it("18. processes concurrent deliveries of the same callback exactly once", async () => {
    const t = await seedTenant("race");
    const checkout = await pendingStk(t);
    const payload = stkCallback(checkout, { receipt: "TINRACE001" });
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => handleStkCallback(payload)));
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    expect(await prisma.payment.count({ where: { tenantId: t.tenantId } })).toBe(1);
    expect(await prisma.gatewayTransaction.count()).toBe(1);
    expect((await getTenantBalance(t.tenantId)).availableMinor).toBe(98_000);
  });

  it("18b. a status query racing the real callback records the payment once", async () => {
    const t = await seedTenant("query-race");
    const checkout = await pendingStk(t);
    await Promise.allSettled([
      handleStkCallback(stkCallback(checkout, { receipt: "TINREAL001" })),
      completeStkRequest(t.tenantId, checkout, {
        resultCode: 0,
        resultDesc: "ok",
        metadata: { mpesaReceiptNumber: `PRV-${checkout.slice(-12).toUpperCase()}` },
        raw: {},
      }),
    ]);
    expect(await prisma.gatewayTransaction.count()).toBe(1);
    expect((await getTenantBalance(t.tenantId)).availableMinor).toBe(98_000);
  });

  it("upgrades a provisional receipt on the gateway transaction when Safaricom's receipt arrives", async () => {
    const t = await seedTenant("prv");
    const checkout = await pendingStk(t);
    await completeStkRequest(t.tenantId, checkout, { resultCode: 0, resultDesc: "ok", metadata: { mpesaReceiptNumber: "PRV-ABC123" }, raw: {} });
    await handleStkCallback(stkCallback(checkout, { receipt: "TINREAL777" }));
    const txn = await prisma.gatewayTransaction.findFirstOrThrow();
    expect(txn.providerReference).toBe("TINREAL777");
    expect(await ledgerFor(t.tenantId)).toHaveLength(2);
  });

  it("credits the full amount collected on an overpayment (the excess goes to the customer's wallet)", async () => {
    const t = await seedTenant("overpay");
    const txn = await payInvoice(t, 100_050);
    expect(txn).toMatchObject({ grossMinor: 100_050, feeMinor: 2_001, netMinor: 98_049 });
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: txn.paymentId } });
    expect(payment.amountMinor).toBe(100_000);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { customerId: t.customerId } })).balanceMinor).toBe(50);
    expect((await getTenantBalance(t.tenantId)).availableMinor).toBe(98_049);
  });

  it("records a payment for an invoice that was paid meanwhile, instead of losing it", async () => {
    const t = await seedTenant("paid-meanwhile");
    const first = await pendingStk(t);
    const second = await pendingStk(t);
    await handleStkCallback(stkCallback(first));
    await handleStkCallback(stkCallback(second));
    expect(await prisma.payment.count({ where: { tenantId: t.tenantId } })).toBe(2);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { customerId: t.customerId } })).balanceMinor).toBe(100_000);
    expect((await getTenantBalance(t.tenantId)).availableMinor).toBe(196_000);
    const statuses = await prisma.mpesaStkRequest.findMany({ where: { tenantId: t.tenantId }, select: { status: true } });
    expect(statuses.every((r) => r.status === "COMPLETED")).toBe(true);
  });

  it("records a paybill payment against an invoice reference whose invoice is already paid", async () => {
    const t = await seedTenant("c2b-paid");
    const ref = await getOrCreateInvoiceReference(t.tenantId, t.invoiceId);
    await handlePlatformC2BConfirmation(c2bPayload({ amount: 1000, billRef: ref.reference }));
    const { transaction } = await handlePlatformC2BConfirmation(c2bPayload({ amount: 1000, billRef: ref.reference }));
    expect(transaction.reconciled).toBe(true);
    expect((await getTenantBalance(t.tenantId)).availableMinor).toBe(196_000);
  });

  // 3 · 15 ------------------------------------------------------------------------------------
  it("3. records a cancelled or failed payment without creating money", async () => {
    const t = await seedTenant("fail");
    const cancelled = await pendingStk(t);
    const failed = await pendingStk(t);
    await handleStkCallback(stkCallback(cancelled, { resultCode: 1032 }));
    await handleStkCallback(stkCallback(failed, { resultCode: 1 }));
    const statuses = await prisma.mpesaStkRequest.findMany({ where: { tenantId: t.tenantId }, select: { status: true } });
    expect(statuses.map((s) => s.status).sort()).toEqual(["CANCELLED", "FAILED"]);
    expect(await prisma.payment.count()).toBe(0);
    expect(await ledgerFor(t.tenantId)).toHaveLength(0);
  });

  it("15. rejects invalid callbacks: unknown checkout id, malformed body, wrong paybill", async () => {
    expect(await handleStkCallback({ Body: { stkCallback: { CheckoutRequestID: "ws_CO_unknown", ResultCode: 0 } } })).toEqual({
      handled: false,
      checkoutRequestId: "ws_CO_unknown",
    });
    expect(await handleStkCallback({ nonsense: true })).toEqual({ handled: false });
    await expect(handlePlatformC2BConfirmation({ TransID: "X" })).rejects.toBeInstanceOf(ValidationError);
    const t = await seedTenant("c2bforge");
    const ref = await getOrCreateCustomerReference(t.tenantId, t.customerId);
    await expect(
      handlePlatformC2BConfirmation(c2bPayload({ amount: 500, billRef: ref.reference, shortcode: "999999" }))
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await prisma.payment.count()).toBe(0);
  });

  it("uses the amount we requested, never the callback's claimed amount", async () => {
    const t = await seedTenant("forged");
    const checkout = await pendingStk(t, { amountMinor: 100_000 });
    await handleStkCallback(stkCallback(checkout, { amount: 999_999 }));
    expect((await prisma.gatewayTransaction.findFirstOrThrow()).grossMinor).toBe(100_000);
  });

  // 5 -----------------------------------------------------------------------------------------
  it("5. identifies the tenant from the payment reference on the platform paybill", async () => {
    const a = await seedTenant("tenant-a");
    const b = await seedTenant("tenant-b");
    const refB = await getOrCreateInvoiceReference(b.tenantId, b.invoiceId);
    const { transaction, duplicate } = await handlePlatformC2BConfirmation(c2bPayload({ amount: 1000, billRef: refB.reference.toLowerCase() }));
    expect(duplicate).toBe(false);
    expect(transaction).toMatchObject({ tenantId: b.tenantId, reconciled: true, collectedBy: "PLATFORM" });
    expect((await getTenantBalance(b.tenantId)).availableMinor).toBe(98_000);
    expect((await getTenantBalance(a.tenantId)).availableMinor).toBe(0);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: b.invoiceId } })).status).toBe("PAID");

    // Same confirmation again: duplicate, nothing moves.
    const again = await handlePlatformC2BConfirmation({ ...c2bPayload({ amount: 1000, billRef: refB.reference }), TransID: transaction.transactionId });
    expect(again.duplicate).toBe(true);
    expect((await getTenantBalance(b.tenantId)).availableMinor).toBe(98_000);
  });

  it("5b. holds an unrecognised platform paybill payment for assignment instead of guessing", async () => {
    await seedTenant("someone");
    const { transaction } = await handlePlatformC2BConfirmation(c2bPayload({ amount: 750, billRef: "0712345678" }));
    expect(transaction).toMatchObject({ tenantId: null, reconciled: false, paymentId: null });
    expect(await prisma.gatewayTransaction.count()).toBe(0);
    const report = await runReconciliation();
    expect(report.checks.find((c) => c.code === "UNMATCHED_PLATFORM_PAYBILL")?.count).toBe(1);
  });

  // 6 -----------------------------------------------------------------------------------------
  it("6. keeps every tenant query scoped: tenant A cannot read or refund tenant B's records", async () => {
    const a = await seedTenant("scope-a");
    const b = await seedTenant("scope-b");
    const txnB = await payInvoice(b);
    mockDaraja("accept");
    const settlementB = await requestSettlement({ tenantId: b.tenantId, trigger: "TENANT_REQUEST", enforceMinimum: true });

    await expect(getGatewayTransactionDetail(txnB.id, a.tenantId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getSettlementDetail(settlementB.id, a.tenantId)).rejects.toBeInstanceOf(NotFoundError);
    expect((await listGatewayTransactions({ tenantId: a.tenantId })).total).toBe(0);
    expect((await listSettlements({ tenantId: a.tenantId })).total).toBe(0);
    await expect(
      recordGatewayRefund({ gatewayTransactionId: txnB.id, kind: "REFUND", amountMinor: 100, reason: "x", userId: "u", tenantId: a.tenantId })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect((await getTenantBalance(b.tenantId)).pendingSettlementMinor).toBe(98_000);
  });

  // 9 · 10 · 11 · 12 · 19 --------------------------------------------------------------------
  it("9 & 10. creates a settlement, reserves the balance, and settles on provider confirmation", async () => {
    const t = await seedTenant("settle");
    await payInvoice(t, 100_050); // fee 2001 → net 98 049: 49 cents stay behind
    const { calls } = mockDaraja("accept");

    const settlement = await requestSettlement({ tenantId: t.tenantId, trigger: "TENANT_REQUEST", enforceMinimum: true });
    expect(settlement).toMatchObject({ status: "PROCESSING", amountMinor: 98_000, provider: "MPESA_B2B", destinationType: "PAYBILL" });
    expect(settlement.settlementNumber).toMatch(/^STL-\d{8}-000001$/);
    expect(calls[0]!.body).toMatchObject({ CommandID: "BusinessPayBill", Amount: 980, PartyA: PLATFORM_SHORTCODE, PartyB: "888777" });

    let balance = await getTenantBalance(t.tenantId);
    expect(balance).toMatchObject({ availableMinor: 49, pendingSettlementMinor: 98_000, settledMinor: 0 });
    expect((await prisma.gatewayTransaction.findFirstOrThrow()).settlementStatus).toBe("SETTLEMENT_PENDING");

    const result = await applySettlementResult({
      originatorConversationId: settlement.originatorConversationId!,
      resultCode: 0,
      resultDesc: "The service request is processed successfully.",
      transactionId: "RB1234567",
    });
    expect(result.outcome).toBe("PROCESSED");
    expect(result.settlement).toMatchObject({ status: "SETTLED", transactionId: "RB1234567" });
    expect(result.settlement!.providerConfirmedAt).not.toBeNull();
    balance = await getTenantBalance(t.tenantId);
    expect(balance).toMatchObject({ availableMinor: 49, pendingSettlementMinor: 0, settledMinor: 98_000 });
    expect((await prisma.gatewayTransaction.findFirstOrThrow()).settlementStatus).toBe("SETTLED");
    expect((await prisma.settlementDestination.findFirstOrThrow({ where: { tenantId: t.tenantId } })).verificationStatus).toBe("VERIFIED");

    // A replayed result changes nothing — and cannot turn the success into a failure.
    const replay = await applySettlementResult({
      originatorConversationId: settlement.originatorConversationId!,
      resultCode: 2001,
      resultDesc: "late failure",
    });
    expect(replay.outcome).toBe("DUPLICATE");
    expect((await prisma.tenantPayout.findUniqueOrThrow({ where: { id: settlement.id } })).status).toBe("SETTLED");
  });

  it("settles an M-Pesa phone destination through B2C v1, matched by Safaricom's conversation id", async () => {
    const t = await seedTenant("b2c", { destination: "MPESA_PHONE" });
    await payInvoice(t);
    const { calls } = mockDaraja("accept");
    const settlement = await requestSettlement({ tenantId: t.tenantId, trigger: "TENANT_REQUEST", enforceMinimum: true });
    expect(settlement.provider).toBe("MPESA_B2C");
    expect(calls[0]!.url).toContain("/mpesa/b2c/v1/paymentrequest");
    expect(calls[0]!.body).toMatchObject({ CommandID: "BusinessPayment", PartyA: "600111", PartyB: "254722000111", Amount: 980 });
    expect(calls[0]!.body).not.toHaveProperty("OriginatorConversationID");
    // The id Safaricom issued in its acknowledgement is what its result callback will carry.
    expect(settlement.originatorConversationId).toMatch(/^oc-/);
    await applySettlementResult({ originatorConversationId: settlement.originatorConversationId!, resultCode: 0, resultDesc: "ok", transactionId: "RBB2CV1" });
    expect((await prisma.tenantPayout.findUniqueOrThrow({ where: { id: settlement.id } })).status).toBe("SETTLED");
  });

  it("11. fails a settlement on a failed provider result and restores the balance with a reversal entry", async () => {
    const t = await seedTenant("fail-settle");
    await payInvoice(t);
    mockDaraja("accept");
    const settlement = await requestSettlement({ tenantId: t.tenantId, trigger: "AUTOMATIC", enforceMinimum: true });
    const { settlement: failed } = await applySettlementResult({
      originatorConversationId: settlement.originatorConversationId!,
      resultCode: 2001,
      resultDesc: "The initiator information is invalid.",
    });
    expect(failed).toMatchObject({ status: "FAILED", failureReason: "The initiator information is invalid." });
    expect((await getTenantBalance(t.tenantId)).availableMinor).toBe(98_000);
    const ledger = await ledgerFor(t.tenantId);
    // The reservation is still there; a reversal was appended — nothing deleted.
    expect(ledger.map((e) => e.entryType)).toEqual(["CUSTOMER_PAYMENT", "PLATFORM_FEE", "SETTLEMENT", "SETTLEMENT_REVERSAL"]);
    expect((await prisma.gatewayTransaction.findFirstOrThrow()).settlementStatus).toBe("UNSETTLED");
  });

  it("11b. a definite provider rejection fails immediately and restores the balance", async () => {
    const t = await seedTenant("rejected");
    await payInvoice(t);
    mockDaraja("reject");
    const settlement = await requestSettlement({ tenantId: t.tenantId, trigger: "AUTOMATIC", enforceMinimum: true });
    expect(settlement.status).toBe("FAILED");
    expect(settlement.failureReason).toContain("Invalid Initiator");
    expect((await getTenantBalance(t.tenantId)).availableMinor).toBe(98_000);
  });

  it("11c. an unknown outcome (network failure) keeps the balance reserved for review — never auto-restored", async () => {
    const t = await seedTenant("unknown");
    await payInvoice(t);
    mockDaraja("network");
    const settlement = await requestSettlement({ tenantId: t.tenantId, trigger: "AUTOMATIC", enforceMinimum: true });
    expect(settlement.status).toBe("PROCESSING");
    expect(settlement.failureReason).toContain("may or may not have been made");
    expect((await getTenantBalance(t.tenantId)).availableMinor).toBe(0);
    const report = await runReconciliation();
    expect(report.checks.find((c) => c.code === "SETTLEMENT_STUCK")?.count).toBe(1);
  });

  it("a Daraja queue timeout flags the settlement for review and keeps the balance reserved", async () => {
    const t = await seedTenant("timeout");
    await payInvoice(t);
    mockDaraja("accept");
    const settlement = await requestSettlement({ tenantId: t.tenantId, trigger: "AUTOMATIC", enforceMinimum: true });
    const { outcome, settlement: flagged } = await markSettlementTimedOut(settlement.originatorConversationId!);
    expect(outcome).toBe("PROCESSED");
    expect(flagged).toMatchObject({ status: "PROCESSING" });
    expect(flagged!.timedOutAt).not.toBeNull();
    expect((await getTenantBalance(t.tenantId)).availableMinor).toBe(0);
    // A late success result still settles it normally.
    await applySettlementResult({ originatorConversationId: settlement.originatorConversationId!, resultCode: 0, resultDesc: "ok", transactionId: "RBLATE" });
    expect((await prisma.tenantPayout.findUniqueOrThrow({ where: { id: settlement.id } })).status).toBe("SETTLED");
  });

  it("12. retries a failed settlement once, and refuses a second retry", async () => {
    const t = await seedTenant("retry");
    await payInvoice(t);
    mockDaraja("reject");
    const failed = await requestSettlement({ tenantId: t.tenantId, trigger: "AUTOMATIC", enforceMinimum: true });
    mockDaraja("accept");
    const retried = await retrySettlement(failed.id, "admin-user");
    expect(retried).toMatchObject({ status: "PROCESSING", retryOfId: failed.id, amountMinor: 98_000, trigger: "ADMIN" });
    await expect(retrySettlement(failed.id, "admin-user")).rejects.toBeInstanceOf(ConflictError);
    expect((await getTenantBalance(t.tenantId)).availableMinor).toBe(0);
  });

  it("pauses automatic settlements after a failure instead of re-sending every run", async () => {
    const t = await seedTenant("paused");
    await payInvoice(t);
    mockDaraja("reject");
    const failed = await requestSettlement({ tenantId: t.tenantId, trigger: "AUTOMATIC", enforceMinimum: true });
    expect(failed.status).toBe("FAILED");
    mockDaraja("accept");
    await expect(requestSettlement({ tenantId: t.tenantId, trigger: "AUTOMATIC", enforceMinimum: true })).rejects.toThrow(/paused because/);
    expect(await prisma.tenantPayout.count({ where: { tenantId: t.tenantId } })).toBe(1);
    // A person acting resumes it: the tenant's own request goes through, and automatic runs follow.
    const manual = await requestSettlement({ tenantId: t.tenantId, trigger: "TENANT_REQUEST", enforceMinimum: true });
    expect(manual.status).toBe("PROCESSING");
    await applySettlementResult({ originatorConversationId: manual.originatorConversationId!, resultCode: 0, resultDesc: "ok", transactionId: "RBRESUME" });
    await payInvoice(t);
    const next = await requestSettlement({ tenantId: t.tenantId, trigger: "AUTOMATIC", enforceMinimum: true });
    expect(next.status).toBe("PROCESSING");
  });

  it("19. concurrent settlement requests settle the balance exactly once", async () => {
    const t = await seedTenant("concurrent");
    await payInvoice(t);
    mockDaraja("accept");
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => requestSettlement({ tenantId: t.tenantId, trigger: "TENANT_REQUEST", enforceMinimum: true }))
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) if (r.status === "rejected") expect(r.reason).toBeInstanceOf(ConflictError);
    expect(await prisma.tenantPayout.count({ where: { tenantId: t.tenantId } })).toBe(1);
    const balance = await getTenantBalance(t.tenantId);
    expect(balance).toMatchObject({ availableMinor: 0, pendingSettlementMinor: 98_000 });
  });

  it("respects the minimum settlement for automatic runs", async () => {
    await prisma.platformSettlementSettings.update({ where: { id: "platform" }, data: { settlementMinimumMinor: 500_000 } });
    const t = await seedTenant("minimum");
    await payInvoice(t);
    await expect(requestSettlement({ tenantId: t.tenantId, trigger: "AUTOMATIC", enforceMinimum: true })).rejects.toThrow(/below the minimum/);
  });

  it("manual settlement mode holds settlements for approval; approval dispatches them", async () => {
    await prisma.platformSettlementSettings.update({ where: { id: "platform" }, data: { settlementMode: "MANUAL" } });
    const t = await seedTenant("approval");
    await payInvoice(t);
    const { calls } = mockDaraja("accept");
    const held = await requestSettlement({ tenantId: t.tenantId, trigger: "TENANT_REQUEST", enforceMinimum: true });
    expect(held.status).toBe("AWAITING_APPROVAL");
    expect(calls).toHaveLength(0);
    const approved = await approveSettlement(held.id, "admin-user");
    expect(approved).toMatchObject({ status: "PROCESSING", approvedByUserId: "admin-user" });
    expect(calls).toHaveLength(1);
  });

  it("bank settlements are manual: never marked settled without a transfer reference", async () => {
    const t = await seedTenant("bank", { destination: "BANK_ACCOUNT" });
    await payInvoice(t);
    const held = await requestSettlement({ tenantId: t.tenantId, trigger: "TENANT_REQUEST", enforceMinimum: true });
    expect(held).toMatchObject({ status: "AWAITING_APPROVAL", provider: "MANUAL" });
    const approved = await approveSettlement(held.id, "admin-user");
    expect(approved.status).toBe("PROCESSING");
    await expect(resolveSettlement(held.id, { outcome: "SETTLED", notes: "sent" }, "admin-user")).rejects.toBeInstanceOf(ValidationError);
    const settled = await resolveSettlement(held.id, { outcome: "SETTLED", reference: "EQ-TRF-9981", notes: "RTGS" }, "admin-user");
    expect(settled).toMatchObject({ status: "SETTLED", transactionId: "EQ-TRF-9981", resolvedByUserId: "admin-user" });
    expect(settled.providerConfirmedAt).toBeNull(); // a person's confirmation, not the provider's
  });

  it("cancelling a queued settlement restores the balance; a processing one cannot be cancelled", async () => {
    await prisma.platformSettlementSettings.update({ where: { id: "platform" }, data: { settlementMode: "MANUAL" } });
    const t = await seedTenant("cancel");
    await payInvoice(t);
    const held = await requestSettlement({ tenantId: t.tenantId, trigger: "TENANT_REQUEST", enforceMinimum: true });
    await cancelSettlement(held.id, "Tenant asked to hold", "admin-user");
    expect((await getTenantBalance(t.tenantId)).availableMinor).toBe(98_000);

    mockDaraja("accept");
    const next = await requestSettlement({ tenantId: t.tenantId, trigger: "TENANT_REQUEST", enforceMinimum: true });
    const processing = await approveSettlement(next.id, "admin-user");
    await expect(cancelSettlement(processing.id, "too late", "admin-user")).rejects.toBeInstanceOf(ConflictError);
  });

  it("runs a scheduled settlement slot only once, even if two workers fire", async () => {
    await prisma.platformSettlementSettings.update({ where: { id: "platform" }, data: { settlementFrequency: "DAILY", settlementHourEat: 0 } });
    const t = await seedTenant("scheduled");
    await payInvoice(t);
    mockDaraja("accept");
    const [r1, r2] = await Promise.all([runScheduledSettlements(), runScheduledSettlements()]);
    expect([r1.created, r2.created].sort()).toEqual([0, 1]);
    const third = await runScheduledSettlements();
    expect(third).toMatchObject({ ran: false, reason: "Not due yet" });
    expect(await prisma.tenantPayout.count()).toBe(1);
  });

  // 4 · 13 · 14 ------------------------------------------------------------------------------
  it("4. reverses a payment: ledger unwinds with the fee returned, invoice reopens, history kept", async () => {
    const t = await seedTenant("reverse");
    const txn = await payInvoice(t);
    const { refund, transaction } = await recordGatewayRefund({
      gatewayTransactionId: txn.id,
      kind: "REVERSAL",
      reason: "Safaricom reversal requested by customer",
      moneyAlreadyReturned: true,
      externalReference: "SAF-REV-1",
      userId: "admin-user",
    });
    expect(refund).toMatchObject({ amountMinor: 100_000, feeReturnedMinor: 2_000, status: "COMPLETED" });
    expect(refund.refundNumber).toMatch(/^RFD-\d{8}-000001$/);
    expect(transaction).toMatchObject({ status: "REVERSED", refundedMinor: 100_000 });
    expect((await getTenantBalance(t.tenantId)).availableMinor).toBe(0);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: txn.paymentId } })).status).toBe("REVERSED");
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: t.invoiceId } })).status).toBe("PENDING");
    const ledger = await ledgerFor(t.tenantId);
    expect(ledger.map((e) => [e.entryType, e.direction, e.amountMinor])).toEqual([
      ["CUSTOMER_PAYMENT", "CREDIT", 100_000],
      ["PLATFORM_FEE", "DEBIT", 2_000],
      ["PAYMENT_REVERSAL", "DEBIT", 100_000],
      ["FEE_REVERSAL", "CREDIT", 2_000],
    ]);
    await expect(
      recordGatewayRefund({ gatewayTransactionId: txn.id, kind: "REVERSAL", reason: "again", userId: "admin-user" })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("13 & 14. partial refunds return a proportional fee and total exactly the whole fee", async () => {
    const t = await seedTenant("partial");
    const txn = await payInvoice(t);
    const first = await recordGatewayRefund({ gatewayTransactionId: txn.id, kind: "REFUND", amountMinor: 30_000, reason: "Overpaid", userId: "admin" });
    expect(first.refund).toMatchObject({ feeReturnedMinor: 600, status: "PENDING_CUSTOMER_PAYOUT" });
    expect(first.transaction.status).toBe("PARTIALLY_REFUNDED");
    await expect(
      recordGatewayRefund({ gatewayTransactionId: txn.id, kind: "REFUND", amountMinor: 70_001, reason: "too much", userId: "admin" })
    ).rejects.toBeInstanceOf(ValidationError);
    const second = await recordGatewayRefund({ gatewayTransactionId: txn.id, kind: "REFUND", amountMinor: 70_000, reason: "Rest", userId: "admin" });
    expect(second.refund.feeReturnedMinor).toBe(1_400);
    expect(second.transaction).toMatchObject({ status: "REFUNDED", refundedMinor: 100_000 });
    expect((await getTenantBalance(t.tenantId)).availableMinor).toBe(0);
    // The invoice itself is untouched by a refund.
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: t.invoiceId } })).status).toBe("PAID");

    const done = await completeGatewayRefund(first.refund.id, "SBK123REFUND", "admin");
    expect(done.status).toBe("COMPLETED");
    await expect(completeGatewayRefund(first.refund.id, "again", "admin")).rejects.toBeInstanceOf(ConflictError);
  });

  it("a tenant-side payment reversal now also comes off the tenant's balance", async () => {
    const t = await seedTenant("tenant-reverse");
    const txn = await payInvoice(t);
    await prisma.$transaction(async (tx) => {
      await refundPaymentWithDb(tx, t.tenantId, txn.paymentId, "Customer disputed");
      await reverseGatewayTransactionForPayment(tx, { tenantId: t.tenantId, paymentId: txn.paymentId, reason: "Customer disputed", userId: "staff" });
    });
    expect((await getTenantBalance(t.tenantId)).availableMinor).toBe(0);
    const refund = await prisma.gatewayRefund.findFirstOrThrow();
    // The platform is holding that customer's money — someone still has to pay it back.
    expect(refund.status).toBe("PENDING_CUSTOMER_PAYOUT");
  });

  it("a refund of money already settled leaves a negative balance, shown in reconciliation", async () => {
    const t = await seedTenant("negative");
    const txn = await payInvoice(t);
    mockDaraja("accept");
    const s = await requestSettlement({ tenantId: t.tenantId, trigger: "AUTOMATIC", enforceMinimum: true });
    await applySettlementResult({ originatorConversationId: s.originatorConversationId!, resultCode: 0, resultDesc: "ok", transactionId: "RB1" });
    await recordGatewayRefund({ gatewayTransactionId: txn.id, kind: "REFUND", amountMinor: 50_000, reason: "Refund", userId: "admin" });
    expect((await getTenantBalance(t.tenantId)).availableMinor).toBe(-49_000);
    await expect(requestSettlement({ tenantId: t.tenantId, trigger: "TENANT_REQUEST", enforceMinimum: true })).rejects.toBeInstanceOf(ConflictError);
    expect((await runReconciliation()).checks.find((c) => c.code === "NEGATIVE_BALANCE")?.count).toBe(1);
  });

  // 17 ----------------------------------------------------------------------------------------
  it("17. changing the destination replaces it; in-flight settlements keep the destination they used", async () => {
    const t = await seedTenant("dest");
    await payInvoice(t);
    mockDaraja("accept");
    const inFlight = await requestSettlement({ tenantId: t.tenantId, trigger: "TENANT_REQUEST", enforceMinimum: true });

    const { before, after } = await setActiveDestination(
      t.tenantId,
      { type: "MPESA_PHONE", accountName: "Jane Wanjiku", phone: "0722 000 222" },
      "tenant-admin"
    );
    expect(before?.type).toBe("PAYBILL");
    expect(after).toMatchObject({ type: "MPESA_PHONE", phone: "254722000222", isActive: true, verificationStatus: "UNVERIFIED" });
    const all = await prisma.settlementDestination.findMany({ where: { tenantId: t.tenantId } });
    expect(all.filter((d) => d.isActive)).toHaveLength(1);
    expect((await prisma.tenantPayout.findUniqueOrThrow({ where: { id: inFlight.id } })).destinationId).toBe(before!.id);

    await expect(
      setActiveDestination(t.tenantId, { type: "MPESA_PHONE", accountName: "Jane", phone: "12345" }, "tenant-admin")
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      setActiveDestination(t.tenantId, { type: "PAYBILL", accountName: "Jane", paybillNumber: "12" }, "tenant-admin")
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("encrypts bank account numbers at rest and never returns them", async () => {
    const t = await seedTenant("bankdest", { destination: null });
    const { after } = await setActiveDestination(
      t.tenantId,
      { type: "BANK_ACCOUNT", accountName: "Bank Co", bankName: "KCB", bankBranch: "Moi Avenue", bankAccountNumber: "1122334455" },
      "tenant-admin"
    );
    expect(after.bankAccountNumberEncrypted).not.toContain("1122334455");
    expect(after.bankAccountLast4).toBe("4455");
  });

  // 20 ----------------------------------------------------------------------------------------
  it("20. reconciliation finds payments not credited, credits without collection, and reversed-but-credited", async () => {
    const t = await seedTenant("recon");
    // (a) A platform STK payment recorded against the invoice but never credited.
    const checkout = await pendingStk(t);
    await prisma.$transaction(async (tx) => {
      const { payment } = await recordPaymentForInvoiceWithDb(tx, t.tenantId, {
        invoiceId: t.invoiceId,
        method: "MPESA",
        amountMinor: 100_000,
        reference: "TINNOCREDIT",
        idempotencyKey: "TINNOCREDIT",
      });
      await tx.mpesaStkRequest.update({
        where: { checkoutRequestId: checkout },
        data: { status: "COMPLETED", paymentId: payment.id, mpesaReceiptNumber: "TINNOCREDIT" },
      });
    });
    // (b) A legacy-style credit with no gateway transaction (e.g. the old Paystack bug).
    await prisma.tenantLedgerEntry.create({
      data: {
        tenantId: t.tenantId,
        direction: "CREDIT",
        entryType: "CUSTOMER_PAYMENT",
        amountMinor: 5_000,
        description: "Invoice payment",
        sourceType: "Payment",
        sourceId: "legacy-paystack-payment",
      },
    });
    // (c) A billing reversal done without reversing the gateway transaction.
    const t2 = await seedTenant("recon2");
    const txn = await payInvoice(t2);
    await prisma.$transaction((tx) => refundPaymentWithDb(tx, t2.tenantId, txn.paymentId, "disputed"));

    const report = await runReconciliation();
    const byCode = Object.fromEntries(report.checks.map((c) => [c.code, c]));
    expect(byCode["PAYMENT_NOT_CREDITED"]).toMatchObject({ count: 1, amountMinor: 100_000 });
    expect(byCode["CREDIT_WITHOUT_PLATFORM_COLLECTION"]).toMatchObject({ count: 1, amountMinor: 5_000 });
    expect(byCode["REVERSED_PAYMENT_STILL_CREDITED"]).toMatchObject({ count: 1, amountMinor: 100_000 });
    expect(byCode["LEDGER_INCOMPLETE"]!.count).toBe(0);
    expect(byCode["SETTLEMENT_LEDGER_MISMATCH"]!.count).toBe(0);
  });

  it("the ledger and transactions cannot be edited or deleted, even directly", async () => {
    const t = await seedTenant("immutable");
    const txn = await payInvoice(t);
    const [entry] = await ledgerFor(t.tenantId);
    await expect(prisma.tenantLedgerEntry.update({ where: { id: entry!.id }, data: { amountMinor: 1 } })).rejects.toThrow(/append-only/);
    await expect(prisma.tenantLedgerEntry.delete({ where: { id: entry!.id } })).rejects.toThrow(/append-only/);
    await expect(prisma.gatewayTransaction.update({ where: { id: txn.id }, data: { netMinor: 99_999, feeMinor: 1 } })).rejects.toThrow(/immutable/);
  });

  it("refuses new platform collections while the gateway is switched off", async () => {
    await prisma.platformSettlementSettings.update({ where: { id: "platform" }, data: { gatewayEnabled: false } });
    const t = await seedTenant("disabled");
    const { initiateStkPushForCustomer } = await import("../../mpesa/stk.service.js");
    await expect(
      initiateStkPushForCustomer(t.tenantId, { customerId: t.customerId, invoiceId: t.invoiceId, phone: "0712345678", amountMinor: 100_000, initiatedByUserId: null })
    ).rejects.toThrow(/switched off/);
  });
});
