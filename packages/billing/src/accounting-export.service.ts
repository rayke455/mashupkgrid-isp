import { prisma } from "@mashupkgrid/database";
import { resolveTenantPreferences, toCsv, type CsvColumn } from "@mashupkgrid/shared";

/**
 * Accounting exports: invoices, payments and customers as the import files QuickBooks Online and
 * Xero expect, for a date range. Invoices are one row per line (both systems group rows by
 * invoice number). Neither system imports customer payments from a file, so payments come as a
 * bank-statement file, which both reconcile against the imported invoices; refunds appear as
 * negative lines on the day they were made.
 */

export type AccountingSystem = "xero" | "quickbooks";
export type AccountingExportKind = "invoices" | "payments" | "contacts";

type Codes = ReturnType<typeof resolveTenantPreferences>["accounting"];

/** The day in the ISP's time zone, day/month/year: what both systems read when the file is set
 *  to a Kenyan (or UK) locale. */
export function ddmmyyyy(d: Date, timeZone = "Africa/Nairobi"): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year}`;
}

const money = (minor: number) => (minor / 100).toFixed(2);

/** Shares the invoice's tax over its lines by amount; the last line takes what rounding leaves. */
export function spreadTax(lineTotals: number[], taxMinor: number): number[] {
  const sum = lineTotals.reduce((a, b) => a + b, 0);
  if (!taxMinor || !sum) return lineTotals.map(() => 0);
  const shares = lineTotals.map((t) => Math.floor((t * taxMinor) / sum));
  shares[shares.length - 1]! += taxMinor - shares.reduce((a, b) => a + b, 0);
  return shares;
}

export interface InvoiceLineRow {
  invoiceNumber: string;
  customerName: string;
  customerNumber: string;
  email: string | null;
  invoiceDate: Date;
  dueDate: Date;
  currency: string;
  description: string;
  quantity: number;
  unitMinor: number;
  lineMinor: number;
  lineTaxMinor: number;
  taxed: boolean;
}

export function invoiceColumns(system: AccountingSystem, codes: Codes, tz = "Africa/Nairobi"): CsvColumn<InvoiceLineRow>[] {
  const day = (d: Date) => ddmmyyyy(d, tz);
  if (system === "xero") {
    return [
      { header: "*ContactName", value: (r) => `${r.customerName} (${r.customerNumber})` },
      { header: "EmailAddress", value: (r) => r.email },
      { header: "*InvoiceNumber", value: (r) => r.invoiceNumber },
      { header: "Reference", value: (r) => r.customerNumber },
      { header: "*InvoiceDate", value: (r) => day(r.invoiceDate) },
      { header: "*DueDate", value: (r) => day(r.dueDate) },
      { header: "*Description", value: (r) => r.description },
      { header: "*Quantity", value: (r) => r.quantity },
      { header: "*UnitAmount", value: (r) => money(r.unitMinor) },
      { header: "*AccountCode", value: () => codes.salesAccountCode },
      { header: "*TaxType", value: (r) => (r.taxed ? codes.taxType : codes.noTaxType) },
      { header: "TaxAmount", value: (r) => money(r.lineTaxMinor) },
      { header: "Currency", value: (r) => r.currency },
    ];
  }
  return [
    { header: "InvoiceNo", value: (r) => r.invoiceNumber },
    { header: "Customer", value: (r) => `${r.customerName} (${r.customerNumber})` },
    { header: "InvoiceDate", value: (r) => day(r.invoiceDate) },
    { header: "DueDate", value: (r) => day(r.dueDate) },
    { header: "Memo", value: (r) => r.customerNumber },
    { header: "Item(Product/Service)", value: () => codes.itemName },
    { header: "ItemDescription", value: (r) => r.description },
    { header: "ItemQuantity", value: (r) => r.quantity },
    { header: "ItemRate", value: (r) => money(r.unitMinor) },
    { header: "ItemAmount", value: (r) => money(r.lineMinor) },
    { header: "ItemTaxCode", value: (r) => (r.taxed ? codes.taxCode : "") },
    { header: "ItemTaxAmount", value: (r) => money(r.lineTaxMinor) },
    { header: "Currency", value: (r) => r.currency },
  ];
}

export interface PaymentRow {
  date: Date;
  amountMinor: number;
  customerName: string;
  customerNumber: string;
  description: string;
  reference: string;
}

export function paymentColumns(system: AccountingSystem, tz = "Africa/Nairobi"): CsvColumn<PaymentRow>[] {
  const day = (d: Date) => ddmmyyyy(d, tz);
  if (system === "xero") {
    return [
      { header: "*Date", value: (r) => day(r.date) },
      { header: "*Amount", value: (r) => money(r.amountMinor) },
      { header: "Payee", value: (r) => `${r.customerName} (${r.customerNumber})` },
      { header: "Description", value: (r) => r.description },
      { header: "Reference", value: (r) => r.reference },
    ];
  }
  // QuickBooks' three-column bank file.
  return [
    { header: "Date", value: (r) => day(r.date) },
    { header: "Description", value: (r) => `${r.customerName} (${r.customerNumber}) ${r.description}${r.reference ? ` ${r.reference}` : ""}` },
    { header: "Amount", value: (r) => money(r.amountMinor) },
  ];
}

export interface ContactRow {
  name: string;
  customerNumber: string;
  email: string | null;
  phone: string;
  address: string | null;
}

export function contactColumns(system: AccountingSystem): CsvColumn<ContactRow>[] {
  if (system === "xero") {
    return [
      { header: "*ContactName", value: (r) => `${r.name} (${r.customerNumber})` },
      { header: "AccountNumber", value: (r) => r.customerNumber },
      { header: "EmailAddress", value: (r) => r.email },
      { header: "PhoneNumber", value: (r) => r.phone },
      { header: "POAddressLine1", value: (r) => r.address },
    ];
  }
  return [
    { header: "Name", value: (r) => `${r.name} (${r.customerNumber})` },
    { header: "Email", value: (r) => r.email },
    { header: "Phone", value: (r) => r.phone },
    { header: "Billing Address", value: (r) => r.address },
    { header: "Account No.", value: (r) => r.customerNumber },
  ];
}

const METHOD: Record<string, string> = { MPESA: "M-Pesa", CASH: "Cash", BANK_TRANSFER: "Bank transfer", MANUAL: "Manual", PAYSTACK: "Card" };

/** Builds one export file for a tenant and date range (`to` is exclusive). */
export async function buildAccountingExport(tenantId: string, system: AccountingSystem, kind: AccountingExportKind, from: Date, to: Date): Promise<{ csv: string; rows: number }> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { preferences: true, timezone: true } });
  const codes = resolveTenantPreferences(tenant.preferences).accounting;

  if (kind === "invoices") {
    const invoices = await prisma.invoice.findMany({
      where: { tenantId, createdAt: { gte: from, lt: to }, status: { notIn: ["DRAFT", "CANCELLED", "VOID"] } },
      include: { items: true, customer: { select: { fullName: true, customerNumber: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
    const rows: InvoiceLineRow[] = [];
    for (const inv of invoices) {
      const items = inv.items.length ? inv.items : [{ description: "Invoice", quantity: 1, unitPriceMinor: inv.subtotalMinor, totalMinor: inv.subtotalMinor }];
      const tax = spreadTax(items.map((i) => i.totalMinor), inv.taxMinor);
      items.forEach((it, idx) =>
        rows.push({
          invoiceNumber: inv.invoiceNumber,
          customerName: inv.customer.fullName,
          customerNumber: inv.customer.customerNumber,
          email: inv.customer.email,
          invoiceDate: inv.createdAt,
          dueDate: inv.dueDate,
          currency: inv.currency,
          description: it.description,
          quantity: it.quantity,
          unitMinor: it.unitPriceMinor,
          lineMinor: it.totalMinor,
          lineTaxMinor: tax[idx] ?? 0,
          taxed: inv.taxMinor > 0,
        })
      );
    }
    return { csv: toCsv(rows, invoiceColumns(system, codes, tenant.timezone)), rows: rows.length };
  }

  if (kind === "payments") {
    const payments = await prisma.payment.findMany({
      where: {
        tenantId,
        method: { not: "WALLET" },
        OR: [
          // A refunded payment is REVERSED now, but the money did come in on its own date.
          { status: { in: ["COMPLETED", "REVERSED"] }, createdAt: { gte: from, lt: to } },
          { reversedAt: { gte: from, lt: to } },
        ],
      },
      include: { customer: { select: { fullName: true, customerNumber: true } }, invoice: { select: { invoiceNumber: true } } },
      orderBy: { createdAt: "asc" },
    });
    const rows: PaymentRow[] = [];
    for (const p of payments) {
      const who = { customerName: p.customer?.fullName ?? "Unknown", customerNumber: p.customer?.customerNumber ?? "" };
      const what = `${METHOD[p.method] ?? p.method}${p.invoice ? ` for ${p.invoice.invoiceNumber}` : " to account credit"}`;
      if (p.createdAt >= from && p.createdAt < to) rows.push({ ...who, date: p.createdAt, amountMinor: p.amountMinor, description: what, reference: p.reference ?? "" });
      if (p.reversedAt && p.reversedAt >= from && p.reversedAt < to) rows.push({ ...who, date: p.reversedAt, amountMinor: -p.amountMinor, description: `Refund of ${what}`, reference: p.reference ?? "" });
    }
    rows.sort((a, b) => a.date.getTime() - b.date.getTime());
    return { csv: toCsv(rows, paymentColumns(system, tenant.timezone)), rows: rows.length };
  }

  const customers = await prisma.customer.findMany({
    where: { tenantId, deletedAt: null },
    select: { fullName: true, customerNumber: true, email: true, phone: true, address: true },
    orderBy: { customerNumber: "asc" },
  });
  const rows = customers.map((c) => ({ name: c.fullName, customerNumber: c.customerNumber, email: c.email, phone: c.phone, address: c.address }));
  return { csv: toCsv(rows, contactColumns(system)), rows: rows.length };
}
