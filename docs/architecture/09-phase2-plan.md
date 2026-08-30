# Phase 2 — Core ISP Billing: Scope Note

Full billing/payment architecture is already documented in `04-billing-and-payments.md`. This
note just pins down what Phase 2 actually builds versus defers, so scope doesn't creep.

## Builds now

- **Customers**: profile, status lifecycle (`ACTIVE/SUSPENDED/PENDING/INSTALLATION/
  DISCONNECTED/CANCELLED/BLACKLISTED`), tenant-scoped CRUD, optional link to a portal `User`.
- **Packages**: rate plans (speed, price, billing cycle, fees), tenant-scoped CRUD.
- **CustomerService**: a customer's subscription to a package (the thing that actually gets
  billed and, in Phase 4, actually provisioned on a router).
- **Billing engine**: invoice + invoice line items, pro-rata first-period calculation, integer
  minor-unit currency fields throughout (never floats), all mutations inside a single Prisma
  `$transaction`.
- **Wallet**: per-customer balance + an append-only transaction ledger (never mutate a balance
  without a corresponding ledger row — the ledger is the source of truth, the cached balance is
  derived from it).
- **Payments — manual only**: staff-recorded cash/bank/wallet payments against an invoice.
  `PaymentProviderAdapter` (per `04-billing-and-payments.md`) is defined now so the shape is
  fixed, but the only adapter implemented is `MANUAL` — no gateway, no M-Pesa. That is Phase 3
  precisely because it needs the callback/idempotency/reconciliation machinery that manual
  entry doesn't.
- **Receipts**: one per completed payment, sequential per-tenant receipt number.
- **Automated billing (worker)**: `generate-invoices` (cycle-boundary invoice creation, one
  idempotent job keyed per `customerService` + billing period so a re-run can never double-bill).
- **Basic reports**: revenue-by-day, outstanding balance — computed from real rows, not cached
  or hard-coded (project instruction §78).

## Explicitly deferred

M-Pesa/any payment gateway, automatic suspension/reactivation tied to billing state (needs
MikroTik/RADIUS from Phase 4 to actually mean something — Phase 2 tracks `CustomerService`
status but doesn't yet enforce it on any network device), credit/debit notes, discounts/coupons,
resellers/commissions, tax rules beyond a flat per-package percentage, PDF generation for
invoices/receipts (records exist; rendering is a later pass).
