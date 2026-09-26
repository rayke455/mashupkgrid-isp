import { describe, it, expect, vi } from "vitest";

vi.mock("@mashupkgrid/database", () => ({ prisma: {} }));

import { PDFDocument, StandardFonts } from "pdf-lib";

/** The PDF fonts cover Latin-1 only. Typographic punctuation from package names and customer
 *  names must be mapped or replaced, never allowed to throw and kill an invoice email. */
describe("PDF text sanitising", () => {
  it("draws names with dashes, quotes and emoji without throwing", async () => {
    const mod = await import("../pdf.service.js");
    const safe = (mod as unknown as { __safeForTest?: (s: string) => string }).__safeForTest;
    expect(safe).toBeTypeOf("function");
    const cleaned = safe!("Home 10 Mbps — “first” cycle … José \u{1F600}");
    expect(cleaned).toBe('Home 10 Mbps - "first" cycle ... José ?');
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    expect(() => doc.addPage().drawText(cleaned, { font, size: 10 })).not.toThrow();
  });
});
