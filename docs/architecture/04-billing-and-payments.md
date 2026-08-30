# Billing, Payment, and M-Pesa Architecture (Phase 2/3 design, documented now)

Not implemented in Phase 1. Documented ahead of time per project instruction §80 so the schema
and service boundaries decided in Phase 1 don't need to be reworked later.

## Billing engine

```
Package (rate plan) -> CustomerService (a customer's active subscription to a package)
  -> BillingCycle job (scheduled, worker) generates an Invoice at the cycle boundary
  -> Invoice has InvoiceItem rows (recurring fee, taxes, discounts, one-off charges)
  -> pro-rata: first invoice after activation mid-cycle is computed as
     (daysRemainingInCycle / totalDaysInCycle) * packagePrice, rounded per tenant currency rule
```

All money fields are stored as integer minor units (cents) — never floating point — with a
`currency` column per tenant. Every invoice/payment mutation runs inside a single Prisma
`$transaction` (project instruction §51): create payment -> update invoice status -> update
wallet/customer balance -> create receipt -> create audit log -> commit; any failure rolls back
the whole chain, so an invoice is never left half-paid.

## Payment provider abstraction

```typescript
interface PaymentProviderAdapter {
  initialize(payment: PaymentIntent): Promise<ProviderInitResult>;
  verify(providerRef: string): Promise<ProviderStatus>;
  handleCallback(rawPayload: unknown, signatureHeaders: Record<string, string>): Promise<VerifiedCallback>;
  refund(paymentId: string, amountMinor: number): Promise<RefundResult>;
}
```

Billing services depend only on this interface, never on `MpesaAdapter`/`StripeAdapter`
directly (project instruction §12) — providers are registered by key (`mpesa`, `pesapal`,
`stripe`, ...) per tenant configuration and resolved at call time.

## M-Pesa

- STK Push for customer-initiated payments; C2B validation/confirmation URLs for Paybill/Till.
- Every inbound callback is persisted verbatim (raw payload + headers) to a `Transaction`-style
  table **before** any business logic runs, so a bug in processing never loses the source record.
- Idempotency: the provider transaction ID (`MpesaReceiptNumber` / `CheckoutRequestID`) is a
  unique constraint. A duplicate callback is detected by that constraint, short-circuited, and
  answered with the same safe "already processed" response — it never creates a second Payment.
- The frontend never marks a payment successful; only the verified callback (checked against
  Safaricom's signature/IP expectations) or an explicit server-side status poll can transition
  `Payment.status`.

## Reconciliation

```
Payment received (phone/reference) -> match to Customer (by phone) -> match to open Invoice
  (oldest-due-first, or explicit reference if the STK request carried an invoice reference)
  -> create Payment + Receipt -> update Invoice/wallet
Unmatched payments land in a "pending reconciliation" queue for manual matching in the admin UI.
```

## Automated billing/suspension jobs (worker, scheduled)

`generate-invoices`, `send-invoice-reminders`, `apply-late-fees`, `suspend-overdue-customers`,
`reactivate-paid-customers` — each is idempotent (keyed by invoice/customer + billing period so
re-running a job never double-charges or double-suspends) and classified `CRITICAL` under the
maintenance job-safety model (`05-maintenance-and-queues.md`).
