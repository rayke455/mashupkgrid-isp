import { describe, it, expect } from "vitest";
import { previousMonth, vatInsideInclusive, vatReportCsv, type VatReport } from "../vat-report.service.js";

describe("VAT maths", () => {
  it("takes 16% VAT out of an inclusive price", () => {
    expect(vatInsideInclusive(11_600, 16)).toBe(1_600);
    expect(vatInsideInclusive(5_000, 16)).toBe(690);
    expect(vatInsideInclusive(5_000, 0)).toBe(0);
  });
  it("defaults to last month", () => {
    expect(previousMonth(new Date("2026-01-15T00:00:00Z"))).toBe("2025-12");
  });
});

describe("VAT CSV", () => {
  it("lists invoices, hotspot sales and a total, quoting names with commas", () => {
    const report: VatReport = {
      month: "2026-09", currency: "KES", vatRegistered: true, kraPin: "P051234567X", standardRatePercent: 16,
      invoiced: { count: 1, taxableMinor: 100_000, vatMinor: 16_000, grossMinor: 116_000, byRate: [] },
      otherSales: { count: 3, netMinor: 25_862, vatMinor: 4_138, grossMinor: 30_000 },
      total: { netMinor: 125_862, vatMinor: 20_138, grossMinor: 146_000 },
      zeroRatedInvoices: 0,
      lines: [{ invoiceNumber: "INV-1", issuedAt: "2026-09-03T08:00:00Z", customerName: "Otieno, Brian", customerNumber: "CUS-2", taxableMinor: 100_000, vatMinor: 16_000, totalMinor: 116_000, ratePercent: 16 }],
    };
    const csv = vatReportCsv(report);
    expect(csv).toContain("Seller KRA PIN,P051234567X");
    expect(csv).toContain('03/09/2026,INV-1,"Otieno, Brian",CUS-2,Internet subscription,1000.00,16,160.00,1160.00');
    expect(csv).toContain("Hotspot and voucher sales,,3 sales, prices include VAT".replace("3 sales, prices include VAT", '"3 sales, prices include VAT"'));
    expect(csv).toContain(",Total,,,1258.62,,201.38,1460.00");
  });
});
