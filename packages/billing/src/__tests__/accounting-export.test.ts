import { describe, it, expect } from "vitest";
import { toCsv } from "@mashupkgrid/shared";
import { ddmmyyyy, invoiceColumns, paymentColumns, spreadTax, type InvoiceLineRow } from "../accounting-export.service.js";

const codes = { salesAccountCode: "200", taxType: "16% VAT", noTaxType: "Tax Exempt", itemName: "Internet service", taxCode: "VAT 16%" };
const line: InvoiceLineRow = {
  invoiceNumber: "INV-0000001",
  customerName: "Jane Wanjiku",
  customerNumber: "CUS-000001",
  email: "jane@example.com",
  invoiceDate: new Date("2026-09-26T05:45:00Z"),
  dueDate: new Date("2026-09-30T00:00:00Z"),
  currency: "KES",
  description: "Home 10 Mbps — renewal",
  quantity: 1,
  unitMinor: 600_000,
  lineMinor: 600_000,
  lineTaxMinor: 96_000,
  taxed: true,
};

describe("spreadTax", () => {
  it("splits tax by line amount and keeps the exact total", () => {
    expect(spreadTax([600_000, 50_000], 104_000)).toEqual([96_000, 8_000]);
    const odd = spreadTax([333, 333, 334], 100);
    expect(odd.reduce((a, b) => a + b, 0)).toBe(100);
    expect(spreadTax([100, 200], 0)).toEqual([0, 0]);
  });
});

describe("invoice files", () => {
  it("writes Xero's columns with the ISP's account and tax codes", () => {
    const csv = toCsv([line], invoiceColumns("xero", codes)).replace("﻿", "").split("\r\n");
    expect(csv[0]).toBe("*ContactName,EmailAddress,*InvoiceNumber,Reference,*InvoiceDate,*DueDate,*Description,*Quantity,*UnitAmount,*AccountCode,*TaxType,TaxAmount,Currency");
    expect(csv[1]).toBe("Jane Wanjiku (CUS-000001),jane@example.com,INV-0000001,CUS-000001,26/09/2026,30/09/2026,Home 10 Mbps — renewal,1,6000.00,200,16% VAT,960.00,KES");
  });

  it("writes QuickBooks' columns, with no tax code on untaxed lines", () => {
    const csv = toCsv([{ ...line, taxed: false, lineTaxMinor: 0 }], invoiceColumns("quickbooks", codes)).replace("﻿", "").split("\r\n");
    expect(csv[0]).toBe("InvoiceNo,Customer,InvoiceDate,DueDate,Memo,Item(Product/Service),ItemDescription,ItemQuantity,ItemRate,ItemAmount,ItemTaxCode,ItemTaxAmount,Currency");
    expect(csv[1]).toBe("INV-0000001,Jane Wanjiku (CUS-000001),26/09/2026,30/09/2026,CUS-000001,Internet service,Home 10 Mbps — renewal,1,6000.00,6000.00,,0.00,KES");
  });
});

describe("payment files", () => {
  it("keeps a refund negative rather than treating it as a formula", () => {
    const csv = toCsv([{ date: new Date("2026-09-27T00:00:00Z"), amountMinor: -150_000, customerName: "Jane", customerNumber: "CUS-000001", description: "Refund of M-Pesa", reference: "QAB1" }], paymentColumns("quickbooks"));
    expect(csv).toContain("27/09/2026,Jane (CUS-000001) Refund of M-Pesa QAB1,-1500.00");
  });

  it("formats dates day first, on the ISP's own calendar day", () => {
    expect(ddmmyyyy(new Date("2026-01-05T20:00:00Z"))).toBe("05/01/2026");
    // 01:00 in Nairobi is still the previous day in UTC.
    expect(ddmmyyyy(new Date("2026-01-05T22:00:00Z"))).toBe("06/01/2026");
    expect(ddmmyyyy(new Date("2026-01-05T22:00:00Z"), "UTC")).toBe("05/01/2026");
  });
});
