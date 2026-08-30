# Phase 3 — M-Pesa and Payments: Scope Note

Full architecture is in `04-billing-and-payments.md` (§ M-Pesa, § Payment provider abstraction,
§ Reconciliation). This note pins down what actually gets built.

## Builds now

- **`packages/payments`**: `PaymentProviderAdapter` interface (per `04-billing-and-payments.md`)
  with one real implementation — `MpesaAdapter`, talking to Safaricom's Daraja API (OAuth,
  STK Push, STK Push Query, C2B). No other gateway ships in Phase 3; Pesapal/Stripe/PayPal/
  Flutterwave stay documented-but-unbuilt, consistent with §20/§78 (never claim an unbuilt
  integration works).
- **STK Push** (Lipa na M-Pesa Online): staff (Phase 3) initiates a push to a customer's phone
  against a specific invoice or as a wallet top-up. The request only ever creates a `PENDING`
  `MpesaStkRequest` row — a payment is marked `COMPLETED` **only** by the verified Safaricom
  callback or a server-initiated status query, never by the initiating request itself.
- **C2B** (Paybill): Validation + Confirmation webhook endpoints so customers can pay a Paybill
  directly. Confirmed transactions attempt automatic reconciliation (match `BillRefNumber`
  against a customer number or invoice number); unmatched ones land in a reconciliation queue
  for manual matching in the admin UI.
- **Idempotency**: `MpesaStkRequest.checkoutRequestId` and `mpesaReceiptNumber` are both unique.
  A callback replay (Safaricom retries on a slow 200) is detected by looking up the existing
  row before creating anything — it returns the same safe acknowledgment without reprocessing.
- **Credentials**: per-tenant `PaymentProviderConfig` — consumer key/secret and passkey stored
  encrypted at rest (AES-256-GCM via `packages/shared`), never returned to the client once set.
- **Defensive polling**: a worker job queries Safaricom for any `MpesaStkRequest` still
  `PENDING` after 2 minutes — covers a lost/delayed callback (project instruction's explicit
  "delayed callback" test case) without waiting on Safaricom indefinitely.
- **Payment confirmation notifications**: enqueues the existing email queue on a successful
  M-Pesa payment. SMS/WhatsApp notification channels are Phase 5 — not built here.

## Explicitly deferred

Automated refunds (Safaricom's B2C reversal API is a materially different, riskier flow —
`MpesaAdapter.refund()` exists on the interface but throws a clear "not implemented" error
rather than silently doing nothing or pretending to succeed); customer-initiated self-service
STK push from the customer portal (Phase 3 ships staff-initiated only — the customer portal
itself isn't built yet); Till number workflows beyond what Paybill/C2B already covers;
cryptographic verification of inbound Safaricom webhooks (Safaricom's classic Daraja API has no
HMAC signing — validation here is checkoutRequestId/shortcode matching against known records,
documented as a real limitation, not glossed over).
