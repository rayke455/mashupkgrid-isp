import { prisma } from "@mashupkgrid/database";
import { resolveTenantPreferences } from "@mashupkgrid/shared";

/**
 * The monthly VAT picture an ISP files with KRA. Two kinds of sale:
 *  - Invoiced sales (subscriptions): each invoice carries its own tax, set by the package's rate.
 *  - Other sales with no invoice (hotspot and voucher purchases): the price the buyer paid
 *    includes VAT at the ISP's standard rate, so the VAT is taken out of it.
 * Wallet top-ups are not sales: the money is prepayment for invoices that carry the VAT later.
 * Months are calendar months in the ISP's own timezone.
 */

export interface VatInvoiceLine {
  invoiceNumber: string;
  issuedAt: string;
  customerName: string;
  customerNumber: string;
  taxableMinor: number;
  vatMinor: number;
  totalMinor: number;
  ratePercent: number;
}

export interface VatReport {
  month: string;
  currency: string;
  vatRegistered: boolean;
  kraPin: string;
  standardRatePercent: number;
  invoiced: { count: number; taxableMinor: number; vatMinor: number; grossMinor: number; byRate: { ratePercent: number; count: number; taxableMinor: number; vatMinor: number }[] };
  otherSales: { count: number; netMinor: number; vatMinor: number; grossMinor: number };
  total: { netMinor: number; vatMinor: number; grossMinor: number };
  /** Invoices in the month with no VAT on them, when the ISP is VAT-registered. */
  zeroRatedInvoices: number;
  lines: VatInvoiceLine[];
}

/** VAT inside a VAT-inclusive amount, e.g. 116 at 16% holds 16. */
export function vatInsideInclusive(grossMinor: number, ratePercent: number): number {
  if (!ratePercent) return 0;
  return Math.round((grossMinor * ratePercent) / (100 + ratePercent));
}

export function previousMonth(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getVatReport(tenantId: string, month: string): Promise<VatReport> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Month must look like 2026-09");
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true, currency: true, preferences: true } });
  const tz = tenant.timezone || "Africa/Nairobi";
  const tax = resolveTenantPreferences(tenant.preferences).tax;

  const [invoiceRows, otherRows] = await Promise.all([
    prisma.$queryRaw<{ invoiceNumber: string; issuedAt: Date; fullName: string; customerNumber: string; subtotal: number; discount: number; tax: number; total: number }[]>`
      SELECT i."invoiceNumber", i."issuedAt", c."fullName", c."customerNumber",
             i."subtotalMinor" AS subtotal, i."discountMinor" AS discount, i."taxMinor" AS tax, i."totalMinor" AS total
      FROM invoices i JOIN customers c ON c.id = i."customerId"
      WHERE i."tenantId" = ${tenantId}
        AND i.status NOT IN ('DRAFT', 'VOID', 'CANCELLED')
        AND to_char(i."issuedAt" AT TIME ZONE ${tz}, 'YYYY-MM') = ${month}
      ORDER BY i."issuedAt", i."invoiceNumber"`,
    prisma.$queryRaw<{ count: bigint; gross: bigint | null }[]>`
      SELECT COUNT(*)::bigint AS count, SUM("amountMinor")::bigint AS gross
      FROM payments
      WHERE "tenantId" = ${tenantId} AND status = 'COMPLETED' AND "reversedAt" IS NULL
        AND "invoiceId" IS NULL AND "customerId" IS NULL
        AND to_char("createdAt" AT TIME ZONE ${tz}, 'YYYY-MM') = ${month}`,
  ]);

  const lines: VatInvoiceLine[] = invoiceRows.map((r) => {
    const taxable = r.subtotal - r.discount;
    return {
      invoiceNumber: r.invoiceNumber,
      issuedAt: r.issuedAt.toISOString(),
      customerName: r.fullName,
      customerNumber: r.customerNumber,
      taxableMinor: taxable,
      vatMinor: r.tax,
      totalMinor: r.total,
      ratePercent: taxable > 0 ? Math.round((r.tax / taxable) * 100) : 0,
    };
  });

  const byRate = new Map<number, { ratePercent: number; count: number; taxableMinor: number; vatMinor: number }>();
  for (const l of lines) {
    const row = byRate.get(l.ratePercent) ?? { ratePercent: l.ratePercent, count: 0, taxableMinor: 0, vatMinor: 0 };
    row.count += 1;
    row.taxableMinor += l.taxableMinor;
    row.vatMinor += l.vatMinor;
    byRate.set(l.ratePercent, row);
  }
  const invoiced = {
    count: lines.length,
    taxableMinor: lines.reduce((s, l) => s + l.taxableMinor, 0),
    vatMinor: lines.reduce((s, l) => s + l.vatMinor, 0),
    grossMinor: lines.reduce((s, l) => s + l.totalMinor, 0),
    byRate: [...byRate.values()].sort((a, b) => b.ratePercent - a.ratePercent),
  };

  const otherGross = Number(otherRows[0]?.gross ?? 0);
  const otherVat = tax.vatRegistered ? vatInsideInclusive(otherGross, tax.vatRatePercent) : 0;
  const otherSales = { count: Number(otherRows[0]?.count ?? 0), netMinor: otherGross - otherVat, vatMinor: otherVat, grossMinor: otherGross };

  return {
    month,
    currency: tenant.currency,
    vatRegistered: tax.vatRegistered,
    kraPin: tax.kraPin,
    standardRatePercent: tax.vatRatePercent,
    invoiced,
    otherSales,
    total: {
      netMinor: invoiced.taxableMinor + otherSales.netMinor,
      vatMinor: invoiced.vatMinor + otherSales.vatMinor,
      grossMinor: invoiced.grossMinor + otherSales.grossMinor,
    },
    zeroRatedInvoices: tax.vatRegistered ? lines.filter((l) => l.vatMinor === 0 && l.taxableMinor > 0).length : 0,
    lines,
  };
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const money = (minor: number) => (minor / 100).toFixed(2);

/** One row per invoice, then the hotspot sales and the month's totals, in a layout that maps onto
 *  the sales section of the iTax VAT return. */
export function vatReportCsv(report: VatReport, timeZone = "Africa/Nairobi"): string {
  const rows: (string | number)[][] = [
    ["Seller KRA PIN", report.kraPin || "(not set)"],
    ["Period", report.month],
    [],
    ["Invoice date", "Invoice number", "Customer", "Customer number", "Description", "Taxable value", "VAT rate %", "VAT", "Total"],
    ...report.lines.map((l) => [
      new Date(l.issuedAt).toLocaleDateString("en-GB", { timeZone }),
      l.invoiceNumber,
      l.customerName,
      l.customerNumber,
      "Internet subscription",
      money(l.taxableMinor),
      l.ratePercent,
      money(l.vatMinor),
      money(l.totalMinor),
    ]),
    [],
    ["", "", "Hotspot and voucher sales", "", `${report.otherSales.count} sales, prices include VAT`, money(report.otherSales.netMinor), report.vatRegistered ? report.standardRatePercent : 0, money(report.otherSales.vatMinor), money(report.otherSales.grossMinor)],
    ["", "", "Total", "", "", money(report.total.netMinor), "", money(report.total.vatMinor), money(report.total.grossMinor)],
  ];
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
